/**
 * The five collections this app reads and writes.
 *
 * This is the single source of truth for the schema. The field names are not
 * free choices — each one is read or written by name somewhere in the code:
 *
 *   cv_profile     lib/cv.ts (loadMasterCv)
 *   cv_experience  lib/cv.ts
 *   cv_projects    lib/cv.ts (loadMasterCv)
 *   applications   app/api/generate-application/route.ts (write)
 *                  lib/applications.ts (read back)
 *                  app/api/applications/route.ts (sidebar list)
 *
 * Renaming a field here without renaming it there breaks the app silently:
 * PocketBase simply returns nothing for the missing key.
 *
 * API rules are deliberately left unset on every collection. Unset means
 * superuser-only, which is what keeps the CV private — all access happens
 * server-side. The setup script never touches them.
 */

/**
 * What PocketBase actually enforces on a text field whose "Max length" box is
 * left blank. The stored value is 0, which reads like "no limit" and is not:
 * measured against 0.39.10, a blank max rejects anything over 5000 characters
 * with validation_max_text_constraint.
 *
 * This is why every field here that holds a template sets `max` explicitly. A
 * designed CV runs to ~11,000 characters and would be refused by a hand-made
 * field that looks unlimited.
 */
export const POCKETBASE_DEFAULT_TEXT_MAX = 5000;

const text = (name, extra = {}) => ({ name, type: "text", ...extra });
const number = (name) => ({ name, type: "number" });
/** 2MB is PocketBase's own default ceiling for a json field. */
const json = (name) => ({ name, type: "json", maxSize: 2000000 });

export const COLLECTIONS = [
  {
    name: "cv_profile",
    note: "You. Holds exactly one row.",
    fields: [
      text("full_name"),
      text("headline"),
      text("email"),
      text("phone"),
      text("location"),
      // A label -> URL map, e.g. {"LinkedIn": "https://..."}.
      json("links"),
      text("master_summary"),
      // Your whole skill list on one line, separated by commas. This used to
      // be a collection of its own — 30 records of four fields each, for data
      // that reaches the prompt as a flat list either way.
      // Human skills — Problem-Solving, Communication. Printed as written.
      text("skills", { max: 5000 }),
      // Tools and platforms — n8n, Docker, Claude Code. This is the list an
      // applicant tracking system scans, so Gemini re-orders it per advert.
      text("tools", { max: 5000 }),
      // One qualification per line: "Degree | School | Dates". Never tailored
      // by Gemini, so it does not need a collection of its own.
      text("education", { max: 5000 }),
      // Your headshot. Inlined into the CV as a data URI at print time, so
      // Chromium never has to fetch it.
      {
        name: "photo",
        type: "file",
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        protected: true,
      },
    ],
  },
  {
    name: "cv_experience",
    note: "One row per job. `order` 1 is your newest.",
    fields: [
      text("company"),
      text("role"),
      text("start_date"),
      text("end_date"),
      text("location"),
      // A list of achievement lines. lib/cv.ts also accepts a plain
      // multi-line string here, for rows typed by hand in the Admin UI.
      json("bullets"),
      number("order"),
    ],
  },
  {
    name: "cv_projects",
    note: "One row per project.",
    fields: [
      text("name"),
      text("role"),
      text("description"),
      json("tech"),
      text("outcome"),
      text("link"),
      number("order"),
      // The client this was built for. NEVER printed on the CV — it exists so
      // the system knows which name to keep out. Typing it here is what makes
      // it disappear: it is named to the model as forbidden, and stripped from
      // the generated text in code afterwards.
      text("client_name"),
    ],
  },
  {
    name: "cv_template",
    note: "The CV design, as HTML. One row, seeded on first setup.",
    fields: [
      text("name"),
      // The whole template. Generous limit: a designed CV with inline CSS runs
      // to several thousand characters and must never be silently truncated.
      text("html", { max: 200000 }),
      // The cover note design, same idea. Read by loadCoverNoteTemplate() in
      // lib/cv.ts; leave it empty and the app uses the shipped default from
      // templates/cover-note-template.html.
      text("cover_note_html", { max: 200000 }),
    ],
  },
  {
    name: "scraped_jobs",
    note: "Jobs found by the search, with their score. One row per advert.",
    // job_url is the identity of a job: the same advert found twice, or a
    // second search covering the same ground, must not create a second row.
    // Enforced in the database rather than in code, because two requests can
    // check-then-insert at the same time and both find nothing.
    indexes: [
      "CREATE UNIQUE INDEX `idx_scraped_jobs_url` ON `scraped_jobs` (`job_url`)",
    ],
    fields: [
      text("job_url", { max: 2000 }),
      text("source"),
      text("external_id"),
      text("title"),
      text("company"),
      text("location"),
      text("job_type"),
      text("date_posted"),
      text("salary_text"),
      text("job_level"),
      text("job_function"),
      text("company_industry"),
      text("company_url", { max: 2000 }),
      text("company_num_employees"),
      // Same ceiling as applications.job_description, for the same reason:
      // real adverts are long, and a truncated one scores wrongly and writes
      // a worse CV.
      text("description", { max: 30000 }),
      { name: "is_remote", type: "bool" },
      number("score"),
      // "tier-1" | "tier-2". Anything below 40 is never stored.
      text("tier"),
      // Why it scored what it did: matched boosts, penalties, and the terms
      // the advert wants that are missing from your profile.
      json("score_reasons"),
      // A single-select, so the admin page shows a dropdown rather than a free
      // text box. The app writes these exact strings — a select REJECTS
      // anything else, so the options and the code have to agree, capitals
      // included. JOB_STATUSES in lib/jobs.ts is the other half of this pair.
      {
        name: "status",
        type: "select",
        maxSelect: 1,
        values: ["Scraped", "Applied", "Dismissed"],
      },
      // The applications record id, once you have applied.
      text("application"),
      // Sorted on, exactly like applications.created — and missing it is a 400
      // on the listing rather than an empty page, which is how it was found.
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  },
  {
    name: "applications",
    note: "Every generated application, and the CV document that goes with it.",
    fields: [
      text("job_title"),
      text("company"),
      text("cv_headline"),
      // Job adverts are long. PocketBase's default text limit truncates real
      // ones, which is why this is set explicitly.
      text("job_description", { max: 30000 }),
      text("tailored_intro"),
      text("resume_summary"),
      json("skills_matched"),
      // The human skills chosen for this advert, from your own list.
      json("skills_selected"),
      json("tailored_experience"),
      json("tailored_projects"),
      json("screening_answers"),
      {
        // The generated PDF. Protected means it cannot be fetched without a
        // token; app/api/applications/[id]/file/route.ts mints one per request
        // via pb.files.getToken(), so this stays private without extra work.
        name: "pdf",
        type: "file",
        maxSelect: 1,
        maxSize: 5242880,
        protected: true,
      },
      {
        // The cover note as its own PDF, downloadable separately from the CV.
        name: "cover_note_pdf",
        type: "file",
        maxSelect: 1,
        maxSize: 5242880,
        protected: true,
      },
      // The sidebar sorts on `created` and groups by it. Without this field
      // app/api/applications/route.ts fails with a 400.
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  },
];
