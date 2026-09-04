import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import type { CapabilityProfile } from "@/lib/capabilities";
import { filterJob } from "@/lib/job-filter";
import { isJobMatch, matchJob, type JobMatch } from "@/lib/job-match";
import { COLLECTIONS, describePocketBaseError } from "@/lib/pocketbase";
import type { ScrapedJob } from "@/lib/scraper";
import { keepRemoteJob } from "@/lib/uk-location";
import type { DuplicateMatch } from "@/lib/types";

/**
 * Turning scraped adverts into stored, scored jobs.
 *
 * The scrape itself is in `lib/scraper.ts`, the rules in `lib/job-filter.ts`
 * and `lib/job-match.ts`. This is the part that talks to PocketBase.
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
  job_function: string;
  company_industry: string;
  company_num_employees: string;
  description: string;
  is_remote: boolean;
  score: number;
  tier: string;
  score_reasons: JobMatch | null;
  status: JobStatus;
  application: string;
  created: string;
  /**
   * A past application that looks like this same job, or null.
   *
   * Worked out when the list is read rather than stored, so it is never stale:
   * apply to something today and every matching job says so immediately, with
   * no field to migrate and nothing to keep in step.
   */
  duplicate: DuplicateMatch | null;
}

/**
 * What gets written into the `score_reasons` JSON column.
 *
 * `JobMatch` already carries its own `partial` marker — see
 * `lib/sources/adzuna.ts` for why a snippet needs one — so there is nothing to
 * wrap. Kept as an alias because plenty of call sites read better for it.
 */
export type StoredScore = JobMatch;

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

/**
 * Reads a stored score back, discarding anything the old scorer wrote.
 *
 * Rows scored before the coverage rebuild carry `boosts`/`evidence`/`gaps` and
 * no `components`. Rendering half of that shape would show an evidence list
 * built from the wrong question, so it is dropped and the card falls back to
 * the bare number until `npm run rescore` replaces it.
 */
function readMatch(value: unknown): JobMatch | null {
  const parsed = parseJson<unknown>(value, null);
  return isJobMatch(parsed) ? parsed : null;
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
    job_function: String(record.job_function ?? ""),
    company_industry: String(record.company_industry ?? ""),
    company_num_employees: String(record.company_num_employees ?? ""),
    description: String(record.description ?? ""),
    is_remote: Boolean(record.is_remote),
    score: Number(record.score ?? 0),
    tier: String(record.tier ?? ""),
    score_reasons: readMatch(record.score_reasons),
    status: asJobStatus(record.status),
    application: String(record.application ?? ""),
    created: String(record.created ?? ""),
    duplicate: null,
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
  profile: CapabilityProfile,
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

    const verdict = filterJob({
      title: job.title,
      description: job.description,
      industry: job.companyIndustry,
      partial: job.partialDescription,
    });
    if (!verdict.keep) {
      summary.filtered++;
      continue;
    }

    // Title, location and description together: "Edinburgh" is usually in the
    // location field rather than the body, and it carries real weight.
    const scored = matchJob(
      `${job.title}\n${job.location}\n${job.jobType}\n${job.description}`,
      profile,
      { partial: job.partialDescription }
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
        // The whole breakdown rides in the JSON rather than needing columns of
        // its own — score_reasons is already a JSON field, and matched/missing
        // is what the card renders.
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

  // `duplicate` is filled in by `lib/applied.ts`, which the API route calls
  // next. It lives in its own module on purpose: the matcher hashes with
  // node:crypto, and this file is imported by the board, which is a client
  // component. Pulling a Node built-in into the browser bundle fails the build.
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

/**
 * Re-scores every stored job against the current CV.
 *
 * The match is a pure function of the advert text and the capability profile,
 * so nothing has to be re-scraped to fix a stale number — and the profile
 * changes every time a project is added to `cv_projects`, which is exactly when
 * the old scores stop being true.
 *
 * Jobs that now fall below Tier 2 are dismissed rather than deleted. A score
 * is a judgement, and a judgement that has changed once can change again.
 */
export async function rescoreJobs(
  pb: PocketBase,
  profile: CapabilityProfile
): Promise<{ updated: number; movedTier: number; dismissed: number }> {
  let updated = 0;
  let movedTier = 0;
  let dismissed = 0;

  let page = 1;
  for (;;) {
    const records = await pb
      .collection(COLLECTIONS.scrapedJobs)
      .getList(page, 200, { sort: "created" });

    for (const record of records.items) {
      const job = toStoredJob(record);
      const scored = matchJob(
        `${job.title}\n${job.location}\n${job.job_type}\n${job.description}`,
        profile,
        // Nothing on the record says the description was a snippet once the old
        // score_reasons is gone, so length stands in: Adzuna returns a couple
        // of hundred characters and a real advert runs to thousands.
        { partial: job.description.length < 600 }
      );

      const nowDismissed = scored.tier === "discard" && job.status === "Scraped";
      if (scored.tier !== record.tier) movedTier++;
      if (nowDismissed) dismissed++;

      await pb.collection(COLLECTIONS.scrapedJobs).update(job.id, {
        score: scored.score,
        tier: scored.tier,
        score_reasons: scored,
        ...(nowDismissed ? { status: "Dismissed" } : {}),
      });
      updated++;
    }

    if (records.items.length < 200 || page >= records.totalPages) break;
    page++;
  }

  return { updated, movedTier, dismissed };
}
