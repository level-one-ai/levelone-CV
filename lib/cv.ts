import type PocketBase from "pocketbase";

import { readDefaultTemplate } from "@/lib/cv-html";
import { COLLECTIONS, describePocketBaseError } from "@/lib/pocketbase";
import type {
  CvExperience,
  CvProfile,
  CvProject,
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

/**
 * Splits the profile's skills line into a list.
 *
 * Deliberately separate from asList() rather than a flag on it: skills are
 * comma-separated, but experience bullets are not, and bullets routinely
 * contain commas ("Grew revenue from £0 to £6k, in nine months"). Teaching
 * asList to split on commas would quietly shred every one of them.
 *
 * Accepts a JSON array too, so a value left over from when skills were their
 * own collection still reads correctly.
 */
function asSkillList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  const text = value.trim();
  if (text.startsWith("[")) {
    try {
      return asSkillList(JSON.parse(text));
    } catch {
      // Not JSON after all — treat it as an ordinary line.
    }
  }

  return text
    .split(/[,\n\r]+/)
    .map((skill) => skill.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
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
 * The three collections are independent, so they are fetched in parallel — the
 * request already spends seconds inside Gemini, and there is no reason to add
 * serial round trips on top of it. Skills ride along on the profile record.
 */
export async function loadMasterCv(pb: PocketBase): Promise<MasterCv> {
  let profileRaw;
  let experienceRaw;
  let projectsRaw;

  try {
    [profileRaw, experienceRaw, projectsRaw] = await Promise.all([
      // No sort on the profile: it holds a single row, and sorting by a
      // timestamp would make the read depend on the optional `updated`
      // autodate field existing.
      pb.collection(COLLECTIONS.profile).getFullList(),
      pb.collection(COLLECTIONS.experience).getFullList({ sort: "order" }),
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
    skills: asSkillList(first.skills),
    education: String(first.education ?? ""),
    photo: String(first.photo ?? ""),
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

  return { profile, experience, skills: profile.skills, projects };
}

/**
 * Downloads the uploaded headshot so it can be inlined into the CV as a data
 * URI. Chromium then needs no network access at print time, and no PocketBase
 * token ever appears in the markup.
 *
 * A missing or unreadable photo is not an error — the template falls back to a
 * plain panel. Nobody should lose a job application because a JPEG went walkies.
 */
export async function loadProfilePhoto(
  pb: PocketBase,
  profile: CvProfile
): Promise<{ data: Buffer; mime: string } | null> {
  if (!profile.photo) return null;

  try {
    const record = await pb.collection(COLLECTIONS.profile).getOne(profile.id);
    const token = await pb.files.getToken();
    const url = pb.files.getURL(record, profile.photo, { token });

    const response = await fetch(url);
    if (!response.ok) return null;

    return {
      data: Buffer.from(await response.arrayBuffer()),
      mime:
        response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}

/**
 * The CV design, preferring the copy in PocketBase so edits made in the admin
 * UI take effect, and falling back to the file shipped in the repo.
 */
export async function loadCvTemplate(pb: PocketBase): Promise<string> {
  try {
    const rows = await pb.collection(COLLECTIONS.template).getFullList();
    const html = String(rows[0]?.html ?? "").trim();
    if (html) return html;
  } catch {
    // No collection, or it is empty — fall through to the shipped default.
  }

  return readDefaultTemplate();
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

  lines.push("", "SKILLS:", skills.join(", ") || "(none listed yet)");

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
