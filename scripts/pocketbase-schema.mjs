/**
 * The five collections this app reads and writes.
 *
 * This is the single source of truth for the schema. The field names are not
 * free choices — each one is read or written by name somewhere in the code:
 *
 *   cv_profile     lib/cv.ts (loadMasterCv) and lib/docx.ts (buildTemplateData)
 *   cv_experience  lib/cv.ts
 *   cv_projects    lib/cv.ts and lib/docx.ts
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
      text("skills", { max: 5000 }),
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
    ],
  },
  {
    name: "applications",
    note: "Every generated application, and the CV document that goes with it.",
    fields: [
      text("job_title"),
      text("company"),
      // Job adverts are long. PocketBase's default text limit truncates real
      // ones, which is why this is set explicitly.
      text("job_description", { max: 30000 }),
      text("tailored_intro"),
      text("resume_summary"),
      json("skills_matched"),
      json("tailored_experience"),
      json("screening_answers"),
      {
        // The generated .docx. Protected means it cannot be fetched without a
        // token; app/api/applications/[id]/file/route.ts mints one per request
        // via pb.files.getToken(), so this stays private without extra work.
        name: "docx",
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
