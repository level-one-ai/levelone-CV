import { NextResponse } from "next/server";

import { buildCapabilityProfile } from "@/lib/capabilities";
import { loadMasterCv } from "@/lib/cv";
import { rescoreJobs } from "@/lib/jobs";
import { describePocketBaseError, superuserClient } from "@/lib/pocketbase";

/**
 * Re-scores every stored job against the CV as it stands now.
 *
 * Worth pressing after two things: this rebuild, which changed what the number
 * means, and any edit to `cv_projects` — adding a project changes what can be
 * evidenced, and a board still sorted on last month's evidence is showing the
 * wrong job first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two hundred rows, one update each, against a remote PocketBase.
export const maxDuration = 300;

export async function POST() {
  try {
    const pb = await superuserClient();
    const cv = await loadMasterCv(pb);
    const result = await rescoreJobs(pb, buildCapabilityProfile(cv));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jobs:rescore]", err);
    return NextResponse.json({ error: describePocketBaseError(err) }, { status: 500 });
  }
}
