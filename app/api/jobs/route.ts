import { NextResponse } from "next/server";
import { z } from "zod";

import {
  asJobView,
  countByStatus,
  JOB_STATUSES,
  listJobs,
  setJobStatus,
} from "@/lib/jobs";
import { describePocketBaseError, superuserClient } from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One sidebar view's worth of jobs, plus the counts for the sidebar itself. */
export async function GET(request: Request) {
  const view = asJobView(new URL(request.url).searchParams.get("view"));

  try {
    const pb = await superuserClient();
    const [items, counts] = await Promise.all([
      listJobs(pb, view),
      countByStatus(pb),
    ]);
    return NextResponse.json({ view, items, counts });
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
  status: z.enum(JOB_STATUSES),
  /** The applications record this job produced, when one has been generated. */
  application: z.string().optional(),
});

/** Marks a job Applied or Dismissed. */
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

    // A select field rejects any value not in its option list, and this is the
    // most likely way to meet that: options edited in the admin page so they no
    // longer match what the app writes.
    if (isInvalidSelectValue(err)) {
      return NextResponse.json(
        {
          error:
            `The "status" field in scraped_jobs will not accept "${parsed_status(err)}". ` +
            `Its options must include exactly: ${JOB_STATUSES.join(", ")}. ` +
            "Run `npm run setup:pocketbase` to check them.",
        },
        { status: 500 }
      );
    }

    console.error("[jobs:update]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}

function isInvalidSelectValue(err: unknown): boolean {
  const data = (err as { response?: { data?: Record<string, { code?: string }> } })
    ?.response?.data;
  return String(data?.status?.code ?? "") === "validation_invalid_value";
}

function parsed_status(err: unknown): string {
  const data = (err as {
    response?: { data?: { status?: { params?: { value?: string } } } };
  })?.response?.data;
  return String(data?.status?.params?.value ?? "that value");
}
