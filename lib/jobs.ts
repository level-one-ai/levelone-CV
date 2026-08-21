import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { filterJob } from "@/lib/job-filter";
import { scoreJob, type JobScore } from "@/lib/job-score";
import { COLLECTIONS, describePocketBaseError } from "@/lib/pocketbase";
import type { ScrapedJob } from "@/lib/scraper";
import { keepRemoteJob } from "@/lib/uk-location";
import type { MasterCv } from "@/lib/types";

/**
 * Turning scraped adverts into stored, scored jobs.
 *
 * The scrape itself is in `lib/scraper.ts`, the rules in `lib/job-filter.ts`
 * and `lib/job-score.ts`. This is the part that talks to PocketBase.
 */

/**
 * The three states a scraped job can be in.
 *
 * These strings are stored in a PocketBase SELECT field, which rejects any
 * value not in its option list — so they must match the options exactly,
 * capitals included. `npm run setup:pocketbase` configures the field with these
 * three and warns if an existing one is missing any.
 */
export const JOB_STATUSES = ["Scraped", "Applied", "Dismissed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Reads a stored status back, tolerantly.
 *
 * Case-insensitive so a row typed by hand as "scraped" still loads, and
 * anything unrecognised falls back to Scraped rather than vanishing from every
 * view — a job with a odd status should still be visible somewhere.
 */
export function asJobStatus(value: unknown): JobStatus {
  const text = String(value ?? "").trim().toLowerCase();
  return (
    JOB_STATUSES.find((status) => status.toLowerCase() === text) ?? "Scraped"
  );
}

export interface StoredJob {
  id: string;
  job_url: string;
  source: string;
  title: string;
  company: string;
  location: string;
  job_type: string;
  date_posted: string;
  salary_text: string;
  job_level: string;
  company_industry: string;
  company_num_employees: string;
  description: string;
  is_remote: boolean;
  score: number;
  tier: string;
  score_reasons: JobScore | null;
  status: JobStatus;
  application: string;
  created: string;
}

export interface ScrapeSummary {
  /** Jobs newly written to the database. */
  added: number;
  /** Already stored under the same URL. */
  duplicates: number;
  /** Failed the title or skill rules. */
  filtered: number;
  /** Passed the rules but scored under 40. */
  discarded: number;
  /** From the scraper: rate limits, unreachable sites, partial runs. */
  notes: string[];
}

/** The candidate's own skills and tools, for the gap list. */
export function profileTerms(cv: MasterCv): string[] {
  return [...cv.profile.tools, ...cv.skills].map((entry) => entry.trim()).filter(Boolean);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toStoredJob(record: RecordModel): StoredJob {
  return {
    id: record.id,
    job_url: String(record.job_url ?? ""),
    source: String(record.source ?? ""),
    title: String(record.title ?? "Untitled role"),
    company: String(record.company ?? ""),
    location: String(record.location ?? ""),
    job_type: String(record.job_type ?? ""),
    date_posted: String(record.date_posted ?? ""),
    salary_text: String(record.salary_text ?? ""),
    job_level: String(record.job_level ?? ""),
    company_industry: String(record.company_industry ?? ""),
    company_num_employees: String(record.company_num_employees ?? ""),
    description: String(record.description ?? ""),
    is_remote: Boolean(record.is_remote),
    score: Number(record.score ?? 0),
    tier: String(record.tier ?? ""),
    score_reasons: parseJson<JobScore | null>(record.score_reasons, null),
    status: asJobStatus(record.status),
    application: String(record.application ?? ""),
    created: String(record.created ?? ""),
  };
}

/**
 * Filters, scores and stores a batch of scraped jobs.
 *
 * Deliberately does the cheap work first: the title rule rejects most adverts
 * for nothing, and there is no sense scoring a .NET role before discovering it
 * is a .NET role.
 */
export async function storeScrapedJobs(
  pb: PocketBase,
  scraped: ScrapedJob[],
  profile: string[],
  notes: string[],
  /**
   * A remote run applies an extra gate: UK only, and not the two cities the
   * local search already covers. Boards return foreign "Remote" listings from
   * a UK-scoped search often enough that this is not optional.
   */
  { remoteOnly = false }: { remoteOnly?: boolean } = {}
): Promise<ScrapeSummary> {
  const summary: ScrapeSummary = {
    added: 0,
    duplicates: 0,
    filtered: 0,
    discarded: 0,
    notes: [...notes],
  };

  for (const job of scraped) {
    if (!job.jobUrl) continue;

    if (remoteOnly) {
      const remote = keepRemoteJob({
        location: job.location,
        isRemote: job.isRemote,
        description: job.description,
      });
      if (!remote.keep) {
        summary.filtered++;
        continue;
      }
    }

    const verdict = filterJob({ title: job.title, description: job.description });
    if (!verdict.keep) {
      summary.filtered++;
      continue;
    }

    // Title, location and description together: "Edinburgh" is usually in the
    // location field rather than the body, and it is worth 10 points.
    const scored = scoreJob(
      `${job.title}\n${job.location}\n${job.jobType}\n${job.description}`,
      profile
    );

    if (scored.tier === "discard") {
      summary.discarded++;
      continue;
    }

    try {
      await pb.collection(COLLECTIONS.scrapedJobs).create({
        job_url: job.jobUrl,
        source: job.source,
        external_id: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        job_type: job.jobType,
        date_posted: job.datePosted,
        salary_text: job.salaryText,
        job_level: job.jobLevel,
        job_function: job.jobFunction,
        company_industry: job.companyIndustry,
        company_url: job.companyUrl,
        company_num_employees: job.companyNumEmployees,
        description: job.description,
        is_remote: job.isRemote,
        score: scored.score,
        tier: scored.tier,
        score_reasons: scored,
        status: "Scraped",
        application: "",
      });
      summary.added++;
    } catch (err) {
      // The unique index on job_url is the dedup, and hitting it is the
      // expected outcome of searching the same thing twice — not a failure.
      if (isDuplicate(err)) {
        summary.duplicates++;
        continue;
      }
      throw new Error(describePocketBaseError(err));
    }
  }

  return summary;
}

/**
 * Was this rejected by the unique index on job_url?
 *
 * PocketBase reports it as a 400 with a per-field validation message rather
 * than a distinct code, so the shape has to be recognised rather than matched
 * on a constant.
 */
function isDuplicate(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status !== 400) return false;

  const data = (err as { response?: { data?: Record<string, { code?: string }> } })
    ?.response?.data;

  return Object.values(data ?? {}).some((field) =>
    String(field?.code ?? "").includes("unique")
  );
}

/** The views in the sidebar. The URL carries one of these. */
export const JOB_VIEWS = [
  "top-match",
  "all",
  "not-applied",
  "applied",
  "dismissed",
] as const;
export type JobView = (typeof JOB_VIEWS)[number];

export function asJobView(value: unknown): JobView {
  const text = String(value ?? "").trim().toLowerCase();
  return JOB_VIEWS.find((view) => view === text) ?? "top-match";
}

/**
 * What each view asks the database for.
 *
 * Sorting differs on purpose: "top match" is about which job is worth the next
 * hour, so it leads with the score; everything else is a record of what
 * happened, so it leads with time.
 */
const VIEWS: Record<JobView, { filter: string; sort: string }> = {
  // Worth your time next: never applied to, never dismissed, best first.
  "top-match": { filter: 'status = "Scraped"', sort: "-score,-created" },
  all: { filter: "", sort: "-created" },
  "not-applied": { filter: 'status = "Scraped"', sort: "-created" },
  applied: { filter: 'status = "Applied"', sort: "-updated,-created" },
  dismissed: { filter: 'status = "Dismissed"', sort: "-created" },
};

export async function listJobs(
  pb: PocketBase,
  view: JobView = "top-match"
): Promise<StoredJob[]> {
  const { filter, sort } = VIEWS[view];

  const records = await pb
    .collection(COLLECTIONS.scrapedJobs)
    .getList(1, 200, { sort, filter });

  return records.items.map(toStoredJob);
}

/** How many jobs sit in each view, for the counts beside the sidebar links. */
export async function countByStatus(
  pb: PocketBase
): Promise<Record<JobStatus, number>> {
  const counts = { Scraped: 0, Applied: 0, Dismissed: 0 } as Record<
    JobStatus,
    number
  >;

  // One read rather than three. Two hundred rows is nothing to count in
  // memory, and it keeps the sidebar off the critical path.
  const records = await pb
    .collection(COLLECTIONS.scrapedJobs)
    .getList(1, 200, { fields: "status" });

  for (const record of records.items) counts[asJobStatus(record.status)]++;
  return counts;
}

export async function setJobStatus(
  pb: PocketBase,
  id: string,
  status: JobStatus,
  applicationId = ""
): Promise<StoredJob> {
  const record = await pb.collection(COLLECTIONS.scrapedJobs).update(id, {
    status,
    ...(applicationId ? { application: applicationId } : {}),
  });
  return toStoredJob(record);
}
