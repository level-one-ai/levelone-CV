#!/usr/bin/env node
/**
 * Reads templates/master-cv.docx and reports the tags inside it.
 *
 * Run it after editing the template in Word:
 *
 *   npm run check:template
 *
 * It never writes to your document. It only looks.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import PizZip from "pizzip";

/** Kept in step with TEMPLATE_TAGS and buildTemplateData in lib/docx.ts. */
const KNOWN_VALUES = [
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
  "skills_line",
];

/** Tags written as {#name} ... {/name}. */
const KNOWN_LOOPS = ["skills_matched", "tailored_experience", "projects"];

/** Fields that only make sense inside a particular loop. */
const LOOP_FIELDS = {
  tailored_experience: ["company", "role", "dates", "bullets"],
  projects: ["name", "role", "description", "tech_line", "outcome", "link"],
};

const templatePath = path.resolve(
  process.cwd(),
  process.env.CV_TEMPLATE_PATH ?? "templates/master-cv.docx"
);

function bail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

let file;
try {
  file = await readFile(templatePath);
} catch {
  bail(
    `No template found at ${templatePath}.\n` +
      `  Export your CV from Google Docs (File > Download > Microsoft Word)\n` +
      `  and save it as templates/master-cv.docx. See SETUP.md step 6.`
  );
}

let zip;
try {
  zip = new PizZip(file);
} catch {
  bail(
    "That file is not a readable .docx. If it is a .doc or a .pdf, open it in " +
      "Word and use Save As to make a .docx."
  );
}

// Headers and footers hold tags too, so scan every document part, not just
// the body.
const parts = Object.keys(zip.files).filter(
  (name) => name.startsWith("word/") && name.endsWith(".xml")
);

const found = new Set();
for (const part of parts) {
  const xml = zip.files[part].asText();
  // Dropping the XML elements rejoins any tag Word split across runs, which is
  // what docxtemplater does internally before it reads them.
  const text = xml.replace(/<[^>]+>/g, "");
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    found.add(match[1].trim());
  }
}

if (found.size === 0) {
  bail(
    "No tags found in the template.\n" +
      "  Your CV will be copied unchanged, with none of the AI text in it.\n" +
      "  Add tags like {full_name} and {resume_summary} — see templates/README.md."
  );
}

const values = [];
const loops = [];
const unknown = [];

for (const tag of [...found].sort()) {
  if (tag === ".") continue; // "the current list item"
  if (tag.startsWith("/")) continue; // loop close, checked via its opener

  if (tag.startsWith("#") || tag.startsWith("^")) {
    const name = tag.slice(1);
    loops.push(name);
    // `bullets` is a list nested inside {#tailored_experience}, so it is a
    // valid loop even though it is not a top-level one.
    const isNestedLoop = Object.values(LOOP_FIELDS).some((fields) =>
      fields.includes(name)
    );
    if (!KNOWN_LOOPS.includes(name) && !isNestedLoop) unknown.push(`{${tag}}`);
    continue;
  }

  values.push(tag);
  const insideALoop = Object.values(LOOP_FIELDS).some((fields) =>
    fields.includes(tag)
  );
  if (!KNOWN_VALUES.includes(tag) && !insideALoop) unknown.push(`{${tag}}`);
}

console.log(`\nTemplate: ${templatePath}\n`);
console.log(`Text tags found (${values.length}):`);
console.log(values.length ? `  ${values.join(", ")}` : "  none");
console.log(`\nList tags found (${loops.length}):`);
console.log(loops.length ? `  ${loops.map((l) => `{#${l}}`).join(", ")}` : "  none");

// Only warn about the two that carry the AI's actual writing — everything else
// is a matter of taste.
const missingImportant = ["resume_summary", "tailored_experience"].filter(
  (tag) => !found.has(tag) && !found.has(`#${tag}`)
);

if (missingImportant.length) {
  console.log(
    `\n! Your template does not use: ${missingImportant.join(", ")}.` +
      `\n  Nothing is broken, but the tailored text will not appear in the CV.`
  );
}

if (unknown.length) {
  console.log(
    `\n! Tags the app does not fill in: ${unknown.join(", ")}` +
      `\n  These will come out blank. Check the spelling against templates/README.md.`
  );
}

console.log("\n✓ Template read successfully.\n");
