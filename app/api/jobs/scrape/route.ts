import { NextResponse } from "next/server";
import { z } from "zod";

import { loadMasterCv } from "@/lib/cv";
import { profileTerms, storeScrapedJobs } from "@/lib/jobs";
import { describePocketBaseError, superuserClient } from "@/lib/pocketbase";
import { scrapeJobs } from "@/lib/scraper";

// Spawning a subprocess needs real Node APIs.
export const runtime = "nodejs";
// LinkedIn fetches one description per job, sequentially, so a 25-job run is
// 25 round trips. The default 10s budget is nowhere near enough.
export const maxDuration = 300;

/**
 * The searches this runs, one per press.
 *
 * Three terms rather than eleven job titles: the boards match loosely, and
 * every extra term is another set of requests against a host that rate limits.
 * The title rule in `lib/job-filter.ts` is what actually decides relevance, so
 * the search only has to be roughly right.
 */
const DEFAULT_SEARCHES = [
  "AI Engineer",
  "AI Solutions Architect",
  "Automation Engineer",
];

/**
 * Two ways to search.
 *
 *   local  — Edinburgh and the commute, any working pattern
 *   remote — remote roles across the UK, MINUS Edinburgh and Glasgow, which
 *            the local run already covers
 *
 * Kept as one endpoint rather than two because everything after the fetch —
 * filtering, scoring, dedup, storage — is identical. Only the question asked of
 * the boards differs.
 */
const bodySchema = z.object({
  mode: z.enum(["local", "remote"]).optional(),
  searches: z.array(z.string().trim().min(2)).min(1).max(6).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  sites: z.array(z.enum(["linkedin", "indeed", "google"])).min(1).optional(),
  resultsWanted: z.number().int().min(1).max(100).optional(),
  hoursOld: z.number().int().min(1).max(8760).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid search." },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const mode = body.mode ?? "local";
  const remoteOnly = mode === "remote";

  const searches = body.searches ?? DEFAULT_SEARCHES;
  // "United Kingdom" rather than a city: a remote role in Bristol is as
  // reachable from Edinburgh as one in Leith.
  const location =
    body.location ?? (remoteOnly ? "United Kingdom" : "Edinburgh, Scotland");
  const sites = body.sites ?? ["linkedin", "indeed", "google"];
  const resultsWanted = body.resultsWanted ?? 25;

  try {
    const pb = await superuserClient();

    // The candidate's own tools, so the scoring can say which of the things an
    // advert wants are missing from his profile.
    const cv = await loadMasterCv(pb);
    const profile = profileTerms(cv);

    const totals = {
      added: 0,
      duplicates: 0,
      filtered: 0,
      discarded: 0,
      notes: [] as string[],
    };

    // One search term at a time, sequentially. Firing three at once would
    // triple the request rate against the exact hosts that rate limit, which
    // is the fastest way to get nothing back at all.
    for (const searchTerm of searches) {
      let result;
      try {
        result = await scrapeJobs({
          searchTerm,
          location,
          sites,
          resultsWanted,
          hoursOld: body.hoursOld ?? 720,
          isRemote: remoteOnly,
          // Google ignores the location parameter on a remote search and needs
          // the constraint in the query itself, as a sentence.
          googleSearchTerm: remoteOnly
            ? `${searchTerm} remote jobs in the United Kingdom`
            : undefined,
        });
      } catch (err) {
        // One search failing should not lose the other two, or the jobs
        // already stored from them.
        totals.notes.push(
          `"${searchTerm}": ${err instanceof Error ? err.message : "failed"}`
        );
        continue;
      }

      const summary = await storeScrapedJobs(
        pb,
        result.jobs,
        profile,
        result.notes,
        { remoteOnly }
      );
      totals.added += summary.added;
      totals.duplicates += summary.duplicates;
      totals.filtered += summary.filtered;
      totals.discarded += summary.discarded;
      totals.notes.push(
        ...summary.notes.map((note) => `"${searchTerm}" ${note}`)
      );
    }

    return NextResponse.json({ ...totals, mode });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : describePocketBaseError(err);
    console.error("[jobs:scrape]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
