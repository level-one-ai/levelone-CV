import { NextResponse } from "next/server";

import { toApplicationRecord } from "@/lib/applications";
import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";
import type { GenerateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reopens a past application from the sidebar — text and document together. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const pb = await superuserClient();
    const record = await pb.collection(COLLECTIONS.applications).getOne(id);

    const payload: GenerateResponse = {
      application: toApplicationRecord(record),
      docUrl: `/api/applications/${record.id}/file`,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json(
        { error: "That application no longer exists." },
        { status: 404 }
      );
    }
    console.error("[applications:get]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}

/** Removes an application and its stored PDF from the sidebar. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const pb = await superuserClient();
    await pb.collection(COLLECTIONS.applications).delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    // Already gone is the outcome the caller wanted.
    if (status === 404) return NextResponse.json({ ok: true });
    console.error("[applications:delete]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}
