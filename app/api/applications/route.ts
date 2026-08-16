import { NextResponse } from "next/server";

import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";
import type { ApplicationSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feeds the history sidebar. Only the four fields the list actually renders
 * are requested, so opening the app never drags every stored job advert and
 * cover note across the wire.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  try {
    const pb = await superuserClient();

    // pb.filter() escapes the term, so a stray quote in the search box cannot
    // change the filter's meaning.
    const filter = query
      ? pb.filter("job_title ~ {:q} || company ~ {:q}", { q: query })
      : "";

    const records = await pb
      .collection(COLLECTIONS.applications)
      .getList(1, 100, {
        sort: "-created",
        fields: "id,job_title,company,created",
        filter,
      });

    const items: ApplicationSummary[] = records.items.map((record) => ({
      id: record.id,
      job_title: String(record.job_title ?? "Untitled role"),
      company: String(record.company ?? ""),
      created: String(record.created ?? ""),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    // A 400 here almost always means the `created` autodate field is missing,
    // which the generic PocketBase message does nothing to reveal.
    if ((err as { status?: number })?.status === 400) {
      return NextResponse.json(
        {
          error:
            'The "applications" collection is missing its Created field. Add an Autodate field named "created" set to "on create" — see SETUP.md step 4.',
        },
        { status: 500 }
      );
    }

    const message =
      err instanceof Error ? err.message : describePocketBaseError(err);
    console.error("[applications:list]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
