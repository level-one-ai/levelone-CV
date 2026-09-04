#!/usr/bin/env node
/**
 * Re-scores every stored job against the CV as it stands now.
 *
 * Talks to the running app rather than PocketBase directly, so the scoring
 * lives in exactly one place — lib/job-match.ts — and a script can never drift
 * from what the board actually shows.
 *
 *   npm run dev          # in one terminal
 *   npm run rescore      # in another
 *
 * Point it somewhere else with APP_URL=https://... npm run rescore
 */

const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/api/jobs/rescore`;

console.log(`Rescoring every stored job via ${url}`);
console.log("This reads cv_profile, cv_experience and cv_projects, so run it");
console.log("again whenever you add a project or change your tools list.\n");

let response;
try {
  response = await fetch(url, { method: "POST" });
} catch (err) {
  console.error(`Could not reach ${url}.`);
  console.error("Is the app running? Start it with `npm run dev`.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`Rescore failed (${response.status}): ${body.error ?? "no reason given"}`);
  process.exit(1);
}

console.log(`Rescored   ${body.updated} jobs`);
console.log(`Changed tier ${body.movedTier}`);
console.log(`Dismissed  ${body.dismissed} that no longer clear Tier 2`);
