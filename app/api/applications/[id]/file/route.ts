import { NextResponse } from "next/server";
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { toApplicationRecord } from "@/lib/applications";
import {
  loadCoverNoteTemplate,
  loadMasterCv,
  loadProfilePhoto,
} from "@/lib/cv";
import { buildCoverNoteFileName, buildCoverNoteHtml } from "@/lib/cv-html";
import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";
import { renderPdf } from "@/lib/pdf";

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
/**
 * Builds the cover note PDF for an application that has no stored copy.
 *
 * Two situations lead here, and both are ordinary rather than exceptional:
 *
 *   1. The application was generated before cover note PDFs existed. Its letter
 *      is sitting in `tailored_intro` and always was; only the document is new.
 *   2. `applications.cover_note_pdf` did not exist when the record was written.
 *      PocketBase discards an unknown field on create WITHOUT complaining —
 *      measured, not assumed — so the file vanished and nothing said so.
 *
 * There is no Gemini call here. The letter is already written; this is a
 * template and a browser, a second or two and no tokens. That is what makes it
 * reasonable to do on demand rather than as a migration.
 */
async function renderCoverNoteNow(
  pb: PocketBase,
  record: RecordModel
): Promise<Buffer> {
  const application = toApplicationRecord(record);
  const cv = await loadMasterCv(pb);

  const [template, photo] = await Promise.all([
    loadCoverNoteTemplate(pb),
    loadProfilePhoto(pb, cv.profile),
  ]);

  const html = buildCoverNoteHtml({ template, application, cv, photo });
  return (await renderPdf(html)).bytes;
}

/**
 * Saves a freshly built cover note back onto the record, so the next open is
 * instant.
 *
 * Failure here is deliberately not fatal. If `cover_note_pdf` does not exist in
 * this database the save cannot work, but the bytes in hand are still a perfectly
 * good PDF — and being able to read the thing is the point. Caching is the
 * optimisation, not the feature.
 */
async function cacheCoverNote(
  pb: PocketBase,
  record: RecordModel,
  bytes: Buffer,
  name: string
): Promise<void> {
  try {
    const form = new FormData();
    form.append(
      "cover_note_pdf",
      new Blob([new Uint8Array(bytes)], { type: PDF_MIME }),
      name
    );
    const saved = await pb
      .collection(COLLECTIONS.applications)
      .update(record.id, form);

    if (!saved.cover_note_pdf) {
      console.warn(
        "[applications:file] The cover note was rebuilt but could not be saved: " +
          "the `applications` collection has no cover_note_pdf field, so PocketBase " +
          "discarded it. Run `npm run setup:pocketbase` to add it — until then the " +
          "PDF is rebuilt on every request, which works but is slower."
      );
    }
  } catch (err) {
    console.warn("[applications:file] Could not cache the cover note:", err);
  }
}

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

    // No stored cover note, but the letter itself is on the record: build the
    // document now rather than telling him it does not exist. This is what
    // gives every application ever generated a viewable, downloadable PDF.
    if (!fileName && wantsCoverNote) {
      const application = toApplicationRecord(record);
      if (application.tailored_intro.trim()) {
        const bytes = await renderCoverNoteNow(pb, record);
        const name = buildCoverNoteFileName(
          application,
          (await loadMasterCv(pb)).profile.full_name
        );

        await cacheCoverNote(pb, record, bytes, name);

        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type": PDF_MIME,
            "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${name}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
    }

    if (!fileName) {
      return NextResponse.json(
        {
          error: wantsCoverNote
            ? "This application has no cover note. There is no cover note text stored on it to build one from."
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
