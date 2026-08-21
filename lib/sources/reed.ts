import type { ScrapedJob, ScrapeResult } from "@/lib/scraper";

import { TITLE_KEYWORDS } from "@/lib/job-filter";

/**
 * Reed: the biggest UK-only job board, with a free keyed API.
 *
 * Like Adzuna, the search endpoint returns a snippet. Unlike Adzuna, Reed has a
 * per-job detail endpoint that returns the FULL advert — so these jobs can go
 * through the normal filter with the whole description behind them.
 *
 * The detail fetch is one extra request per job, which is exactly the cost that
 * makes LinkedIn rate limit us. So it is only spent on jobs whose TITLE already
 * looks right: a search returning 50 results usually leaves a handful worth
 * opening, and the other 45 are dropped for free.
 */

const SEARCH_ENDPOINT = "https://www.reed.co.uk/api/1.0/search";
const DETAIL_ENDPOINT = "https://www.reed.co.uk/api/1.0/jobs";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * How many descriptions one search may fetch.
 *
 * A ceiling rather than a target: it caps the worst case at a known number of
 * requests, so a search term that happens to match everything cannot turn one
 * press into three hundred round trips.
 */
const MAX_DETAIL_FETCHES = 20;

export interface ReedRequest {
  searchTerm: string;
  /** Omitted for a UK-wide search. */
  location?: string;
  /** Miles from `location`. Reed defaults to 10, which is tight for a commute. */
  distanceFromLocation?: number;
  resultsWanted?: number;
  isRemote?: boolean;
}

export function reedConfigured(): boolean {
  return Boolean(process.env.REED_API_KEY?.trim());
}

/** Reed authenticates with the key as the username and an empty password. */
function authHeader(): string {
  const key = process.env.REED_API_KEY!.trim();
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function scrapeReed(request: ReedRequest): Promise<ScrapeResult> {
  if (!reedConfigured()) {
    return { jobs: [], notes: ["reed: skipped (REED_API_KEY is not set)"] };
  }

  const url = new URL(SEARCH_ENDPOINT);
  // Reed has no remote flag on its search, so the word goes in the query. Its
  // keyword search reads the advert body, which is where "remote" is written.
  url.searchParams.set(
    "keywords",
    request.isRemote ? `${request.searchTerm} remote` : request.searchTerm
  );
  if (request.location) {
    url.searchParams.set("locationName", request.location);
    url.searchParams.set(
      "distanceFromLocation",
      String(request.distanceFromLocation ?? 25)
    );
  }
  url.searchParams.set("resultsToTake", String(Math.min(request.resultsWanted ?? 25, 100)));

  let payload: { results?: unknown[] };
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        jobs: [],
        notes: [
          response.status === 401
            ? "reed: the API key was rejected — check REED_API_KEY in Coolify"
            : `reed: returned ${response.status}`,
        ],
      };
    }

    payload = (await response.json()) as { results?: unknown[] };
  } catch (err) {
    return {
      jobs: [],
      notes: [
        `reed: could not be reached (${err instanceof Error ? err.message : "network error"})`,
      ],
    };
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  const all = rows.map(toScrapedJob).filter((job) => job.jobUrl && job.title);

  // Only open the ones whose title already passes. Everything else is going to
  // be rejected on the title anyway, and a rejected job is not worth a request.
  const worthOpening = all.filter((job) => titleLooksRight(job.title));
  const budget = worthOpening.slice(0, MAX_DETAIL_FETCHES);

  let fetched = 0;
  for (const job of budget) {
    const full = await fetchDescription(job.externalId);
    if (full) {
      job.description = full;
      job.partialDescription = false;
      fetched++;
    }
  }

  const notes: string[] = [];
  notes.push(
    all.length
      ? `reed: ${all.length} results, ${fetched} full descriptions fetched`
      : "reed: no results"
  );
  if (worthOpening.length > budget.length) {
    notes.push(
      `reed: ${worthOpening.length - budget.length} more matched the title than the ` +
        `${MAX_DETAIL_FETCHES}-description limit allowed — they are kept as summaries`
    );
  }

  return { jobs: all, notes };
}

/** The same substring test `filterJob()` uses, so the two cannot disagree. */
function titleLooksRight(title: string): boolean {
  const lower = (title ?? "").toLowerCase();
  return TITLE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * The whole advert for one job.
 *
 * Returns "" on any failure — a job with a summary is still a job, and losing
 * the whole run because one detail request timed out would be the wrong trade.
 */
async function fetchDescription(jobId: string): Promise<string> {
  if (!jobId) return "";

  try {
    const response = await fetch(`${DETAIL_ENDPOINT}/${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    if (!response.ok) return "";

    const detail = (await response.json()) as { jobDescription?: unknown };
    return stripHtml(String(detail.jobDescription ?? ""));
  } catch {
    return "";
  }
}

/**
 * Reed's descriptions are HTML. Everything downstream — the filter, the scoring,
 * the Gemini prompt — reads plain text, and tag soup in a prompt is noise the
 * model has to see past.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ReedRow {
  jobId?: unknown;
  jobTitle?: unknown;
  employerName?: unknown;
  locationName?: unknown;
  jobDescription?: unknown;
  jobUrl?: unknown;
  date?: unknown;
  minimumSalary?: unknown;
  maximumSalary?: unknown;
  currency?: unknown;
  contractType?: unknown;
  fullTime?: unknown;
  partTime?: unknown;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function toScrapedJob(row: unknown): ScrapedJob {
  const r = (row ?? {}) as ReedRow;

  const min = Number(r.minimumSalary ?? 0);
  const max = Number(r.maximumSalary ?? 0);
  const salary = [min, max].filter((n) => n > 0).map(Math.round).join(" - ");
  const id = text(r.jobId);
  const location = text(r.locationName);
  const description = stripHtml(text(r.jobDescription));

  return {
    externalId: id,
    source: "reed",
    jobUrl: text(r.jobUrl) || (id ? `https://www.reed.co.uk/jobs/${id}` : ""),
    title: text(r.jobTitle),
    company: text(r.employerName),
    location,
    description,
    // Reed sends "14/08/2026". Everything else here stores ISO, so convert.
    datePosted: toIsoDate(text(r.date)),
    jobType: r.fullTime ? "fulltime" : r.partTime ? "parttime" : text(r.contractType),
    isRemote: /\bremote\b/i.test(`${text(r.jobTitle)} ${location} ${description}`),
    salaryText: salary ? `${salary} ${text(r.currency) || "GBP"} year` : "",
    jobLevel: "",
    jobFunction: "",
    companyIndustry: "",
    companyUrl: "",
    companyNumEmployees: "",
    // Until the detail fetch fills it in, this is a summary.
    partialDescription: true,
  };
}

function toIsoDate(value: string): string {
  const uk = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : value.slice(0, 10);
}
