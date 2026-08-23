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
  // Links used to be appended here. They have their own section now, directly
  // below, so they are not printed twice.

  return rows
    .map(
      ([label, value]) =>
        `<div class="contact-item"><div class="contact-label">${esc(label)}</div>` +
        `<div class="contact-value">${esc(value)}</div></div>`
    )
    .join("\n");
}

/**
 * The LINKS panel: portfolio, LinkedIn, GitHub, whatever is in
 * cv_profile.links.
 *
 * Real anchors, so they are clickable in the finished PDF. The visible text
 * drops the scheme and any trailing slash — the full "https://www..." string
 * wraps onto three lines in a 68mm column and reads worse for saying more.
 * The href keeps the whole address, so the link still works.
 *
 * No links configured means no section at all, rather than a heading with
 * nothing under it.
 */
function linksBlock(cv: MasterCv): string {
  const entries = Object.entries(cv.profile.links).filter(
    ([, url]) => typeof url === "string" && url.trim()
  );
  // No links means no section AT ALL. The heading used to live in the
  // template, so an empty field printed "LINKS" over a gap.
  if (!entries.length) return "";

  const rows = entries
    .map(([label, url]) => {
      const href = url.trim();
      // Scheme, "www." and a trailing slash are all noise in a 68mm column,
      // and none of them help a reader find the page. The href keeps them.
      const shown = href
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/$/, "");
      return (
        `<div class="link-item">` +
        `<div class="link-label">${esc(label)}</div>` +
        `<a class="link-value" href="${esc(href)}">${esc(shown)}</a>` +
        `</div>`
      );
    })
    .join("\n");

  return rows;
}

/**
 * The whole LINKS section — <section>, heading and rows — or nothing.
 *
 * Two placeholders exist for this on purpose. The heading cannot live only in
 * the block (an older pasted template already has its own, and you get two) and
 * it cannot live only in the template (an empty links field leaves a heading
 * standing over a gap). So:
 *
 *   {{links_html}}          rows only — safe in a template that has its own <h2>
 *   {{links_section_html}}  the entire section — vanishes when there are none
 *
 * The shipped template uses the second. The first keeps every template Dean has
 * already pasted into PocketBase rendering correctly, which matters because the
 * design lives in the database and drifts from the code between updates.
 */
function linksSectionBlock(cv: MasterCv): string {
  const rows = linksBlock(cv);
  if (!rows) return "";
  return `<section>\n<h2>Links</h2>\n${rows}\n</section>`;
}

/**
 * The SKILLS panel.
 *
 * Gemini now picks which of Dean's skills suit the advert, but it does not get
 * to write them: its choices are matched back against the master list and the
 * MASTER SPELLING is what prints. A skill he never wrote cannot appear, and
 * "Problem-Solving" cannot quietly become "Advanced Problem Resolution".
 *
 * Anything unusable — no selection, or a selection that matches nothing — falls
 * back to the full list. A CV with every skill beats a CV with none.
 */
const MAX_SKILLS = 4;
const MAX_TOOLS = 4;

function chooseSkills(master: string[], selected: string[]): string[] {
  if (!selected.length) return master;

  const byLower = new Map(master.map((skill) => [skill.toLowerCase(), skill]));
  const kept: string[] = [];

  for (const choice of selected) {
    const match = byLower.get(String(choice).trim().toLowerCase());
    if (match && !kept.includes(match)) kept.push(match);
  }

  // Four. The sidebar is what pushed this CV onto a second page, and skills
  // are the cheapest thing on it to cut.
  return (kept.length ? kept : master).slice(0, MAX_SKILLS);
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

/**
 * How many roles get a full block with a sentence under them. Everything older
 * is printed as a single compact line.
 */
const ROLES_IN_FULL = 2;

function experienceBlock(application: GeneratedApplication): string {
  return application.tailored_experience
    .map((job, index) => {
      const meta = `${esc(job.company)}${job.dates ? ` / ${esc(job.dates)}` : ""}`;

      // Older roles: role, employer and dates on one compact line, no
      // sentence. Nothing is dropped and nothing is invented — an early job
      // still counts as history, it just stops being given a paragraph.
      //
      // The prompt asks the model to combine these itself. This is what makes
      // the page safe when it does not.
      if (index >= ROLES_IN_FULL) {
        return (
          `<div class="job job-early">` +
          `<p class="job-role-early">${esc(job.role)}` +
          `<span class="job-meta-early"> — ${meta}</span></p>` +
          `</div>`
        );
      }

      return (
        `<div class="job">` +
        `<p class="job-role">${esc(job.role)}</p>` +
        `<p class="job-meta">${meta}</p>` +
        // ONE sentence per job. The prompt asks for one; this makes it so,
        // because a prompt is a request and a CV that quietly grows a second
        // page is the thing we are trying to stop.
        `<ul>${job.bullets
          .slice(0, 1)
          .map((b) => `<li>${esc(b)}</li>`)
          .join("")}</ul>` +
        `</div>`
      );
    })
    .join("\n");
}

function projectsBlock(application: GeneratedApplication): string {
  return application.tailored_projects
    // Two, and only two — the two that make the best case for this role.
    // Same reasoning as the bullets above: enforced, not requested.
    .slice(0, 2)
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

/**
 * The name a downloaded document is saved under: `Acme_AI_Engineer_cv.pdf`.
 *
 * Employer first, then the role, because that is the order you look for them
 * in: "what did I send Acme?" comes up far more often than "where are all my
 * AI Engineer CVs?".
 *
 * The candidate's name is the fallback for the front slot, not a fixed part —
 * an advert with no company would otherwise produce `AI_Engineer_cv.pdf`, which
 * every application for that role would share.
 */
export function buildFileName(
  application: GeneratedApplication,
  fullName: string,
  kind: "cv" | "cover_note" = "cv"
): string {
  // Letters and numbers survive; everything else becomes one underscore. Job
  // titles are full of brackets, slashes, em dashes and stray punctuation —
  // "Senior AI Engineer (Agentic) — Remote" has to come out readable.
  const slug = (value: string) =>
    (value ?? "")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40)
      .replace(/_+$/, "");

  const who = slug(application.company) || slug(fullName);
  const parts = [who, slug(application.job_title), kind];

  return `${parts.filter(Boolean).join("_")}.pdf`;
}

/** Where the built-in template lives when PocketBase has no copy yet. */
export function defaultTemplatePath(): string {
  return path.join(process.cwd(), "templates", "cv-template.html");
}

export async function readDefaultTemplate(): Promise<string> {
  return readFile(defaultTemplatePath(), "utf8");
}

/** Same, for the cover note design. */
export function defaultCoverNotePath(): string {
  return path.join(process.cwd(), "templates", "cover-note-template.html");
}

export async function readDefaultCoverNoteTemplate(): Promise<string> {
  return readFile(defaultCoverNotePath(), "utf8");
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
    // LINKS: portfolio, LinkedIn, GitHub — straight from cv_profile.links,
    // in their own panel under Contact.
    links_html: linksBlock(cv),
    links_section_html: linksSectionBlock(cv),
    // SKILLS are the human ones — problem-solving, communication. Gemini keeps
    // the handful this advert calls for; chooseSkills() then matches its
    // choices back against the master list, so the words printed are always
    // the words Dean wrote.
    skills_html: skillsBlock(
      chooseSkills(cv.skills, application.skills_selected ?? [])
    ),
    // TOOLS are the keyword list an applicant tracking system scans for, so
    // this is the part worth tailoring: Gemini puts the tools the advert names
    // first, and the profile's own list is the fallback.
    // Four tools, the four this advert actually asks for. A tool list is only
    // persuasive while it is short enough to read.
    tools_html: toolsBlock(
      (application.skills_matched.length
        ? application.skills_matched
        : cv.profile.tools
      ).slice(0, MAX_TOOLS)
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

/**
 * Turns the cover note's plain text into paragraphs.
 *
 * Gemini writes it as prose separated by blank lines, the same shape the on
 * screen card renders. A single line break inside a paragraph becomes a <br>
 * rather than a new paragraph, because that is almost always a wrapped line
 * rather than an intended break.
 */
function coverNoteParagraphs(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";

  return paragraphs
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/** "20 August 2026" — the form a letter uses, not an ISO stamp. */
function letterDate(when: Date): string {
  return when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Fills the cover note template.
 *
 * Shares every sidebar block with the CV — the same photo, contact rows and
 * links — because the two documents arrive together and a reader should see one
 * hand behind both. What it deliberately does NOT share is the rest of the
 * sidebar: skills, tools and education belong on a CV, and repeating them on a
 * letter reads as padding.
 *
 * Unknown placeholders are blanked, same as the CV, so a typo in a template
 * edited inside PocketBase leaves a gap rather than printing braces.
 */
export function buildCoverNoteHtml({
  template,
  application,
  cv,
  photo,
  now = new Date(),
}: {
  template: string;
  application: GeneratedApplication;
  cv: MasterCv;
  photo: { data: Buffer; mime: string } | null;
  now?: Date;
}): string {
  const { first, last } = splitName(cv.profile.full_name);
  const company = application.company?.trim() ?? "";

  const values: Record<string, string> = {
    full_name: esc(cv.profile.full_name),
    first_name: esc(first),
    last_name: esc(last),
    headline: esc(application.cv_headline || cv.profile.headline),
    job_title: esc(application.job_title),
    company: esc(company),
    // Rendered as one piece so an advert with no named employer does not print
    // a dangling " at ".
    company_line: company ? ` at ${esc(company)}` : "",
    email: esc(cv.profile.email),
    phone: esc(cv.profile.phone),
    location: esc(cv.profile.location),
    date: esc(letterDate(now)),

    photo_html: photoBlock(photo),
    contact_html: contactBlock(cv),
    links_html: linksBlock(cv),
    links_section_html: linksSectionBlock(cv),
    cover_note_html: coverNoteParagraphs(application.tailored_intro ?? ""),
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key.toLowerCase())
      ? values[key.toLowerCase()]
      : ""
  );
}

/** `Acme_AI_Engineer_cover_note.pdf`. */
export function buildCoverNoteFileName(
  application: GeneratedApplication,
  fullName: string
): string {
  return buildFileName(application, fullName, "cover_note");
}
