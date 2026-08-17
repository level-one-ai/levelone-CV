#!/usr/bin/env node
/**
 * Fills PocketBase with your CV content.
 *
 *   npm run seed:cv              (only if your CV is empty)
 *   npm run seed:cv -- --force   (replace what is there)
 *
 * The content itself lives in scripts/cv-content.mjs. Edit that file and
 * re-run with --force, or edit the records in the PocketBase admin page —
 * whichever you prefer.
 *
 * Run `npm run setup:pocketbase` first, so the collections exist.
 *
 * By default this REFUSES to touch a CV that already has content. Losing an
 * afternoon of typed edits to a re-run of a command is not an acceptable
 * outcome, so replacing has to be asked for explicitly.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import PocketBase from "pocketbase";

import { EXPERIENCE, PROFILE, PROJECTS } from "./cv-content.mjs";

const FORCE = process.argv.includes("--force");

const tick = "✓";
const cross = "✗";

function bail(message) {
  console.error(`\n${cross} ${message}\n`);
  process.exit(1);
}

/** Same hand-rolled reader the setup script uses, for the same reason. */
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

function describe(err, url) {
  const status = err?.status ?? 0;
  const detail = Object.entries(err?.response?.data ?? {})
    .map(([field, info]) => `${field}: ${info?.message ?? "invalid"}`)
    .join("; ");

  if (status === 0) {
    return (
      `Could not reach PocketBase at ${url}.\n` +
      `  Is it running? Start it with:  ./pocketbase serve`
    );
  }
  if (status === 404) {
    return (
      `A collection is missing.\n` +
      `  Run this first:  npm run setup:pocketbase`
    );
  }
  return `PocketBase error ${status}${detail ? ` — ${detail}` : ""}: ${
    err?.response?.message ?? err?.message ?? "unknown error"
  }`;
}

/** Deletes every row in a collection, used only under --force. */
async function clear(pb, name) {
  const rows = await pb.collection(name).getFullList();
  for (const row of rows) await pb.collection(name).delete(row.id);
  return rows.length;
}

// --------------------------------------------------------------------------

const env = await readEnvLocal();
const url = env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
const email = env.POCKETBASE_ADMIN_EMAIL;
const password = env.POCKETBASE_ADMIN_PASSWORD;

if (!email || !password) {
  bail(
    "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are not both set in .env.local.\n" +
      "  See ENV-VARS.md step 3."
  );
}

console.log(`\nPocketBase: ${url}`);

const pb = new PocketBase(url);
pb.autoCancellation(false);

try {
  await pb.collection("_superusers").authWithPassword(email, password);
} catch (err) {
  bail(describe(err, url));
}
console.log(`Signed in:  ${email}\n`);

// ---- refuse to clobber existing content unless asked ----------------------

let existingProfile;
try {
  existingProfile = await pb.collection("cv_profile").getFullList();
} catch (err) {
  bail(describe(err, url));
}

if (existingProfile.length > 0 && !FORCE) {
  console.log(`${cross} Your CV already has content in PocketBase.`);
  console.log("");
  console.log("  Nothing has been changed. If you want to replace it with the");
  console.log("  content in scripts/cv-content.mjs, run:");
  console.log("");
  console.log("    npm run seed:cv -- --force");
  console.log("");
  console.log("  That deletes the current cv_profile, cv_experience and");
  console.log("  cv_projects rows first. Your generated applications and your");
  console.log("  CV design are not touched.");
  console.log("");
  process.exit(0);
}

try {
  if (FORCE) {
    const removed =
      (await clear(pb, "cv_profile")) +
      (await clear(pb, "cv_experience")) +
      (await clear(pb, "cv_projects"));
    if (removed) console.log(`  cleared ${removed} existing row(s)\n`);
  }

  await pb.collection("cv_profile").create({
    full_name: PROFILE.full_name,
    headline: PROFILE.headline,
    email: PROFILE.email,
    phone: PROFILE.phone,
    location: PROFILE.location,
    links: PROFILE.links,
    master_summary: PROFILE.master_summary,
    skills: PROFILE.skills,
    tools: PROFILE.tools,
    education: PROFILE.education,
  });
  console.log(`  ${tick} cv_profile      1 row`);

  for (const job of EXPERIENCE) {
    await pb.collection("cv_experience").create(job);
  }
  console.log(`  ${tick} cv_experience   ${EXPERIENCE.length} rows`);

  for (const project of PROJECTS) {
    await pb.collection("cv_projects").create(project);
  }
  console.log(`  ${tick} cv_projects     ${PROJECTS.length} rows`);
} catch (err) {
  bail(describe(err, url));
}

console.log("");
console.log(`${tick} Your CV is loaded.`);
console.log("");
console.log("Two things left to do by hand:");
console.log("");
console.log("  1. Upload your photo.");
console.log(`     Go to ${url}/_/  →  cv_profile  →  your record  →  photo`);
console.log("");
console.log("  2. Fix your LinkedIn and GitHub links.");
console.log("     They are placeholders right now. Open cv_profile → links");
console.log("     and put your real profile addresses in.");
console.log("");
console.log("Then run `npm run dev` and paste in a job advert.\n");
