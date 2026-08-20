import { NextResponse } from "next/server";

import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_MIME = "application/pdf";

/**
 * Streams the stored PDF back to the browser from our own origin.
 *
 * The split-screen viewer shows the document in an iframe, which means it needs
 * a URL it is allowed to load — but handing the browser a PocketBase URL would
 * either expose the superuser session or fail outright on a protected file
 * field. Fetching here keeps every PocketBase credential on the server, and
 * gives the viewer a same-origin URL that no CORS rule can block.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const asDownload = query.get("download") === "1";

  // ?doc=cover-note serves the cover note; anything else serves the CV. Both
  // live on the same record and are streamed the same way, so one route with
  // one token flow covers them.
  const wantsCoverNote = query.get("doc") === "cover-note";
  const field = wantsCoverNote ? "cover_note_pdf" : "pdf";

  try {
    const pb = await superuserClient();
    const record = await pb.collection(COLLECTIONS.applications).getOne(id);
    const fileName = String(record[field] ?? "");

    if (!fileName) {
      return NextResponse.json(
        {
          error: wantsCoverNote
            ? "This application has no cover note document. Applications generated before cover note PDFs were added do not have one — regenerate it to get a cover note."
            : "This application has no CV document attached.",
        },
        { status: 404 }
      );
    }

    // A short-lived file token so this also works when the `pdf` field is
    // marked Protected in PocketBase.
    const token = await pb.files.getToken();
    const fileUrl = pb.files.getURL(record, fileName, { token });

    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `PocketBase would not return the document (${upstream.status}).`,
        },
        { status: 502 }
      );
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": PDF_MIME,
        "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${fileName}"`,
        // The bytes never change once written, but the record can be deleted,
        // so keep it private and short.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return NextResponse.json(
        { error: "That application no longer exists." },
        { status: 404 }
      );
    }
    console.error("[applications:file]", err);
    return NextResponse.json(
      { error: describePocketBaseError(err) },
      { status: 500 }
    );
  }
}
