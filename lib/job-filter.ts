/**
 * Decides whether a scraped job is worth scoring at all.
 *
 * Runs before scoring, and rejects hard: a job that fails here is never stored,
 * never shown and never counted. The scoring engine then only ever sees jobs
 * that already passed the non-negotiables.
 *
 * Everything here is a pure function over strings — no network, no database —
 * so the rules can be tested against real adverts rather than through a scrape.
 */

/** Job titles worth looking at. Matched loosely: adverts pad their titles. */
export const TITLE_KEYWORDS = [
  "ai engineer",
  "applied ai",
  "generative ai",
  "llm engineer",
  "agentic ai",
  "ai solution architect",
  "ai solutions architect",
  "ai solutions engineer",
  "ai solution engineer",
  "technical lead ai",
  "ai technical lead",
  "ai architect",
  "ai specialist",
  "automation architect",
  "automation engineer",
  "solutions integration engineer",
  "integration engineer",
  "solution architect",
  "solutions architect",
];

/** At least one of these must appear in the advert. */
export const REQUIRED_SKILLS = [
  "python",
  "llm",
  "rag",
  "langgraph",
  "langchain",
  "api",
];

/**
 * Any one of these kills the job outright.
 *
 * These are the stacks Dean does not work in, and an advert that names one is
 * describing a different job however well the title reads.
 */
export const BANNED_SKILLS = ["c#", ".net", "java"];

export interface FilterResult {
  keep: boolean;
  /** Why it was rejected, for the run summary. Empty when kept. */
  reason: string;
  /** Which banned or required terms were found, for the same reason. */
  matched: string[];
}

/**
 * Escapes a term for use in a regular expression.
 *
 * Half of these terms contain characters a regex cares about — "c#", ".net",
 * "c++" — and an unescaped "." matches any character, which would make ".net"
 * match "a net loss".
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word matching, with two deliberate exceptions.
 *
 * Plain `includes()` is what makes keyword filters useless: "java" matches
 * "JavaScript", "rag" matches "storage" and "fragment", "api" matches "rapid".
 * All three are common enough in job adverts to wreck the filter.
 *
 * The exceptions are terms with a symbol at either end, where `\b` asserts a
 * boundary in the wrong direction and so never matches:
 *
 *   - ENDS in a symbol ("c#", "c++"): a trailing \b after "#" can never hold,
 *     so require a non-alphanumeric to follow instead.
 *   - STARTS with a symbol (".net"): the symbol IS the boundary, and requiring
 *     another one in front of it breaks the common case — the "." in "ASP.NET"
 *     is preceded by "P". So no leading assertion at all. ".net" still cannot
 *     match "a net loss", because that has no dot, and cannot match
 *     "sub.network", because the trailing \b does the work there.
 */
export function mentions(haystack: string, term: string): boolean {
  const lower = term.toLowerCase();
  const escaped = escapeRegExp(lower);

  const prefix = /^[^a-z0-9]/.test(lower) ? "" : "\\b";

  // A trailing "s" is allowed, because adverts are written in the plural far
  // more often than the singular: "REST APIs", "LLMs", "webhooks", "vector
  // databases". Without this, "api" misses "REST APIs" — which silently threw
  // away real jobs until a test caught it. The cost is that "rag" also matches
  // "rags", which no job advert says.
  const suffix = /[^a-z0-9]$/.test(lower) ? "(?![a-z0-9])" : "s?\\b";

  return new RegExp(`${prefix}${escaped}${suffix}`, "i").test(haystack);
}

/** Every term from `terms` that appears in the text. */
export function matchedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => mentions(text, term));
}

export interface JobForFilter {
  title: string;
  description: string;
}

export function filterJob(job: JobForFilter): FilterResult {
  const title = (job.title ?? "").toLowerCase();
  const description = job.description ?? "";

  // Title first: it is the cheapest check and the one that rejects most.
  const titleHit = TITLE_KEYWORDS.some((keyword) => title.includes(keyword));
  if (!titleHit) {
    return { keep: false, reason: "title does not match", matched: [] };
  }

  // Banned before required. A .NET role that also says "API" is still a .NET
  // role, and checking the disqualifiers first says so in the reason.
  const banned = matchedTerms(description, BANNED_SKILLS);
  if (banned.length) {
    return { keep: false, reason: `mentions ${banned.join(", ")}`, matched: banned };
  }

  const required = matchedTerms(description, REQUIRED_SKILLS);
  if (!required.length) {
    return {
      keep: false,
      reason: "no relevant skills mentioned",
      matched: [],
    };
  }

  return { keep: true, reason: "", matched: required };
}
