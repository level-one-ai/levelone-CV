import { NextResponse } from "next/server";

import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Streams the stored .docx back to the browser from our own origin.
 *
 * The split-screen viewer renders the document client-side, which means it
 * needs the raw bytes — but handing the browser a PocketBase URL would either
 * expose the superuser session or fail outright on a protected file field.
 * Fetching here keeps every PocketBase credential on the server, and gives the
 * viewer a same-origin URL that no CORS rule can block.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const asDownload =
    new URL(request.url).searchParams.get("download") === "1";

  try {
    const pb = await superuserClient();
    const record = await pb.collection(COLLECTIONS.applications).getOne(id);
    const fileName = String(record.docx ?? "");

    if (!fileName) {
      return NextResponse.json(
        { error: "This application has no CV document attached." },
        { status: 404 }
      );
    }

    // A short-lived file token so this also works when the `docx` field is
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
        "Content-Type": DOCX_MIME,
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
