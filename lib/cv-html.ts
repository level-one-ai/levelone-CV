import { readFile } from "node:fs/promises";
import path from "node:path";

import type { GeneratedApplication, MasterCv } from "@/lib/types";

/**
 * Turns the CV template into finished HTML, ready for Chromium to print.
 *
 * This is deliberately NOT a template engine. Scalars are simple
 * `{{name}}` swaps, and every repeating section is built here in TypeScript
 * and dropped in as one `{{something_html}}` block. That keeps the stored
 * template plain HTML — you can open it, move a section, restyle it, and never
 * have to learn a loop syntax or worry about breaking a control structure.
 */

/** Everything interpolated goes through here. A company called "Smith & Co"
 *  must not be able to break the layout, and a stray `<` must never become
 *  markup. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Splits a full name into the two lines the design stacks. */
function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

export interface EducationEntry {
  title: string;
  school: string;
  dates: string;
  /** Subject-and-grade lines belonging to this entry. */
  details: string[];
}

/**
 * Education is typed as one entry per line on the profile, with parts
 * separated by `|`:
 *
 *   BEng (Hons) Civil Engineering | Granton College | 2019 - 2022
 *
 * A line starting with `-` is a detail of the entry above it, which is how a
 * school's subjects and grades are listed:
 *
 *   Boroughmuir High School | Edinburgh
 *   - Maths: Credit 2, Higher B, Advanced Higher A
 *   - Physics: Credit 2, Higher B, Advanced Higher B
 *
 * Any part may be left out. A qualification with no dates renders without a
 * date line rather than with an empty one.
 */
export function parseEducation(raw: string): EducationEntry[] {
  const entries: EducationEntry[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[-•*]\s*/.test(trimmed)) {
      // A detail line with nothing above it would be silently dropped, so
      // promote it to an entry of its own instead of losing the content.
      const detail = trimmed.replace(/^[-•*]\s*/, "");
      const last = entries[entries.length - 1];
      if (last) last.details.push(detail);
      else entries.push({ title: detail, school: "", dates: "", details: [] });
      continue;
    }

    const [title = "", school = "", dates = ""] = trimmed
      .split("|")
      .map((part) => part.trim());
    entries.push({ title, school, dates, details: [] });
  }

  return entries;
}

function photoBlock(photo: { data: Buffer; mime: string } | null): string {
  if (!photo) {
    // No photo uploaded yet. Show a neutral panel rather than a hole.
    return '<div class="photo-empty">LEVEL ONE</div>';
  }
  const base64 = photo.data.toString("base64");
  // Inlined as a data URI so Chromium never has to fetch anything: no network,
  // no PocketBase token in the markup, no race between load and print.
  //
  // The .photo-frame wrapper is what carries the fade into the sidebar. The
  // gradient cannot live on the <img> itself — a replaced element has no
  // generated content, so ::after on an image never renders.
  return (
    `<div class="photo-frame">` +
    `<img class="photo" src="data:${photo.mime};base64,${base64}" alt="" />` +
    `</div>`
  );
}

function contactBlock(cv: MasterCv): string {
  const rows: Array<[string, string]> = [];
  if (cv.profile.phone) rows.push(["Phone:", cv.profile.phone]);
  if (cv.profile.location) rows.push(["Address:", cv.profile.location]);
  if (cv.profile.email) rows.push(["Email:", cv.profile.email]);
  for (const [label, url] of Object.entries(cv.profile.links)) {
    rows.push([`${label}:`, url.replace(/^https?:\/\//, "")]);
  }

  return rows
    .map(
      ([label, value]) =>
        `<div class="contact-item"><div class="contact-label">${esc(label)}</div>` +
        `<div class="contact-value">${esc(value)}</div></div>`
    )
    .join("\n");
}

function skillsBlock(skills: string[]): string {
  if (!skills.length) return "";
  return `<ul class="skill-list">${skills
    .map((skill) => `<li>${esc(skill)}</li>`)
    .join("")}</ul>`;
}

function educationBlock(raw: string): string {
  const entries = parseEducation(raw);
  if (!entries.length) return "";

  return `<ul class="edu-list">${entries
    .map((entry) => {
      // Empty parts produce nothing at all. An entry with no dates should not
      // leave a blank line where a date would have been.
      const parts = [`<div class="edu-title">${esc(entry.title)}</div>`];
      if (entry.school) {
        parts.push(`<div class="edu-meta">${esc(entry.school)}</div>`);
      }
      if (entry.dates) {
        parts.push(`<div class="edu-meta">${esc(entry.dates)}</div>`);
      }
      if (entry.details.length) {
        parts.push(
          `<ul class="edu-detail">${entry.details
            .map((detail) => `<li>${esc(detail)}</li>`)
            .join("")}</ul>`
        );
      }
      return `<li>${parts.join("")}</li>`;
    })
    .join("")}</ul>`;
}

function toolsBlock(tools: string[]): string {
  if (!tools.length) return "";
  return `<ul class="tool-list">${tools
    .map((tool) => `<li>${esc(tool)}</li>`)
    .join("")}</ul>`;
}

function experienceBlock(application: GeneratedApplication): string {
  return application.tailored_experience
    .map(
      (job) =>
        `<div class="job">` +
        `<p class="job-role">${esc(job.role)}</p>` +
        `<p class="job-meta">${esc(job.company)}${job.dates ? ` / ${esc(job.dates)}` : ""}</p>` +
        `<ul>${job.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` +
        `</div>`
    )
    .join("\n");
}

function projectsBlock(application: GeneratedApplication): string {
  return application.tailored_projects
    .map(
      (project) =>
        `<div class="project">` +
        `<p class="project-name">${esc(project.name)}</p>` +
        `<p class="project-desc">${esc(project.description)}</p>` +
        (project.tech
          ? `<p class="project-tech">${esc(project.tech)}</p>`
          : "") +
        `</div>`
    )
    .join("\n");
}

/** A tidy, sortable filename: `CV-Dean-Finlayson-AI-Engineer-Acme.pdf`. */
export function buildFileName(
  application: GeneratedApplication,
  fullName: string
): string {
  const slug = (value: string) =>
    value
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  const parts = ["CV", slug(fullName), slug(application.job_title)];
  if (application.company) parts.push(slug(application.company));

  return `${parts.filter(Boolean).join("-")}.pdf`;
}

/** Where the built-in template lives when PocketBase has no copy yet. */
export function defaultTemplatePath(): string {
  return path.join(process.cwd(), "templates", "cv-template.html");
}

export async function readDefaultTemplate(): Promise<string> {
  return readFile(defaultTemplatePath(), "utf8");
}

/**
 * Fills every placeholder in the template.
 *
 * Unknown `{{tags}}` are replaced with an empty string rather than left in
 * place: a stray `{{oops}}` printed onto a CV that goes to an employer is far
 * worse than a missing word.
 */
export function buildCvHtml({
  template,
  application,
  cv,
  photo,
}: {
  template: string;
  application: GeneratedApplication;
  cv: MasterCv;
  photo: { data: Buffer; mime: string } | null;
}): string {
  const { first, last } = splitName(cv.profile.full_name);

  const values: Record<string, string> = {
    // --- scalars ---
    full_name: esc(cv.profile.full_name),
    first_name: esc(first),
    last_name: esc(last),
    // Gemini's tailored job title, falling back to the profile's own headline.
    headline: esc(application.cv_headline || cv.profile.headline),
    summary: esc(application.resume_summary || cv.profile.master_summary),
    job_title: esc(application.job_title),
    company: esc(application.company),
    email: esc(cv.profile.email),
    phone: esc(cv.profile.phone),
    location: esc(cv.profile.location),

    // --- blocks the app builds ---
    photo_html: photoBlock(photo),
    contact_html: contactBlock(cv),
    // SKILLS are the human ones — problem-solving, communication. They read
    // the same to every employer, so they are printed as written and never
    // reshuffled by the model.
    skills_html: skillsBlock(cv.skills),
    // TOOLS are the keyword list an applicant tracking system scans for, so
    // this is the part worth tailoring: Gemini puts the tools the advert names
    // first, and the profile's own list is the fallback.
    tools_html: toolsBlock(
      application.skills_matched.length
        ? application.skills_matched
        : cv.profile.tools
    ),
    education_html: educationBlock(cv.profile.education),
    experience_html: experienceBlock(application),
    projects_html: projectsBlock(application),
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key.toLowerCase())
      ? values[key.toLowerCase()]
      : ""
  );
}
