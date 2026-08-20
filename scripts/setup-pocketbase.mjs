#!/usr/bin/env node
/**
 * Builds the collections this app needs, in your PocketBase.
 *
 *   npm run setup:pocketbase
 *   npm run setup:pocketbase -- --dry-run    (show what would change, write nothing)
 *   npm run setup:pocketbase -- --json       (print import JSON, touch nothing)
 *   npm run setup:pocketbase -- --fix-limits (raise a text field's max length)
 *
 * It reads the same three settings the app itself uses, from .env.local:
 * NEXT_PUBLIC_POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD.
 *
 * This points at a live database that may already hold your CV, so it is
 * deliberately additive only:
 *
 *   - it never deletes a collection
 *   - it never deletes or edits an existing field, with one opt-in exception:
 *     --fix-limits RAISES a text field's max length when it is too small to
 *     hold what the app must store. Widening cannot truncate anything, and it
 *     never happens unless you ask for it
 *   - it never touches API rules, so it cannot make a private collection public
 *   - running it twice changes nothing the second time
 *
 * The worst it can do is add something.
 */
import { statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import PocketBase from "pocketbase";

import {
  COLLECTIONS,
  POCKETBASE_DEFAULT_TEXT_MAX,
} from "./pocketbase-schema.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const JSON_ONLY = process.argv.includes("--json");
const FIX_LIMITS = process.argv.includes("--fix-limits");

const tick = "✓";
const cross = "✗";
const arrow = "→";

function bail(message) {
  console.error(`\n${cross} ${message}\n`);
  process.exit(1);
}

/**
 * Reads .env.local by hand rather than with node --env-file, so a missing or
 * half-filled file produces the same plain-English guidance as the rest of the
 * app instead of a Node stack trace.
 */
async function readEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");

  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    bail(
      `No .env.local file found at ${file}.\n` +
        `  Copy the example first:  cp .env.example .env.local\n` +
        `  Then fill it in — see ENV-VARS.md.`
    );
  }

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const split = trimmed.indexOf("=");
    if (split === -1) continue;

    const key = trimmed.slice(0, split).trim();
    let value = trimmed.slice(split + 1).trim();

    // Tolerate quotes even though ENV-VARS.md tells you not to use them.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Turns a PocketBase failure into a sentence that names the fix.
 * `isAuthStep` matters because a rejected superuser login comes back as a
 * bare 400, indistinguishable by status from a rejected field.
 */
function describe(err, url, isAuthStep = false) {
  const status = err?.status ?? 0;
  const detail = Object.entries(err?.response?.data ?? {})
    .map(([field, info]) => `${field}: ${info?.message ?? "invalid"}`)
    .join("; ");

  if (status === 0) {
    return (
      `Could not reach PocketBase at ${url}.\n` +
      `  Is it running? Start it with:  ./pocketbase serve\n` +
      `  Also check NEXT_PUBLIC_POCKETBASE_URL in .env.local.`
    );
  }
  if (status === 401 || status === 403) {
    return (
      `PocketBase refused the request (${status}).\n` +
      `  POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local must\n` +
      `  match the superuser account. Test them by signing in at ${url}/_/`
    );
  }
  if (isAuthStep) {
    // PocketBase answers a bad superuser login with 400, not 401, so the
    // status alone does not identify the problem — the step does.
    return (
      `PocketBase would not accept that login.\n` +
      `  Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local.\n` +
      `  They are the PocketBase account you created, not your real email login.\n` +
      `  Test them by signing in at ${url}/_/\n` +
      `  Forgotten the password? Reset it with:\n` +
      `    ./pocketbase superuser upsert ${email || "YOUR_EMAIL"} A_NEW_PASSWORD`
    );
  }
  return `PocketBase error ${status}${detail ? ` — ${detail}` : ""}: ${
    err?.response?.message ?? err?.message ?? "unknown error"
  }`;
}

/**
 * Builds JSON for PocketBase's Admin UI -> Settings -> Import collections.
 *
 * Two rules learned the hard way, by testing against PocketBase 0.39.10
 * rather than by reading the docs:
 *
 *   1. NO `id` ANYWHERE. PocketBase matches an incoming collection to an
 *      existing one by id. Hardcode an id that does not match and it tries to
 *      CREATE a second collection with a name that is already taken, which
 *      fails on a UNIQUE constraint — and because the import is atomic, the
 *      whole paste is rejected and nothing changes. With no id it matches by
 *      name and merges, whether the collection exists yet or not.
 *
 *   2. Options are FLATTENED onto the field (`"max": 30000`), not nested in
 *      an `options` object. The nested form is the pre-0.23 shape.
 *
 * Rules are emitted as explicit nulls. An empty string is not "no rule" in
 * PocketBase — it is a rule that always passes, which would make a CV
 * containing a home address and phone number readable by anyone.
 */
function toImportJson() {
  return COLLECTIONS.map((collection) => ({
    name: collection.name,
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: collection.fields.map((field) => ({ ...field })),
    indexes: [],
  }));
}

if (JSON_ONLY) {
  const json = JSON.stringify(toImportJson(), null, 2);
  const out = path.join(process.cwd(), "pocketbase-collections.json");
  await writeFile(out, json + "\n", "utf8");
  console.log(json);
  console.error(`\n${tick} Written to ${out}`);
  console.error(
    "  Paste the contents into PocketBase: Settings -> Import collections.\n" +
      "  It creates the tables only. Load your CV content with: npm run seed:cv\n"
  );
  process.exit(0);
}

// --------------------------------------------------------------------------

/**
 * The size of the content this field really has to hold, when we know it.
 * Only the template fields have a knowable size — everything else (a pasted job
 * advert, say) varies, so those return null and are judged against the schema.
 */
const TEMPLATE_FILES = {
  "cv_template.html": "cv-template.html",
  "cv_template.cover_note_html": "cover-note-template.html",
};

const sizeCache = new Map();

function requiredSize(collection, field) {
  const file = TEMPLATE_FILES[`${collection}.${field}`];
  if (!file) return null;
  if (sizeCache.has(file)) return sizeCache.get(file);

  let size = null;
  try {
    size = statSync(path.join(process.cwd(), "templates", file)).size;
  } catch {
    // Template missing from the checkout: nothing to measure against.
  }
  sizeCache.set(file, size);
  return size;
}

const env = await readEnvLocal();
const url = env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
const email = env.POCKETBASE_ADMIN_EMAIL;
const password = env.POCKETBASE_ADMIN_PASSWORD;

if (!email || !password) {
  bail(
    "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are not both set in .env.local.\n" +
      "  These are the PocketBase account you created — not your real email login.\n" +
      "  See ENV-VARS.md step 3."
  );
}

console.log(`\nPocketBase: ${url}`);
if (DRY_RUN) console.log("Mode:       dry run (nothing will be written)");

const pb = new PocketBase(url);
pb.autoCancellation(false);

try {
  await pb.collection("_superusers").authWithPassword(email, password);
} catch (err) {
  bail(describe(err, url, true));
}
console.log(`Signed in:  ${email}\n`);

const limitProblems = [];
let created = 0;
let repaired = 0;
let unchanged = 0;
let wouldChange = 0;

for (const wanted of COLLECTIONS) {
  let existing = null;
  try {
    existing = await pb.collections.getOne(wanted.name);
  } catch (err) {
    if (err?.status !== 404) bail(describe(err, url));
  }

  // ---- collection does not exist yet: create it whole ----
  if (!existing) {
    if (DRY_RUN) {
      console.log(
        `  ${arrow} ${wanted.name.padEnd(15)} would be created with ${wanted.fields.length} fields`
      );
      wouldChange++;
      continue;
    }

    try {
      await pb.collections.create({
        name: wanted.name,
        type: "base",
        fields: wanted.fields,
      });
      console.log(
        `  ${tick} ${wanted.name.padEnd(15)} created (${wanted.fields.length} fields)`
      );
      created++;
    } catch (err) {
      bail(`Could not create "${wanted.name}". ${describe(err, url)}`);
    }
    continue;
  }

  // ---- collection exists: add only the fields that are missing ----
  const byName = new Map((existing.fields ?? []).map((f) => [f.name, f]));
  const missing = wanted.fields.filter((f) => !byName.has(f.name));

  // A field can exist and still be unusable. A text field created by hand with
  // the Max length box left blank stores max: 0, which PocketBase enforces as
  // 5000 characters — so `cover_note_html` looks present and correct and then
  // refuses the design, with no clue as to why. Checking names alone missed
  // this entirely, which is exactly how it reached a live database.
  //
  // "Too small" means too small for what actually has to go in it, not simply
  // below the generous limit this schema pins. A field set to 20000 holds both
  // designs comfortably, and shouting BROKEN at it would be crying wolf — the
  // fastest way to teach someone to ignore the warning that matters.
  const tooSmall = [];
  for (const want of wanted.fields) {
    if (want.type !== "text" || !want.max) continue;
    const have = byName.get(want.name);
    if (!have) continue;

    const effective = have.max || POCKETBASE_DEFAULT_TEXT_MAX;
    if (effective >= want.max) continue;

    const needs = requiredSize(wanted.name, want.name);
    tooSmall.push({
      name: want.name,
      have: effective,
      want: want.max,
      needs,
      breaking: needs !== null && effective < needs,
    });
  }

  if (missing.length === 0 && tooSmall.length === 0) {
    console.log(`  ${tick} ${wanted.name.padEnd(15)} already correct`);
    unchanged++;
    continue;
  }

  const names = missing.map((f) => f.name).join(", ");

  if (DRY_RUN) {
    if (missing.length) {
      console.log(
        `  ${arrow} ${wanted.name.padEnd(15)} would gain ${missing.length} field(s): ${names}`
      );
    }
    for (const f of tooSmall) {
      console.log(
        f.breaking
          ? `  ${arrow} ${wanted.name.padEnd(15)} ${f.name} holds only ${f.have} characters — the design needs ${f.needs}`
          : `  ${arrow} ${wanted.name.padEnd(15)} ${f.name} max is ${f.have}; ${f.want} is recommended (works for now)`
      );
    }
    wouldChange++;
    continue;
  }

  try {
    // Existing fields are passed through untouched unless --fix-limits was
    // asked for, and even then the ONLY change is raising a max. Widening a
    // limit cannot truncate anything, so no data can be lost either way.
    const carried = (existing.fields ?? []).map((f) => {
      if (!FIX_LIMITS) return f;
      const fix = tooSmall.find((t) => t.name === f.name);
      return fix ? { ...f, max: fix.want } : f;
    });

    if (missing.length || (FIX_LIMITS && tooSmall.length)) {
      await pb.collections.update(existing.id, {
        fields: [...carried, ...missing],
      });
    }

    if (missing.length) {
      console.log(
        `  ${tick} ${wanted.name.padEnd(15)} added ${missing.length} missing field(s): ${names}`
      );
      repaired++;
    }

    for (const f of tooSmall) {
      if (FIX_LIMITS) {
        console.log(
          `  ${tick} ${wanted.name.padEnd(15)} ${f.name} max raised ${f.have} -> ${f.want}`
        );
        repaired++;
      } else if (f.breaking) {
        limitProblems.push({ collection: wanted.name, ...f });
        console.log(
          `  !  ${wanted.name.padEnd(15)} ${f.name} holds only ${f.have} characters — the design needs ${f.needs}`
        );
      } else {
        console.log(
          `  ${tick} ${wanted.name.padEnd(15)} ${f.name} max is ${f.have} — fine today; ${f.want} leaves room to grow`
        );
        unchanged++;
      }
    }
  } catch (err) {
    bail(`Could not update "${wanted.name}". ${describe(err, url)}`);
  }
}

// --------------------------------------------------------------------------

console.log("");

if (DRY_RUN) {
  if (wouldChange === 0) {
    console.log(`${tick} Nothing to do — every collection is already correct.\n`);
  } else {
    console.log(
      `${wouldChange} collection(s) would change. Run without --dry-run to apply.\n`
    );
  }
  process.exit(0);
}

const parts = [];
if (created) parts.push(`${created} created`);
if (repaired) parts.push(`${repaired} repaired`);
if (unchanged) parts.push(`${unchanged} already correct`);

console.log(`${tick} Done — ${parts.join(", ")}.`);

if (limitProblems.length) {
  console.log("");
  console.log(`${cross} ONE THING IS STILL BROKEN.`);
  console.log("");
  for (const p of limitProblems) {
    console.log(`  ${p.collection}.${p.name} can hold ${p.have} characters.`);
    console.log(`  The design is ${p.needs}. Saving it will fail with`);
    console.log(`  "Must be no more than ${p.have} character(s)."`);
    console.log("");
  }
  console.log("  A text field created by hand with the Max length box left");
  console.log("  blank is NOT unlimited — PocketBase treats blank as 5000.");
  console.log("");
  console.log("  Fix it in one command:");
  console.log("");
  console.log("    npm run setup:pocketbase -- --fix-limits");
  console.log("");
  console.log("  That only ever RAISES a limit, so nothing can be truncated.");
  console.log("  Or set Max length by hand in the admin page and re-run this.");
}

// ---- seed the CV design, but never overwrite an edited one ----------------
try {
  const existing = await pb.collection("cv_template").getFullList();

  const read = (file) =>
    readFile(path.join(process.cwd(), "templates", file), "utf8");

  if (existing.length === 0) {
    await pb.collection("cv_template").create({
      name: "Level One",
      html: await read("cv-template.html"),
      cover_note_html: await read("cover-note-template.html"),
    });
    console.log("");
    console.log(`${tick} CV and cover note designs loaded into cv_template.`);
    console.log("  Edit them there any time — the app uses that copy from now on.");
  } else {
    // Overwriting a design would silently destroy hand-made edits, which is
    // exactly the kind of data loss this script promises never to cause. An
    // EMPTY field is different: there is nothing to lose, and a blank
    // cover_note_html on an existing row is what everyone upgrading will have.
    const row = existing[0];
    if (!String(row.cover_note_html ?? "").trim()) {
      await pb.collection("cv_template").update(row.id, {
        cover_note_html: await read("cover-note-template.html"),
      });
      console.log("");
      console.log(`${tick} cover_note_html was empty — the design has been added.`);
      console.log("  Your existing CV design was not touched.");
    } else {
      console.log("");
      console.log(`${tick} cv_template already has both designs — left untouched.`);
    }
  }
} catch (err) {
  console.log("");
  console.log(`!  Could not load the designs into cv_template: ${describe(err, url)}`);
  console.log("   The app falls back to the copies in templates/, so this is not");
  console.log("   fatal — but edits made in the admin page will not take effect");
  console.log("   until the field can actually hold the design.");
}

// Skills used to live in their own collection. Point out the leftover rather
// than deleting it — it is Dean's data and his call.
try {
  await pb.collections.getOne("cv_skills");
  console.log("");
  console.log("Note: you still have a cv_skills collection.");
  console.log("  Skills now live on cv_profile, in one comma-separated line.");
  console.log("  Copy them across, then delete cv_skills by hand when you are ready.");
  console.log("  Nothing breaks while it sits there — the app simply ignores it.");
} catch {
  // Not there. Nothing to say.
}
console.log("");
console.log("Next: open the admin page and type your CV in.");
console.log(`  ${url}/_/`);
console.log("");
console.log("  cv_profile     one row: details, summary, skills, education, photo");
console.log("  cv_experience  one row per job");
console.log("  cv_projects    one row per project");
console.log("");
console.log("  cv_template    the CV design — already filled in for you");
console.log("  applications   leave empty — the app fills this in for you");
console.log("");
console.log("See SETUP.md step 5 for what to put in each field.\n");
