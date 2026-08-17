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

/**
 * Education is typed as one entry per line on the profile, with parts
 * separated by `|`:
 *
 *   M.Sc. Human-Computer Interaction | University of California | 2019-2021
 *
 * Anything after the first two parts is treated as the date line, so a missing
 * middle part degrades to something sensible rather than vanishing.
 */
export function parseEducation(
  raw: string
): Array<{ title: string; school: string; dates: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", school = "", dates = ""] = line
        .split("|")
        .map((part) => part.trim());
      return { title, school, dates };
    });
}

function photoBlock(photo: { data: Buffer; mime: string } | null): string {
  if (!photo) {
    // No photo uploaded yet. Show a neutral panel rather than a hole.
    return '<div class="photo-empty">LEVEL ONE</div>';
  }
  const base64 = photo.data.toString("base64");
  // Inlined as a data URI so Chromium never has to fetch anything: no network,
  // no PocketBase token in the markup, no race between load and print.
  return `<img class="photo" src="data:${photo.mime};base64,${base64}" alt="" />`;
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
    .map(
      (entry) =>
        `<li><div class="edu-title">${esc(entry.title)}</div>` +
        `<div class="edu-meta">${esc(entry.school)}</div>` +
        `<div class="edu-meta">${esc(entry.dates)}</div></li>`
    )
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
    skills_html: skillsBlock(
      application.skills_matched.length
        ? application.skills_matched
        : cv.skills
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
