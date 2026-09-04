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

/**
 * Job titles worth looking at. Matched loosely: adverts pad their titles.
 *
 * Matched as a plain substring of the lower-cased title, so a keyword covers
 * every job that wraps it — "ai ops" catches "AI Ops Lead" and "Senior AI Ops
 * Engineer", "ai engineer" catches "Lead AI Engineer (Agentic)". The list is
 * deliberately generous, because it is only the FIRST gate: the banned-skill
 * and required-skill rules below still have to pass, so a wide title net costs
 * nothing except a few more descriptions being read.
 */
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
  // A bare "solution(s) architect" is NOT here. It is as common in building
  // services as it is in software, so it lives on the guarded list below and
  // has to be backed up by something in the advert. The AI-prefixed spellings
  // two lines up still match on the title alone.

  // Titles seen being thrown away by the list above. "AI Ops Lead" is the one
  // that was actually observed getting discarded; the rest are the same shape
  // of miss — a real AI or automation job whose title simply reads differently.
  "ai ops",
  "aiops",
  "ai operations",
  "machine learning engineer",
  "ml engineer",
  "head of ai",
  "ai lead",
  "lead ai",
  "ai developer",
  "ai consultant",
  "ai product engineer",
  // Palantir's term, now used by a lot of AI startups for exactly the job Dean
  // does: build the thing in front of the customer.
  "forward deployed engineer",
  "automation specialist",
  "automation consultant",
  // "platform engineer" on its own is not on this list on purpose: it matches
  // every DevOps and infrastructure job on the board, and most of them mention
  // an API somewhere, so the skill rule would not save us. Scoped to AI, it is
  // a real target title.
  "ai platform engineer",

  // The five role families an agency owner is actually competitive for, which
  // the engineering-flavoured list above was quietly throwing away. Every one
  // of these is scoped to AI or automation for the same reason "platform
  // engineer" is: unscoped, they match half the board.

  // Implementation consulting and strategy.
  "ai implementation consultant",
  "ai implementation",
  "ai strategist",
  "ai strategy",
  "ai transformation",
  "ai adoption",
  "ai enablement",
  "ai delivery",

  // No-code and low-code automation.
  "no-code engineer",
  "no code engineer",
  "no-code developer",
  "no code developer",
  "low-code engineer",
  "low code engineer",
  "low-code developer",
  "low code developer",
  "workflow automation",
  "automation developer",
  "rpa developer",

  // Product and project, scoped hard. A bare "project manager" is on the
  // guarded list below instead, because unscoped it is mostly construction.
  "ai product manager",
  "ai project manager",
  "ai programme manager",
  "ai program manager",
  "ai delivery manager",
  "technical product manager",

  // Presales and solutions.
  "ai solutions consultant",
  "ai presales",
  "ai sales engineer",

  // Prompt and LLM operations.
  "prompt engineer",
  "prompt engineering",
  "llm ops",
  "llmops",
  "llm operations",
];

/**
 * Titles that are real only alongside a tech signal.
 *
 * "Solutions Architect" is an AI job at a software company and a building
 * services job at a contractor. "Project Manager" is overwhelmingly the second
 * kind. Neither can be judged on the title alone, so they pass the title gate
 * only when the advert also says something that places it in software — which
 * is what TECH_SIGNALS below is for.
 */
export const GUARDED_TITLES = [
  "project manager",
  "product manager",
  "programme manager",
  "program manager",
  "delivery manager",
  "solution architect",
  "solutions architect",
  "solutions engineer",
  "solution engineer",
  "presales engineer",
  "pre-sales engineer",
  "sales engineer",
  "solutions consultant",
  "implementation consultant",
  "implementation specialist",
  "integration specialist",
  "operations manager",
  "business analyst",
];

/**
 * Sector words that disqualify a guarded title on the body rather than the name.
 *
 * "Solutions Architect" for a building services division is not a tech job even
 * though the advert mentions an API somewhere in the boilerplate. Checked only
 * for guarded titles: a genuine AI Engineer role at a construction firm passes
 * the title whitelist outright and never reaches this.
 */
export const NON_TECH_CONTEXT = [
  "building services",
  "construction site",
  "main contractor",
  "subcontractor",
  "quantity surveying",
  "civil engineering",
  "cdm regulations",
  "nec contract",
  "jct",
  "riba",
  "groundworks",
  "mechanical and electrical",
  "site supervision",
  "cscs",
];

/** What has to appear somewhere for a guarded title to count as a tech job. */
export const TECH_SIGNALS = [
  "ai",
  "artificial intelligence",
  "llm",
  "machine learning",
  "automation",
  "api",
  "software",
  "saas",
  "platform",
  "data platform",
  "digital product",
  "no-code",
  "low-code",
  "integration",
];

/**
 * Titles that are never this job, whatever else the advert says.
 *
 * The title list above was a pure whitelist, which was safe while every entry
 * on it named an engineering role. Adding "Implementation Consultant",
 * "Project Manager" and "Solutions Architect" changes that: those titles are
 * common in construction, building services and recruitment, and a construction
 * PM advert mentioning "API" in a boilerplate systems paragraph would otherwise
 * sail through both remaining gates.
 *
 * Matched against the title only. A software job at a construction COMPANY is
 * still a software job, and rejecting it on the industry would be wrong.
 */
export const NON_TECH_TITLE_BLOCKERS = [
  "construction",
  "civil engineer",
  "structural engineer",
  "quantity surveyor",
  "surveyor",
  "site manager",
  "site engineer",
  "contracts manager",
  "estimator",
  "architectural technician",
  "building services",
  "mechanical engineer",
  "electrical engineer",
  "hvac",
  "m&e",
  "scaffolding",
  "highways",
  "groundworks",
  "facilities manager",
  "health and safety",
  "recruitment consultant",
  "account manager",
  "marketing manager",
  "care assistant",
  "support worker",
  "teacher",
  "chef",
  "driver",
  "warehouse",
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
  /** The employer's industry, when the board reported one. */
  industry?: string;
  /**
   * The description is a snippet, not the whole advert.
   *
   * Adzuna's search API returns a couple of hundred characters and stops. The
   * required-skill rule reads the body looking for "python", "llm", "api" — on
   * a snippet it is reading a marketing sentence, so it would reject nearly
   * every Adzuna job for saying nothing, which is not the same as saying no.
   *
   * So on a partial description the required-skill rule is skipped. The title
   * rule and the banned-skill rule still run: a .NET role that says ".NET" in
   * its first two lines is still a .NET role.
   */
  partial?: boolean;
}

export function filterJob(job: JobForFilter): FilterResult {
  const title = (job.title ?? "").toLowerCase();
  const description = job.description ?? "";

  // Non-tech titles first. Cheapest of all, and it has to run before the title
  // whitelist: "Construction Project Manager" contains "project manager", and
  // "Building Services Solutions Architect" contains "solutions architect".
  const nonTech = NON_TECH_TITLE_BLOCKERS.find((blocker) => title.includes(blocker));
  if (nonTech) {
    return { keep: false, reason: `not a tech role (${nonTech})`, matched: [] };
  }

  // Then the title whitelist, and the guarded titles that need backing up.
  const titleHit = TITLE_KEYWORDS.some((keyword) => title.includes(keyword));
  if (!titleHit) {
    const guarded = GUARDED_TITLES.find((keyword) => title.includes(keyword));
    if (!guarded) {
      return { keep: false, reason: "title does not match", matched: [] };
    }

    // A guarded title has to earn its place from the rest of the advert.
    const context = `${job.title ?? ""}\n${job.industry ?? ""}\n${description}`;

    const sector = matchedTerms(context, NON_TECH_CONTEXT);
    if (sector.length) {
      return {
        keep: false,
        reason: `"${guarded}" in ${sector[0]}, not software`,
        matched: sector,
      };
    }

    const signals = matchedTerms(context, TECH_SIGNALS);
    if (!signals.length) {
      return {
        keep: false,
        reason: `"${guarded}" with nothing to say it is a tech role`,
        matched: [],
      };
    }
  }

  // Banned before required. A .NET role that also says "API" is still a .NET
  // role, and checking the disqualifiers first says so in the reason.
  const banned = matchedTerms(description, BANNED_SKILLS);
  if (banned.length) {
    return { keep: false, reason: `mentions ${banned.join(", ")}`, matched: banned };
  }

  const required = matchedTerms(description, REQUIRED_SKILLS);
  if (job.partial) {
    // Kept on the title alone. Whatever skills the snippet happened to name
    // are still reported, so the run summary is not silent about why.
    return { keep: true, reason: "", matched: required };
  }

  if (!required.length) {
    return {
      keep: false,
      reason: "no relevant skills mentioned",
      matched: [],
    };
  }

  return { keep: true, reason: "", matched: required };
}
