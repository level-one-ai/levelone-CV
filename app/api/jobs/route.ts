import { NextResponse } from "next/server";
import { z } from "zod";

import { listJobs, setJobStatus } from "@/lib/jobs";
import { describePocketBaseError, superuserClient } from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything found so far, best match first. */
export async function GET(request: Request) {
  const includeDismissed =
    new URL(request.url).searchParams.get("all") === "1";

  try {
    const pb = await superuserClient();
    return NextResponse.json({ items: await listJobs(pb, { includeDismissed }) });
  } catch (err) {
    // A 404 here means the collection does not exist yet, which is a setup
    // step rather than a fault — say which one.
    if ((err as { status?: number })?.status === 404) {
      return NextResponse.json(
        {
          error:
            'There is no "scraped_jobs" collection yet. Run `npm run setup:pocketbase` to create it.',
        },
        { status: 500 }
      );
    }
    console.error("[jobs:list]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "applied", "dismissed"]),
  /** The applications record this job produced, when marking it applied. */
  application: z.string().optional(),
});

/** Marks a job applied or dismissed. */
export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }

    const pb = await superuserClient();
    const job = await setJobStatus(
      pb,
      parsed.data.id,
      parsed.data.status,
      parsed.data.application ?? ""
    );

    return NextResponse.json({ job });
  } catch (err) {
    if ((err as { status?: number })?.status === 404) {
      return NextResponse.json({ error: "That job no longer exists." }, { status: 404 });
    }
    console.error("[jobs:update]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}
