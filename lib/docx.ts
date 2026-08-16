import { readFile } from "node:fs/promises";
import path from "node:path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import type { GeneratedApplication, MasterCv } from "@/lib/types";

export const TEMPLATE_PATH =
  process.env.CV_TEMPLATE_PATH ?? "templates/master-cv.docx";

/** Absolute path to the master template, resolved from the project root. */
export function templateAbsolutePath(): string {
  return path.isAbsolute(TEMPLATE_PATH)
    ? TEMPLATE_PATH
    : path.join(process.cwd(), TEMPLATE_PATH);
}

/**
 * The values every tag in the template can read. Kept flat and boring on
 * purpose: `templates/README.md` documents this object one-for-one, so what
 * you can type into Word is exactly what you see here.
 */
export function buildTemplateData(
  application: GeneratedApplication,
  cv: MasterCv
) {
  const { profile } = cv;

  return {
    // --- who you are (straight from cv_profile) ---
    full_name: profile.full_name,
    headline: profile.headline,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    links_line: Object.values(profile.links).join("  |  "),

    // --- what this application is for ---
    job_title: application.job_title,
    company: application.company,
    date: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),

    // --- what Gemini wrote ---
    tailored_intro: application.tailored_intro,
    resume_summary: application.resume_summary,
    skills_matched: application.skills_matched,
    skills_line: application.skills_matched.join("  •  "),
    tailored_experience: application.tailored_experience,

    // --- your project history, unchanged ---
    projects: cv.projects.map((p) => ({
      name: p.name,
      role: p.role,
      description: p.description,
      tech_line: p.tech.join(", "),
      outcome: p.outcome,
      link: p.link,
    })),
  };
}

/** Every top-level tag name the code supplies; used by check-template. */
export const TEMPLATE_TAGS = [
  "full_name",
  "headline",
  "email",
  "phone",
  "location",
  "links_line",
  "job_title",
  "company",
  "date",
  "tailored_intro",
  "resume_summary",
  "skills_matched",
  "skills_line",
  "tailored_experience",
  "projects",
] as const;

interface DocxtemplaterMultiError {
  properties?: {
    errors?: Array<{
      properties?: { explanation?: string; id?: string; xtag?: string };
      message?: string;
    }>;
    explanation?: string;
  };
  message?: string;
}

/**
 * docxtemplater throws one error carrying a nested list of every broken tag.
 * Left alone it surfaces as the useless "Multi error", so unwrap it into a
 * sentence that names the tags actually at fault in the Word file.
 */
function describeRenderError(err: unknown): Error {
  const e = err as DocxtemplaterMultiError;
  const inner = e?.properties?.errors ?? [];

  if (inner.length) {
    const details = inner
      .map(
        (item) =>
          item.properties?.explanation ??
          item.message ??
          "unknown problem"
      )
      .join("; ");
    return new Error(
      `The Word template has ${inner.length} broken tag${inner.length === 1 ? "" : "s"}: ${details}. ` +
        "Word often splits a tag across runs when it is typed slowly — retype the whole tag in one go. See templates/README.md."
    );
  }

  return new Error(
    `Could not fill the Word template: ${e?.properties?.explanation ?? e?.message ?? "unknown error"}`
  );
}

/**
 * Fills the master .docx in memory and returns the finished file's bytes.
 * Nothing is written to disk — the buffer goes straight into PocketBase.
 */
export async function renderCv(
  application: GeneratedApplication,
  cv: MasterCv
): Promise<Buffer> {
  const filePath = templateAbsolutePath();

  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    throw new Error(
      `No Word template found at ${filePath}. Export your CV from Google Docs as a .docx and save it there — see SETUP.md step 6.`
    );
  }

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(new PizZip(content), {
      paragraphLoop: true,
      linebreaks: true,
      // A tag the template asks for but the data does not have renders as
      // nothing, rather than the literal word "undefined" in your CV.
      nullGetter: () => "",
    });
  } catch (err) {
    throw describeRenderError(err);
  }

  try {
    doc.render(buildTemplateData(application, cv));
  } catch (err) {
    throw describeRenderError(err);
  }

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer;
}

/** A tidy, sortable filename: `CV-Dean-Finlayson-AI-Engineer-Acme.docx`. */
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

  return `${parts.filter(Boolean).join("-")}.docx`;
}
