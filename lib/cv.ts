import type PocketBase from "pocketbase";

import { COLLECTIONS, describePocketBaseError } from "@/lib/pocketbase";
import type {
  CvExperience,
  CvProfile,
  CvProject,
  CvSkill,
  MasterCv,
} from "@/lib/types";

/**
 * PocketBase `json` fields come back already parsed, but a value typed into
 * the Admin UI as a bare line of text arrives as a string — and an empty one
 * arrives as `""`. Both are common while filling the CV in by hand, so accept
 * either and always hand the caller a list.
 */
function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if (text.startsWith("[")) {
      try {
        return asList(JSON.parse(text));
      } catch {
        // Not valid JSON after all — fall through to line splitting.
      }
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function asLinkMap(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        String(v),
      ])
    );
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return asLinkMap(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Reads the whole master CV in one pass.
 *
 * The four collections are independent, so they are fetched in parallel — the
 * request already spends seconds inside Gemini, and there is no reason to add
 * four serial round trips on top of it.
 */
export async function loadMasterCv(pb: PocketBase): Promise<MasterCv> {
  let profileRaw;
  let experienceRaw;
  let skillsRaw;
  let projectsRaw;

  try {
    [profileRaw, experienceRaw, skillsRaw, projectsRaw] = await Promise.all([
      // No sort on the profile: it holds a single row, and sorting by a
      // timestamp would make the read depend on the optional `updated`
      // autodate field existing.
      pb.collection(COLLECTIONS.profile).getFullList(),
      pb.collection(COLLECTIONS.experience).getFullList({ sort: "order" }),
      pb.collection(COLLECTIONS.skills).getFullList({ sort: "order" }),
      pb.collection(COLLECTIONS.projects).getFullList({ sort: "order" }),
    ]);
  } catch (err) {
    throw new Error(describePocketBaseError(err));
  }

  const first = profileRaw[0];
  if (!first) {
    throw new Error(
      `No record found in the "${COLLECTIONS.profile}" collection. Add one row with your name, headline and summary — see SETUP.md step 5.`
    );
  }

  const profile: CvProfile = {
    id: first.id,
    full_name: String(first.full_name ?? ""),
    headline: String(first.headline ?? ""),
    email: String(first.email ?? ""),
    phone: String(first.phone ?? ""),
    location: String(first.location ?? ""),
    links: asLinkMap(first.links),
    master_summary: String(first.master_summary ?? ""),
  };

  const experience: CvExperience[] = experienceRaw.map((r) => ({
    id: r.id,
    company: String(r.company ?? ""),
    role: String(r.role ?? ""),
    start_date: String(r.start_date ?? ""),
    end_date: String(r.end_date ?? ""),
    location: String(r.location ?? ""),
    bullets: asList(r.bullets),
    order: Number(r.order ?? 0),
  }));

  const skills: CvSkill[] = skillsRaw.map((r) => ({
    id: r.id,
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    proficiency: String(r.proficiency ?? ""),
    order: Number(r.order ?? 0),
  }));

  const projects: CvProject[] = projectsRaw.map((r) => ({
    id: r.id,
    name: String(r.name ?? ""),
    role: String(r.role ?? ""),
    description: String(r.description ?? ""),
    tech: asList(r.tech),
    outcome: String(r.outcome ?? ""),
    link: String(r.link ?? ""),
    order: Number(r.order ?? 0),
  }));

  return { profile, experience, skills, projects };
}

/**
 * Flattens the CV into the plain text block that goes into the prompt.
 * Gemini reads this far more reliably than raw PocketBase JSON, which is full
 * of ids and timestamps that only invite the model to invent things.
 */
export function formatCvForPrompt(cv: MasterCv): string {
  const { profile, experience, skills, projects } = cv;

  const lines: string[] = [
    `NAME: ${profile.full_name}`,
    `HEADLINE: ${profile.headline}`,
    `LOCATION: ${profile.location}`,
    "",
    "MASTER SUMMARY:",
    profile.master_summary || "(none written yet)",
    "",
    "WORK HISTORY:",
  ];

  for (const job of experience) {
    lines.push(
      `- ${job.role} at ${job.company} (${job.start_date} – ${job.end_date || "present"})${
        job.location ? `, ${job.location}` : ""
      }`
    );
    for (const bullet of job.bullets) lines.push(`    * ${bullet}`);
  }

  lines.push("", "SKILLS:");
  for (const skill of skills) {
    lines.push(
      `- ${skill.name}${skill.category ? ` [${skill.category}]` : ""}${
        skill.proficiency ? ` — ${skill.proficiency}` : ""
      }`
    );
  }

  lines.push("", "AI PROJECTS:");
  for (const project of projects) {
    lines.push(
      `- ${project.name}${project.role ? ` (${project.role})` : ""}: ${project.description}`
    );
    if (project.tech.length) lines.push(`    Tech: ${project.tech.join(", ")}`);
    if (project.outcome) lines.push(`    Outcome: ${project.outcome}`);
  }

  return lines.join("\n");
}
