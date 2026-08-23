import { NextResponse } from "next/server";

import { withDuplicates } from "@/lib/applied";
import { toStoredJob } from "@/lib/jobs";
import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One scraped job.
 *
 * The application page needs the advert's URL and title so "Apply to Position"
 * can open the right thing and mark the right job applied. Everything else
 * about a job is read through the list, so this is deliberately the only
 * single-record read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const pb = await superuserClient();
    const record = await pb.collection(COLLECTIONS.scrapedJobs).getOne(id);
    const [job] = await withDuplicates(pb, [toStoredJob(record)]);
    return NextResponse.json({ job });
  } catch (err) {
    if ((err as { status?: number })?.status === 404) {
      return NextResponse.json({ error: "That job no longer exists." }, { status: 404 });
    }
    console.error("[jobs:get]", err);
    return NextResponse.json({ error: describePocketBaseError(err) }, { status: 500 });
  }
}
