import { mentions } from "@/lib/job-filter";
import type { MasterCv } from "@/lib/types";

/**
 * What the candidate can actually evidence, and where the proof lives.
 *
 * The old scorer was handed `[...cv.profile.tools, ...cv.skills]` — a flat list
 * of strings with no provenance. It could tell you "n8n is on his tools list";
 * it could not tell you "he built four systems with it". The difference matters
 * on a job card, because a tool you have shipped with is an answer to an
 * interview question and a tool on a list is a liability.
 *
 * So this reads `cv_projects.tech` as well, keeps the project name against every
 * tool it appears in, and marks a capability `proven` when at least one source
 * is a shipped project rather than a self-declared list entry.
 *
 * Pure functions over a loaded MasterCv — no network, no database — so the same
 * index can be built in a script, an API route or a test.
 */

export type CapabilitySourceKind = "tool" | "skill" | "project";

export interface CapabilitySource {
  kind: CapabilitySourceKind;
  /** The project name, or the raw tool/skill entry it came from. */
  label: string;
}

export interface Capability {
  /** The entry as written in the CV, lower-cased: "n8n", "rest apis". */
  id: string;
  sources: CapabilitySource[];
  /** True when at least one source is a project. A shipped thing, not a claim. */
  proven: boolean;
}

export interface CapabilityProfile {
  /** Keyed by lower-cased entry. */
  capabilities: Map<string, Capability>;
  /**
   * Everything the CV says, as one lower-cased blob.
   *
   * The discrete list above answers "does he have this tool". Plenty of what an
   * advert asks for is not a tool — "end to end", "client-facing", "greenfield",
   * "Edinburgh" — and the evidence for those is in the prose: experience
   * bullets, project descriptions and outcomes. Matching against the blob is
   * how those requirements get an honest yes.
   */
  corpus: string;
  /** Every capability id, for callers that just want the flat list. */
  terms: string[];
}

/**
 * Facts about the candidate that are true but written down nowhere.
 *
 * An advert saying "degree not required" or "Edinburgh" is asking about
 * circumstances, and circumstances do not appear in a tools field. Without
 * these lines the circumstance component of every score would read as a miss.
 *
 * Location comes from the profile record; the rest is the standing context the
 * prompt already injects (see `candidateContext()` in lib/gemini.ts).
 */
const STANDING_FACTS = [
  "uk",
  "united kingdom",
  "remote",
  "hybrid",
  "available immediately",
  "no notice period",
  "self-taught",
  "portfolio",
  "equivalent experience",
  "degree",
];

function addSource(
  capabilities: Map<string, Capability>,
  entry: string,
  source: CapabilitySource
): void {
  const id = entry.trim().toLowerCase();
  if (!id) return;

  const existing = capabilities.get(id);
  if (existing) {
    // The same tool on the tools list AND on three projects is one capability
    // with four sources, not four capabilities.
    if (!existing.sources.some((s) => s.kind === source.kind && s.label === source.label)) {
      existing.sources.push(source);
    }
    if (source.kind === "project") existing.proven = true;
    return;
  }

  capabilities.set(id, {
    id,
    sources: [source],
    proven: source.kind === "project",
  });
}

export function buildCapabilityProfile(cv: MasterCv): CapabilityProfile {
  const capabilities = new Map<string, Capability>();

  for (const tool of cv.profile.tools) {
    addSource(capabilities, tool, { kind: "tool", label: tool.trim() });
  }

  for (const skill of cv.skills) {
    addSource(capabilities, skill, { kind: "skill", label: skill.trim() });
  }

  for (const project of cv.projects) {
    const label = project.name.trim() || "an unnamed project";
    for (const tech of project.tech) {
      addSource(capabilities, tech, { kind: "project", label });
    }
  }

  const corpus = [
    cv.profile.headline,
    cv.profile.location,
    cv.profile.master_summary,
    cv.profile.education,
    ...cv.profile.tools,
    ...cv.skills,
    ...cv.experience.flatMap((job) => [job.role, job.company, job.location, ...job.bullets]),
    ...cv.projects.flatMap((project) => [
      project.role,
      project.description,
      project.outcome,
      ...project.tech,
    ]),
    ...STANDING_FACTS,
  ]
    .join("\n")
    .toLowerCase();

  return {
    capabilities,
    corpus,
    terms: [...capabilities.keys()],
  };
}

/** An empty profile, for callers with no CV to hand. Matches nothing. */
export function emptyCapabilityProfile(): CapabilityProfile {
  return { capabilities: new Map(), corpus: "", terms: [] };
}

export interface CapabilityHit {
  /** The CV entry that satisfied the requirement. */
  id: string;
  /** Project name where there is one, otherwise the tool or skill entry. */
  via: string;
  proven: boolean;
}

/**
 * Does the CV cover any of these aliases, and what is the best proof?
 *
 * Checks the discrete capability list first and prefers a project source — the
 * whole point of reading cv_projects is being able to say WHERE a tool was
 * used. Falls back to the prose corpus, which answers the requirements that
 * were never going to be in a tools field.
 *
 * Matching is generous in both directions, the way the old `matchesProfile`
 * was: a CV entry of "REST APIs" covers a requirement of "rest api", and a CV
 * entry of "Claude API" covers "llm api" only if an alias says so — aliases,
 * not fuzziness, do the semantic work.
 */
export function findCapability(
  profile: CapabilityProfile,
  aliases: readonly string[],
  /** Phrases that prove the requirement but never signal it — see Requirement. */
  evidence: readonly string[] = []
): CapabilityHit | null {
  let fallback: CapabilityHit | null = null;
  const proofs = [...aliases, ...evidence];

  for (const capability of profile.capabilities.values()) {
    const covers = proofs.some(
      (alias) =>
        capability.id === alias ||
        mentions(capability.id, alias) ||
        mentions(alias, capability.id)
    );
    if (!covers) continue;

    const project = capability.sources.find((source) => source.kind === "project");
    if (project) {
      return { id: capability.id, via: project.label, proven: true };
    }
    // Keep looking: another capability might be project-backed, and a project
    // is a better answer than a list entry.
    fallback ??= {
      id: capability.id,
      via: capability.sources[0]?.label ?? capability.id,
      proven: false,
    };
  }

  if (fallback) return fallback;

  const inProse = proofs.find((proof) => mentions(profile.corpus, proof));
  return inProse ? { id: inProse, via: "your experience", proven: false } : null;
}
