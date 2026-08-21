import type { ScrapedJob, ScrapeResult } from "@/lib/scraper";

/**
 * Adzuna: a documented, free, keyed jobs API for the UK.
 *
 * Worth having because it is the one source here that cannot rate limit us into
 * silence. LinkedIn stops answering an unauthenticated scraper at around ten
 * pages from one IP, and there is nothing to be done about that from a single
 * server. Adzuna answers every time, as long as the key is set.
 *
 * The catch is the description: the search endpoint returns a truncated snippet
 * of a few hundred characters and there is no detail endpoint to fill it in. So
 * these jobs are marked `partialDescription`, which makes `filterJob()` skip the
 * required-skill rule and makes the card say the advert is only a summary. That
 * is a deliberate trade: a shorter, honest record of a real job beats no record.
 */

const ENDPOINT = "https://api.adzuna.com/v1/api/jobs/gb/search/1";

/** Adzuna's snippets run to a few hundred characters; nothing near a real advert. */
const REQUEST_TIMEOUT_MS = 20_000;

export interface AdzunaRequest {
  searchTerm: string;
  /** Left empty for a UK-wide search, which is what the remote leg wants. */
  location?: string;
  resultsWanted?: number;
  /** Only jobs posted within this many hours, to match the jobspy searches. */
  hoursOld?: number;
  /** Adzuna has no "remote" flag, so this goes into the query text instead. */
  isRemote?: boolean;
}

export function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());
}

export async function scrapeAdzuna(request: AdzunaRequest): Promise<ScrapeResult> {
  if (!adzunaConfigured()) {
    // Not an error. A missing key means "he has not signed up for this one yet",
    // and the rest of the search should carry on without it.
    return {
      jobs: [],
      notes: ["adzuna: skipped (ADZUNA_APP_ID and ADZUNA_APP_KEY are not set)"],
    };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("app_id", process.env.ADZUNA_APP_ID!.trim());
  url.searchParams.set("app_key", process.env.ADZUNA_APP_KEY!.trim());
  url.searchParams.set(
    "what",
    request.isRemote ? `${request.searchTerm} remote` : request.searchTerm
  );
  if (request.location) url.searchParams.set("where", request.location);
  url.searchParams.set("results_per_page", String(Math.min(request.resultsWanted ?? 25, 50)));
  url.searchParams.set(
    "max_days_old",
    String(Math.max(1, Math.round((request.hoursOld ?? 720) / 24)))
  );
  url.searchParams.set("content-type", "application/json");

  let payload: { results?: unknown[] };
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        jobs: [],
        notes: [
          response.status === 401 || response.status === 403
            ? "adzuna: the app id or key was rejected — check them in Coolify"
            : `adzuna: returned ${response.status}`,
        ],
      };
    }

    payload = (await response.json()) as { results?: unknown[] };
  } catch (err) {
    return {
      jobs: [],
      notes: [
        `adzuna: could not be reached (${err instanceof Error ? err.message : "network error"})`,
      ],
    };
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  const jobs = rows.map(toScrapedJob).filter((job) => job.jobUrl && job.title);

  return {
    jobs,
    notes: jobs.length
      ? [`adzuna: ${jobs.length} results (descriptions are summaries only)`]
      : ["adzuna: no results"],
  };
}

interface AdzunaRow {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  redirect_url?: unknown;
  created?: unknown;
  contract_time?: unknown;
  contract_type?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  salary_is_predicted?: unknown;
  company?: { display_name?: unknown };
  location?: { display_name?: unknown };
  category?: { label?: unknown };
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function toScrapedJob(row: unknown): ScrapedJob {
  const r = (row ?? {}) as AdzunaRow;

  const min = Math.round(Number(r.salary_min ?? 0));
  const max = Math.round(Number(r.salary_max ?? 0));
  const salary = [min, max].filter((n) => n > 0).join(" - ");
  const location = text(r.location?.display_name);
  const description = text(r.description);

  return {
    externalId: text(r.id),
    source: "adzuna",
    jobUrl: text(r.redirect_url),
    title: text(r.title),
    company: text(r.company?.display_name),
    location,
    description,
    // "2026-08-14T09:12:03Z" — the rest of the app stores a date string, so
    // keep the day and drop the time.
    datePosted: text(r.created).slice(0, 10),
    jobType: [text(r.contract_time), text(r.contract_type)].filter(Boolean).join(" "),
    // Adzuna has no remote flag of its own. The word in the title or the
    // location is all there is to go on.
    isRemote: /\bremote\b/i.test(`${text(r.title)} ${location} ${description}`),
    salaryText: salary
      ? `${salary} GBP year${text(r.salary_is_predicted) === "1" ? " (estimated)" : ""}`
      : "",
    jobLevel: "",
    jobFunction: text(r.category?.label),
    companyIndustry: "",
    companyUrl: "",
    companyNumEmployees: "",
    partialDescription: true,
  };
}
