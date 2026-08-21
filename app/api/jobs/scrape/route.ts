import { NextResponse } from "next/server";
import { z } from "zod";

import { loadMasterCv } from "@/lib/cv";
import { profileTerms, storeScrapedJobs, type ScrapeSummary } from "@/lib/jobs";
import { describePocketBaseError, superuserClient } from "@/lib/pocketbase";
import { scrapeJobs, type ScrapeResult } from "@/lib/scraper";
import { scrapeAdzuna } from "@/lib/sources/adzuna";
import { scrapeReed } from "@/lib/sources/reed";

// Spawning a subprocess needs real Node APIs.
export const runtime = "nodejs";
// One press is now two legs across four scraped sites plus two APIs, and
// LinkedIn fetches one description per job, sequentially. Ten minutes is the
// worst case, not the expected one.
export const maxDuration = 800;

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

/** Sites python-jobspy scrapes. The two API sources are handled separately. */
const SCRAPED_SITES = ["linkedin", "indeed", "google", "glassdoor"] as const;

/**
 * One press, two legs.
 *
 *   local  — Edinburgh and the commute, any working pattern
 *   remote — remote roles across the UK, MINUS Edinburgh and Glasgow, which the
 *            local leg has already covered
 *
 * They run one after the other and write into the same list, because from the
 * outside this is one question — "what is out there for me?" — and splitting it
 * across two buttons made the person asking do the merging.
 */
interface Leg {
  name: "local" | "remote";
  location: string;
  remoteOnly: boolean;
  resultsWanted: number;
}

const bodySchema = z.object({
  searches: z.array(z.string().trim().min(2)).min(1).max(6).optional(),
  sites: z.array(z.enum(SCRAPED_SITES)).min(1).optional(),
  resultsWanted: z.number().int().min(1).max(100).optional(),
  hoursOld: z.number().int().min(1).max(8760).optional(),
  /** Escape hatch for testing one leg at a time. Both run by default. */
  legs: z.array(z.enum(["local", "remote"])).min(1).optional(),
});

function emptySummary(): ScrapeSummary {
  return { added: 0, duplicates: 0, filtered: 0, discarded: 0, notes: [] };
}

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

  const searches = body.searches ?? DEFAULT_SEARCHES;
  const sites = body.sites ?? [...SCRAPED_SITES];
  const hoursOld = body.hoursOld ?? 720;
  const wanted = body.resultsWanted ?? 25;

  const legs: Leg[] = ([
    {
      name: "local",
      location: "Edinburgh, Scotland",
      remoteOnly: false,
      resultsWanted: wanted,
    },
    {
      // "United Kingdom" rather than a city: a remote role in Bristol is as
      // reachable from Edinburgh as one in Leith.
      name: "remote",
      location: "United Kingdom",
      remoteOnly: true,
      // Slightly smaller than the local leg. The second leg doubles the request
      // count against the same rate-limited hosts, and the local search is the
      // one more likely to turn into an interview.
      resultsWanted: Math.min(wanted, 20),
    },
  ] as Leg[]).filter((leg) => !body.legs || body.legs.includes(leg.name));

  try {
    const pb = await superuserClient();

    // The candidate's own tools, so the scoring can say which of the things an
    // advert wants are missing from his profile.
    const cv = await loadMasterCv(pb);
    const profile = profileTerms(cv);

    const totals = emptySummary();
    const perLeg: Record<string, ScrapeSummary> = {};

    for (const leg of legs) {
      const summary = emptySummary();

      // One search term at a time, sequentially. Firing three at once would
      // triple the request rate against the exact hosts that rate limit, which
      // is the fastest way to get nothing back at all.
      for (const searchTerm of searches) {
        const results = await Promise.allSettled([
          scrapeJobs({
            searchTerm,
            location: leg.location,
            sites: [...sites],
            resultsWanted: leg.resultsWanted,
            hoursOld,
            isRemote: leg.remoteOnly,
            // Google ignores the location parameter on a remote search and
            // needs the constraint in the query itself, as a sentence.
            googleSearchTerm: leg.remoteOnly
              ? `${searchTerm} remote jobs in the United Kingdom`
              : undefined,
          }),
          // These two are plain HTTPS against keyed APIs, so they neither rate
          // limit nor block each other. Running them alongside the subprocess
          // costs nothing.
          scrapeAdzuna({
            searchTerm,
            location: leg.remoteOnly ? undefined : "Edinburgh",
            resultsWanted: leg.resultsWanted,
            hoursOld,
            isRemote: leg.remoteOnly,
          }),
          scrapeReed({
            searchTerm,
            location: leg.remoteOnly ? undefined : "Edinburgh",
            resultsWanted: leg.resultsWanted,
            isRemote: leg.remoteOnly,
          }),
        ]);

        const batch: ScrapeResult = { jobs: [], notes: [] };
        for (const result of results) {
          if (result.status === "fulfilled") {
            batch.jobs.push(...result.value.jobs);
            batch.notes.push(...result.value.notes);
          } else {
            // One source failing should not lose the others, or the jobs
            // already stored from them.
            batch.notes.push(
              result.reason instanceof Error ? result.reason.message : "a source failed"
            );
          }
        }

        const stored = await storeScrapedJobs(pb, batch.jobs, profile, batch.notes, {
          remoteOnly: leg.remoteOnly,
        });

        summary.added += stored.added;
        summary.duplicates += stored.duplicates;
        summary.filtered += stored.filtered;
        summary.discarded += stored.discarded;
        summary.notes.push(...stored.notes.map((note) => `"${searchTerm}" ${note}`));
      }

      perLeg[leg.name] = summary;
      totals.added += summary.added;
      totals.duplicates += summary.duplicates;
      totals.filtered += summary.filtered;
      totals.discarded += summary.discarded;
      // Prefixed, so a rate limit says which half of the run it hit.
      totals.notes.push(
        ...summary.notes.map(
          (note) => `${leg.name === "remote" ? "Remote (UK)" : "Local"}: ${note}`
        )
      );
    }

    return NextResponse.json({ ...totals, legs: perLeg });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : describePocketBaseError(err);
    console.error("[jobs:scrape]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
