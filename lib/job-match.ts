import {
  findCapability,
  type CapabilityProfile,
  emptyCapabilityProfile,
} from "@/lib/capabilities";
import { BANNED_SKILLS, mentions } from "@/lib/job-filter";

/**
 * How well can this advert be answered from the CV?
 *
 * The scorer this replaces (lib/job-score.ts) started every advert at 38 points
 * and added fixed weights for LangGraph, RAG, vector databases and FastAPI —
 * none of which are anywhere in the CV. Its own comment admitted the number
 * measured "how well the ADVERT matches the target profile — not how qualified
 * the candidate is for it", and a `gaps` banner underneath tried to undo the
 * damage in prose.
 *
 * This asks the honest question instead. Work out what the advert actually
 * demands, check each demand against the capability index built from tools,
 * skills AND cv_projects.tech, and express the score as the share of those
 * demands that can be evidenced. A 90 now means "nine tenths of what they asked
 * for, you have shipped", and the missing list is the other tenth by
 * construction rather than by afterthought.
 *
 * Pure functions over strings and a CapabilityProfile, same as before, so the
 * weights can be tuned against real adverts without running a scrape.
 */

export type Tier = "tier-1" | "tier-2" | "discard";

export const TIER_1_MIN = 70;
export const TIER_2_MIN = 40;

export type RequirementGroup = "tech" | "role" | "ways-of-working" | "circumstance";

export interface Requirement {
  /** Canonical name, shown on the card. */
  id: string;
  /** Every spelling an advert might use, including the id itself. */
  aliases: string[];
  group: RequirementGroup;
  /** What it costs to be missing this, relative to the group's other entries. */
  weight: number;
  /**
   * Extra phrases that count as PROOF but never as a demand.
   *
   * The two directions are not the same question, and treating them as one was
   * costing real coverage. "Client Communication" is how the CV says
   * client-facing, so it should satisfy an advert asking for client-facing —
   * but an advert saying "founder" is certainly not asking for a consultant,
   * and n8n on a tools list is proof of low-code work without being a request
   * for it. So these are checked against the CV only.
   */
  evidence?: string[];
}

/**
 * Everything an advert can ask for that this board knows how to reason about.
 *
 * Deliberately includes plenty the candidate does NOT have — Python, LangChain,
 * vector databases, Kubernetes, AWS. Those entries are the point: an advert
 * built on them should score low, and it can only do that if the table knows to
 * look for them. A taxonomy of only his own tools would score every job 100.
 */
export const REQUIREMENTS: readonly Requirement[] = [
  // ---- Automation and integration: the core of what he actually does. ----
  { id: "n8n", aliases: ["n8n"], group: "tech", weight: 6 },
  { id: "Make.com", aliases: ["make.com", "integromat"], group: "tech", weight: 4 },
  { id: "Zapier", aliases: ["zapier"], group: "tech", weight: 3 },
  { id: "webhooks", aliases: ["webhook", "webhooks"], group: "tech", weight: 4 },
  { id: "REST APIs", aliases: ["rest api", "restful", "api integration"], group: "tech", weight: 5 },
  {
    id: "workflow automation",
    aliases: ["workflow automation", "process automation", "business process automation"],
    group: "tech",
    weight: 5,
    evidence: ["n8n", "make.com", "automation", "pipeline"],
  },
  { id: "no-code / low-code", aliases: ["no-code", "no code", "low-code", "low code", "citizen developer"], group: "tech", weight: 4, evidence: ["n8n", "make.com", "zapier"] },
  { id: "RPA", aliases: ["rpa", "robotic process automation", "uipath", "blue prism"], group: "tech", weight: 3 },
  { id: "Power Automate", aliases: ["power automate", "power platform"], group: "tech", weight: 3 },
  { id: "Airtable", aliases: ["airtable"], group: "tech", weight: 2 },
  { id: "Salesforce", aliases: ["salesforce", "apex"], group: "tech", weight: 3 },
  { id: "HubSpot", aliases: ["hubspot"], group: "tech", weight: 2 },
  { id: "Zendesk", aliases: ["zendesk", "intercom"], group: "tech", weight: 2 },

  // ---- LLM work. ----
  { id: "LLM APIs", aliases: ["llm", "llms", "large language model", "openai api", "anthropic api", "claude api", "gemini api", "gpt-4", "chatgpt api"], group: "tech", weight: 6 },
  { id: "prompt engineering", aliases: ["prompt engineering", "prompt design", "system prompt", "prompting"], group: "tech", weight: 5, evidence: ["claude api", "chatgpt api", "gemini", "openai"] },
  { id: "agentic AI", aliases: ["agentic", "ai agent", "ai agents", "multi-agent", "agent framework"], group: "tech", weight: 5 },
  { id: "structured outputs", aliases: ["structured output", "function calling", "tool use", "json schema"], group: "tech", weight: 3 },
  { id: "RAG", aliases: ["rag", "retrieval augmented", "retrieval-augmented"], group: "tech", weight: 6 },
  { id: "LangChain", aliases: ["langchain"], group: "tech", weight: 5 },
  { id: "LangGraph", aliases: ["langgraph"], group: "tech", weight: 5 },
  { id: "vector databases", aliases: ["vector database", "vector db", "pinecone", "weaviate", "chroma", "qdrant", "pgvector", "embeddings"], group: "tech", weight: 5 },
  { id: "model fine-tuning", aliases: ["fine-tuning", "fine tuning", "lora", "model training"], group: "tech", weight: 4 },
  { id: "machine learning", aliases: ["machine learning", "pytorch", "tensorflow", "scikit-learn", "deep learning", "nlp models"], group: "tech", weight: 5 },
  { id: "MLOps", aliases: ["mlops", "model deployment", "model monitoring", "feature store"], group: "tech", weight: 4 },

  // ---- Languages and frameworks. ----
  { id: "Python", aliases: ["python"], group: "tech", weight: 6 },
  { id: "FastAPI", aliases: ["fastapi", "flask", "django"], group: "tech", weight: 4 },
  { id: "TypeScript", aliases: ["typescript"], group: "tech", weight: 5 },
  { id: "JavaScript", aliases: ["javascript", "node.js", "nodejs", "node"], group: "tech", weight: 4 },
  { id: "React", aliases: ["react", "react.js"], group: "tech", weight: 4 },
  { id: "Next.js", aliases: ["next.js", "nextjs"], group: "tech", weight: 3 },
  { id: "Go", aliases: ["golang"], group: "tech", weight: 4 },
  { id: "Rust", aliases: ["rust"], group: "tech", weight: 3 },

  // ---- Infrastructure and data. ----
  { id: "Docker", aliases: ["docker", "containers", "containerisation", "containerization"], group: "tech", weight: 4 },
  { id: "Kubernetes", aliases: ["kubernetes", "k8s", "helm"], group: "tech", weight: 4 },
  { id: "Linux / VPS", aliases: ["linux", "vps", "ubuntu", "self-hosted", "self hosted"], group: "tech", weight: 3 },
  { id: "AWS", aliases: ["aws", "amazon web services", "lambda", "s3", "bedrock"], group: "tech", weight: 5 },
  { id: "Azure", aliases: ["azure", "azure openai"], group: "tech", weight: 5 },
  { id: "GCP", aliases: ["gcp", "google cloud", "vertex ai", "bigquery"], group: "tech", weight: 4 },
  { id: "Terraform", aliases: ["terraform", "infrastructure as code", "pulumi"], group: "tech", weight: 3 },
  { id: "CI/CD", aliases: ["ci/cd", "continuous integration", "github actions", "jenkins", "gitlab ci"], group: "tech", weight: 3 },
  { id: "PostgreSQL", aliases: ["postgres", "postgresql"], group: "tech", weight: 4 },
  { id: "SQL", aliases: ["sql", "mysql", "sql server"], group: "tech", weight: 3 },
  { id: "NoSQL", aliases: ["mongodb", "dynamodb", "firebase", "firestore", "redis"], group: "tech", weight: 3 },
  { id: "data pipelines", aliases: ["data pipeline", "etl", "elt", "airflow", "dbt"], group: "tech", weight: 4 },
  { id: "Git", aliases: ["git", "version control"], group: "tech", weight: 2 },
  { id: "payments", aliases: ["stripe", "gocardless", "payment integration"], group: "tech", weight: 2 },

  // ---- Role shape: what KIND of job this is. ----
  { id: "hands-on building", aliases: ["hands-on", "hands on", "individual contributor", "builder", "build and ship"], group: "role", weight: 5, evidence: ["designed and built", "built", "engineer"] },
  { id: "full-stack", aliases: ["full-stack", "full stack"], group: "role", weight: 4, evidence: ["next.js", "typescript", "postgresql"] },
  { id: "generalist", aliases: ["generalist", "wear many hats", "broad remit"], group: "role", weight: 4, evidence: ["founder", "adaptability"] },
  { id: "consulting", aliases: ["consultant", "consultancy", "consulting", "advisory", "implementation consultant"], group: "role", weight: 4, evidence: ["founder", "level one", "client", "clients"] },
  { id: "presales", aliases: ["presales", "pre-sales", "solutions engineer", "sales engineer", "discovery call", "demo"], group: "role", weight: 3, evidence: ["client communication", "founder", "pitch", "quoting"] },
  { id: "solution architecture", aliases: ["solution architect", "solutions architect", "system design", "architecture design"], group: "role", weight: 4, evidence: ["systems thinking", "designed and built"] },
  { id: "product management", aliases: ["product manager", "product owner", "roadmap", "product lifecycle", "backlog"], group: "role", weight: 3 },
  { id: "project management", aliases: ["project manag", "programme manag", "program manag", "delivery manag"], group: "role", weight: 3, evidence: ["project management"] },
  { id: "people management", aliases: ["line manage", "people manage", "manage a team", "direct reports", "performance review"], group: "role", weight: 4 },
  { id: "research", aliases: ["research scientist", "publish", "peer-reviewed", "phd research", "novel algorithms"], group: "role", weight: 4 },

  // ---- How the work gets done. ----
  { id: "end-to-end delivery", aliases: ["end to end", "end-to-end", "own the whole", "cradle to grave"], group: "ways-of-working", weight: 5, evidence: ["designed and built", "founder"] },
  { id: "greenfield", aliases: ["greenfield", "from scratch", "zero to one", "0 to 1", "first hire"], group: "ways-of-working", weight: 4, evidence: ["designed and built", "founder", "built"] },
  { id: "ownership", aliases: ["ownership", "autonomy", "self-directed", "take the lead"], group: "ways-of-working", weight: 4, evidence: ["founder", "designed and built"] },
  { id: "client-facing", aliases: ["client-facing", "client facing", "customer-facing", "customer facing", "stakeholder"], group: "ways-of-working", weight: 4, evidence: ["client communication", "client", "clients"] },
  { id: "requirements and scoping", aliases: ["scoping", "requirements gathering", "discovery", "workshops", "business analysis"], group: "ways-of-working", weight: 3, evidence: ["process improvement", "quoting", "estimating"] },
  { id: "rapid prototyping", aliases: ["rapid prototyping", "prototype", "proof of concept", "poc", "mvp"], group: "ways-of-working", weight: 4, evidence: ["designed and built", "founder"] },
  { id: "startup pace", aliases: ["startup", "scale-up", "scaleup", "small team", "fast-paced", "fast paced"], group: "ways-of-working", weight: 4, evidence: ["founder", "level one", "small business"] },
  { id: "production support", aliases: ["production support", "on-call", "on call", "monitoring", "incident"], group: "ways-of-working", weight: 3 },
  { id: "enterprise process", aliases: ["itil", "prince2", "change advisory board", "waterfall", "governance framework"], group: "ways-of-working", weight: 3 },

  // ---- Circumstances. Not skills, and worth as much. ----
  { id: "Edinburgh", aliases: ["edinburgh"], group: "circumstance", weight: 6 },
  { id: "Scotland", aliases: ["scotland", "glasgow"], group: "circumstance", weight: 4 },
  { id: "remote", aliases: ["remote", "work from home", "fully distributed"], group: "circumstance", weight: 5 },
  { id: "hybrid", aliases: ["hybrid"], group: "circumstance", weight: 3 },
  { id: "contract", aliases: ["contract", "inside ir35", "outside ir35", "day rate", "freelance"], group: "circumstance", weight: 3 },
  { id: "immediate start", aliases: ["immediate start", "asap start", "start immediately"], group: "circumstance", weight: 3 },
  { id: "experience over credentials", aliases: ["degree not required", "no degree", "equivalent experience", "self-taught", "portfolio"], group: "circumstance", weight: 5 },
  { id: "relocation required", aliases: ["relocation required", "must relocate", "on-site only", "onsite only", "5 days a week in the office"], group: "circumstance", weight: 5 },
];

/**
 * How the four groups combine. Sums to 1.
 *
 * Tech carries half because it is the half an advert screens on and the half a
 * CV can be caught out on. Circumstance is deliberately as heavy as
 * ways-of-working: a perfect job in London that demands five days on-site is
 * not a good match, however well the stack lines up.
 */
export const GROUP_WEIGHTS: Record<RequirementGroup, number> = {
  tech: 0.5,
  role: 0.2,
  "ways-of-working": 0.15,
  circumstance: 0.15,
};

/**
 * What a group scores when the advert asks nothing of it.
 *
 * Neither a pass nor a fail. An advert that never mentions where you sit has
 * not rejected you for living in Edinburgh, and scoring that 0 would punish
 * every terse advert; scoring it 1 would flatter every one of them.
 */
const NEUTRAL = 0.5;

/** Requirements named in a must-have section, or repeatedly, count for more. */
const EMPHASIS_MULTIPLIER = 1.5;

/**
 * Where an advert states its non-negotiables.
 *
 * Everything from one of these headings to the next blank-line-separated
 * heading is treated as emphasised. Adverts that use no headings at all fall
 * back to the repetition rule below, which is why both exist.
 */
const MUST_HAVE_HEADINGS =
  /^\s*(?:[-*•\d.\s]*)?(essential|must[- ]have|requirements?|what you(?:'|’)?ll need|you will have|about you|key skills|required skills)\b.*$/gim;

/**
 * Hard blockers. These multiply rather than subtract.
 *
 * A flat penalty can be out-shouted: a wordy advert naming twelve tools he has
 * could absorb -30 for being a .NET role and still reach Tier 2. A multiplier
 * cannot be argued with, which is the correct behaviour for "this is not your
 * stack" and "they want ten years you do not have".
 */
const BLOCKERS: ReadonlyArray<{ test: RegExp | string[]; label: string; factor: number }> = [
  { test: BANNED_SKILLS as string[], label: "built on a stack you do not work in", factor: 0.35 },
  {
    test: /\b(bsc|msc|phd|degree)\b[^.]{0,60}\b(computer science|software engineering|mathematics)\b/i,
    label: "computer science degree required",
    factor: 0.7,
  },
  { test: /\b(phd|doctorate)\b[^.]{0,40}\b(required|essential)\b/i, label: "doctorate required", factor: 0.7 },
  { test: /\bmust have\b[^.]{0,40}\bsecurity clearance\b/i, label: "security clearance required", factor: 0.7 },
  { test: /\b(1[0-9]|[2-9][0-9])\+?\s*years?\b/i, label: "10+ years required", factor: 0.7 },
  {
    test: /\b(manag(e|ing)|lead(ing)?)\s+(a\s+)?(team|department)\s+of\s+([5-9][0-9]|[1-9][0-9]{2,})\b/i,
    label: "large-team people management",
    factor: 0.7,
  },
  { test: /\b(head of|director of)\s+(engineering|technology|delivery)\b/i, label: "senior people-management role", factor: 0.7 },
];

/** However many blockers fire, the score is never cut by more than this. */
const MIN_BLOCKER_FACTOR = 0.35;

/**
 * The ceiling on a score computed from a snippet.
 *
 * Adzuna returns a couple of hundred characters. A snippet that happens to name
 * two tools he has would otherwise sail to 95 on a two-requirement sample, and
 * "95%, computed from three sentences" is a worse number than no number.
 */
const PARTIAL_CEILING = 75;

export interface MatchedRequirement {
  id: string;
  group: RequirementGroup;
  weight: number;
  /** The project, tool or skill that proves it. */
  via: string;
  /** True when the proof is a shipped project rather than a list entry. */
  proven: boolean;
}

export interface MissingRequirement {
  id: string;
  group: RequirementGroup;
  weight: number;
}

export interface JobMatch {
  score: number;
  tier: Tier;
  /** What the advert asks for and the CV can evidence. */
  matched: MatchedRequirement[];
  /** What it asks for that nothing in the CV covers. The honest gap list. */
  missing: MissingRequirement[];
  blockers: Array<{ label: string; factor: number }>;
  /** Each group's coverage, 0-1, before weighting. For the card's breakdown. */
  components: Record<RequirementGroup, number>;
  /** Computed from a snippet rather than the whole advert. */
  partial?: boolean;
}

function emphasisedRegions(text: string): string {
  const regions: string[] = [];
  const headings = [...text.matchAll(MUST_HAVE_HEADINGS)];

  for (const heading of headings) {
    const start = (heading.index ?? 0) + heading[0].length;
    // To the next blank line followed by a non-list line, or 1200 chars — long
    // enough for a real requirements list, short enough not to swallow the rest.
    const rest = text.slice(start, start + 1200);
    const end = rest.search(/\n\s*\n\s*[A-Z][^\n]{0,60}\n/);
    regions.push(end > 0 ? rest.slice(0, end) : rest);
  }

  return regions.join("\n");
}

/** Weight this requirement carries in THIS advert. */
function weightIn(requirement: Requirement, text: string, emphasised: string): number {
  if (emphasised && requirement.aliases.some((alias) => mentions(emphasised, alias))) {
    return requirement.weight * EMPHASIS_MULTIPLIER;
  }

  // No headings to read, or not in them: fall back to how often it is said.
  // Twice is a passing mention; three times is what the job is about.
  const occurrences = requirement.aliases.reduce((count, alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (text.match(new RegExp(escaped, "gi"))?.length ?? 0);
  }, 0);

  return occurrences >= 3 ? requirement.weight * EMPHASIS_MULTIPLIER : requirement.weight;
}

function blockersIn(text: string): Array<{ label: string; factor: number }> {
  return BLOCKERS.filter(({ test }) =>
    Array.isArray(test) ? test.some((term) => mentions(text, term)) : test.test(text)
  ).map(({ label, factor }) => ({ label, factor }));
}

/**
 * @param text     the advert: title, location, type and description together
 * @param profile  the candidate's capability index, from buildCapabilityProfile
 * @param options  `partial` when the description is a search-result snippet
 */
export function matchJob(
  text: string,
  profile: CapabilityProfile = emptyCapabilityProfile(),
  { partial = false }: { partial?: boolean } = {}
): JobMatch {
  const emphasised = emphasisedRegions(text);

  const matched: MatchedRequirement[] = [];
  const missing: MissingRequirement[] = [];
  const demanded: Record<RequirementGroup, number> = {
    tech: 0,
    role: 0,
    "ways-of-working": 0,
    circumstance: 0,
  };
  const covered: Record<RequirementGroup, number> = {
    tech: 0,
    role: 0,
    "ways-of-working": 0,
    circumstance: 0,
  };

  for (const requirement of REQUIREMENTS) {
    // Only what the advert actually asks for counts. Requirements it never
    // mentions are neither met nor missed, and folding them in either way is
    // how you get a score that says more about the taxonomy than the job.
    if (!requirement.aliases.some((alias) => mentions(text, alias))) continue;

    const weight = weightIn(requirement, text, emphasised);
    demanded[requirement.group] += weight;

    const hit = findCapability(profile, requirement.aliases, requirement.evidence);
    if (hit) {
      covered[requirement.group] += weight;
      matched.push({
        id: requirement.id,
        group: requirement.group,
        weight,
        via: hit.via,
        proven: hit.proven,
      });
    } else {
      missing.push({ id: requirement.id, group: requirement.group, weight });
    }
  }

  const components = {} as Record<RequirementGroup, number>;
  let weighted = 0;
  for (const group of Object.keys(GROUP_WEIGHTS) as RequirementGroup[]) {
    const coverage = demanded[group] ? covered[group] / demanded[group] : NEUTRAL;
    components[group] = coverage;
    weighted += coverage * GROUP_WEIGHTS[group];
  }

  const blockers = blockersIn(text);
  const factor = Math.max(
    MIN_BLOCKER_FACTOR,
    blockers.reduce((product, blocker) => product * blocker.factor, 1)
  );

  let score = Math.round(weighted * factor * 100);
  if (partial) score = Math.min(score, PARTIAL_CEILING);
  score = Math.max(0, Math.min(100, score));

  // Heaviest first: the card shows the first few, and the first few should be
  // the ones worth reading.
  matched.sort((a, b) => b.weight - a.weight || Number(b.proven) - Number(a.proven));
  missing.sort((a, b) => b.weight - a.weight);

  return {
    score,
    tier: tierFor(score),
    matched,
    missing,
    blockers,
    components,
    ...(partial ? { partial: true } : {}),
  };
}

export function tierFor(score: number): Tier {
  if (score >= TIER_1_MIN) return "tier-1";
  if (score >= TIER_2_MIN) return "tier-2";
  return "discard";
}

/** A short, readable summary: "n8n, REST APIs · missing Python". */
export function explainMatch(match: JobMatch): string {
  const have = match.matched.slice(0, 4).map((m) => m.id).join(", ");
  const lack = match.missing.slice(0, 3).map((m) => m.id).join(", ");
  return [have && `has ${have}`, lack && `missing ${lack}`].filter(Boolean).join(" · ");
}

/**
 * Is this a JobMatch, or a score_reasons row written by the old scorer?
 *
 * Rows scored before this change have `boosts`/`evidence`/`gaps` and no
 * `components`. They are not worth guessing at — the card falls back to the
 * bare number, and `npm run rescore` replaces them.
 */
export function isJobMatch(value: unknown): value is JobMatch {
  return Boolean(
    value &&
      typeof value === "object" &&
      "components" in (value as Record<string, unknown>) &&
      Array.isArray((value as JobMatch).matched)
  );
}
