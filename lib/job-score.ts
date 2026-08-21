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

/**
 * What the candidate can actually evidence.
 *
 * The list above rewards a stack he does not have — LangGraph, RAG, vector
 * databases, FastAPI — which is why his first board showed a 100% beside a job
 * wanting five things his CV cannot support. This second list rewards what four
 * years of running Level One actually produced: shipping whole systems, the
 * tools he really uses, working directly with the people who need the thing,
 * and employers who hire on evidence rather than credentials.
 *
 * Individually small on purpose, and capped as a group below. A CV is not made
 * strong by an advert using the word "stakeholder" nine times.
 */
export const EVIDENCE: ReadonlyArray<[term: string, points: number]> = [
  // Shipping whole things, which is the actual differentiator.
  ["end to end", 6],
  ["end-to-end", 6],
  ["greenfield", 5],
  ["from scratch", 5],
  ["ownership", 4],
  ["production support", 4],

  // The tools he genuinely works in.
  ["n8n", 8],
  ["make.com", 6],
  ["zapier", 4],
  ["webhook", 5],
  ["integration", 5],
  ["automation", 6],
  ["typescript", 5],
  ["next.js", 4],
  ["react", 3],
  ["postgres", 3],
  ["self-hosted", 5],
  ["no-code", 5],
  ["low-code", 5],

  // Working with people, which is where the karting and client years count.
  ["client-facing", 5],
  ["stakeholder", 4],
  ["consultancy", 4],
  ["scoping", 4],
  ["requirements", 3],
  ["project management", 4],

  // The kind of place that hires him.
  ["startup", 4],
  ["small team", 5],
  ["generalist", 5],
  ["full-stack", 5],
  ["full stack", 5],

  // Employers who hire on evidence rather than credentials.
  ["no degree", 8],
  ["degree not required", 8],
  ["equivalent experience", 7],
  ["portfolio", 5],
  ["self-taught", 5],
];

/**
 * The most the evidence list can contribute.
 *
 * Without a ceiling, a wordy advert that happens to say "automation",
 * "integration" and "stakeholder" would out-score a genuinely better job, and
 * every result would drift into Tier 1 — at which point the tiers stop telling
 * him anything.
 */
const MAX_EVIDENCE = 30;

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
 * Doors that are shut regardless of how well the rest of the advert reads.
 *
 * He has a BEng in Civil Engineering, so "a degree" is not the barrier —
 * "a degree in Computer Science" is.
 */
const SHUT_DOOR_PATTERNS: ReadonlyArray<[RegExp, string, number]> = [
  [
    /\b(bsc|msc|phd|degree)\b[^.]{0,60}\b(computer science|software engineering|mathematics)\b/i,
    "computer science degree required",
    15,
  ],
  [
    /\b(phd|doctorate)\b[^.]{0,40}\b(required|essential)\b/i,
    "doctorate required",
    20,
  ],
  [
    /\bmust have\b[^.]{0,40}\bsecurity clearance\b/i,
    "security clearance required",
    15,
  ],
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

/**
 * Where every job starts.
 *
 * Lowered from 50 when the evidence list was added: roughly 30 more points are
 * now available to a good advert, and without dropping the floor every result
 * drifted into Tier 1. Measured against the same six fixture adverts before and
 * after, so the tiers still separate the same way.
 *
 * 38 rather than a round number for a reason: it sits just under the Tier 2
 * line of 40, so an advert with NOTHING going for it is discarded, and one with
 * a single concrete signal — one real tool, one honest phrase about how they
 * work — earns a place on the board. That is the behaviour worth having.
 */
const BASE_SCORE = 38;

export interface ScoreReason {
  term: string;
  points: number;
}

export interface JobScore {
  score: number;
  tier: Tier;
  boosts: ScoreReason[];
  penalties: ScoreReason[];
  /** What this advert asks for that he CAN evidence. The other half of gaps. */
  evidence: ScoreReason[];
  /** What the evidence list actually contributed, after the cap. */
  evidenceScore: number;
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

  for (const [pattern, label, points] of [
    ...TENURE_PATTERNS,
    ...SHUT_DOOR_PATTERNS,
  ]) {
    if (pattern.test(text)) penalties.push({ term: label, points });
  }

  // Scored separately so the cap can be applied to this group alone, and so
  // the card can show "what you bring" apart from "what they asked for".
  const evidence: ScoreReason[] = [];
  for (const [term, points] of EVIDENCE) {
    if (mentions(text, term)) evidence.push({ term, points });
  }
  const evidenceScore = Math.min(
    MAX_EVIDENCE,
    evidence.reduce((sum, e) => sum + e.points, 0)
  );

  const raw =
    BASE_SCORE +
    boosts.reduce((sum, b) => sum + b.points, 0) +
    evidenceScore -
    penalties.reduce((sum, p) => sum + p.points, 0);

  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    tier: tierFor(score),
    boosts,
    penalties,
    evidence,
    evidenceScore,
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
