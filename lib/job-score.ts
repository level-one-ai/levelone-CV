import { matchedTerms, mentions } from "@/lib/job-filter";

/**
 * Scores a filtered job 0-100 and puts it in a tier.
 *
 * Pure functions over strings, same as the filter, so the weights can be tuned
 * against real adverts without running a scrape.
 *
 * The number is a measure of how well the ADVERT matches the target profile —
 * not of how qualified the candidate is for it. Those are different questions,
 * and conflating them is how a 92% ends up next to a job you cannot evidence.
 * `gaps` below exists to keep them apart.
 */

export type Tier = "tier-1" | "tier-2" | "discard";

/** Everything that pushes a job up, and by how much. */
export const BOOSTS: ReadonlyArray<[term: string, points: number]> = [
  // The specific stack these roles are really asking for.
  ["langgraph", 10],
  ["langchain", 10],
  ["agentic ai", 10],
  ["rag", 8],
  ["retrieval augmented", 8],
  ["vector database", 8],
  ["vector db", 8],
  ["fastapi", 7],
  ["python", 7],
  ["docker", 5],
  ["rapid prototyping", 5],
  // Circumstances rather than skills, and worth as much.
  ["edinburgh", 10],
  ["contract", 5],
  ["inside ir35", 5],
];

/** Everything that pushes a job down. */
export const PENALTIES: ReadonlyArray<[term: string, points: number]> = [
  [".net", 30],
  ["c#", 30],
  ["c++", 20],
  ["angular", 15],
  ["highq", 20],
  ["sharepoint", 20],
  ["power automate", 15],
];

/**
 * Phrases that mean "we want a career enterprise hand" or "this is a people
 * management job". Both describe a role Dean is not, whatever the title says.
 */
const TENURE_PATTERNS: ReadonlyArray<[RegExp, string, number]> = [
  [/\b(1[0-9]|[2-9][0-9])\+?\s*years?\b/i, "10+ years required", 20],
  [
    /\b(manag(e|ing)|lead(ing)?)\s+(a\s+)?(team|department)\s+of\s+([5-9][0-9]|[1-9][0-9]{2,})\b/i,
    "large-team people management",
    25,
  ],
  [
    /\b(head of|director of)\s+(engineering|technology|delivery)\b/i,
    "senior people-management role",
    15,
  ],
];

export const TIER_1_MIN = 70;
export const TIER_2_MIN = 40;

/** Where every job starts before anything is added or taken away. */
const BASE_SCORE = 50;

export interface ScoreReason {
  term: string;
  points: number;
}

export interface JobScore {
  score: number;
  tier: Tier;
  boosts: ScoreReason[];
  penalties: ScoreReason[];
  /**
   * Terms the advert wants that are NOT in the candidate's own profile.
   *
   * The scoring rewards LangGraph, RAG, vector databases and FastAPI, and Dean
   * has none of them. Left alone, the highest-scoring jobs would be exactly the
   * ones his CV can least support. This is the number's blind spot made
   * visible: the same score, with the things it is quietly rewarding listed
   * beside it. It doubles as an interview-prep list.
   */
  gaps: string[];
}

/**
 * @param text     the advert: title, location and description together
 * @param profile  the candidate's own tools and skills, lowercased
 */
export function scoreJob(text: string, profile: readonly string[] = []): JobScore {
  const boosts: ScoreReason[] = [];
  const penalties: ScoreReason[] = [];

  for (const [term, points] of BOOSTS) {
    if (mentions(text, term)) boosts.push({ term, points });
  }

  for (const [term, points] of PENALTIES) {
    if (mentions(text, term)) penalties.push({ term, points });
  }

  for (const [pattern, label, points] of TENURE_PATTERNS) {
    if (pattern.test(text)) penalties.push({ term: label, points });
  }

  const raw =
    BASE_SCORE +
    boosts.reduce((sum, b) => sum + b.points, 0) -
    penalties.reduce((sum, p) => sum + p.points, 0);

  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    tier: tierFor(score),
    boosts,
    penalties,
    gaps: findGaps(boosts, profile),
  };
}

export function tierFor(score: number): Tier {
  if (score >= TIER_1_MIN) return "tier-1";
  if (score >= TIER_2_MIN) return "tier-2";
  return "discard";
}

/**
 * Which boosted terms the advert asked for that the candidate cannot evidence.
 *
 * Only skills count. "Edinburgh", "contract" and "inside ir35" are
 * circumstances — they are not things anyone puts on a CV, so their absence
 * from a tool list is not a gap.
 */
const NOT_SKILLS = new Set([
  "edinburgh",
  "contract",
  "inside ir35",
  // A way of working, not a tool. Nobody lists it in a tools field, so
  // reporting it as missing from one is noise in a list that only works while
  // every line on it is worth reading.
  "rapid prototyping",
]);

function findGaps(boosts: ScoreReason[], profile: readonly string[]): string[] {
  if (!profile.length) return [];

  const owned = profile.map((entry) => entry.toLowerCase());

  return boosts
    .filter(({ term }) => !NOT_SKILLS.has(term))
    .filter(({ term }) => !owned.some((entry) => matchesProfile(entry, term)))
    .map(({ term }) => term);
}

/**
 * Does a profile entry cover this term?
 *
 * Deliberately generous in one direction only: "vector database" is covered by
 * a profile entry of "vector databases", and "rag" by "RAG pipelines". Being
 * strict here would report gaps he does not have, and a gap list that cries
 * wolf gets ignored exactly like any other.
 */
function matchesProfile(entry: string, term: string): boolean {
  return entry === term || mentions(entry, term) || mentions(term, entry);
}

/** A short, readable summary for the card: "+10 LangGraph, -30 .NET". */
export function explainScore(result: JobScore): string {
  const parts = [
    ...result.boosts.map((b) => `+${b.points} ${b.term}`),
    ...result.penalties.map((p) => `-${p.points} ${p.term}`),
  ];
  return parts.join(", ");
}
