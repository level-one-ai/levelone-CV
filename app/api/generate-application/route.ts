import { NextResponse } from "next/server";
import { z } from "zod";

import { loadCvTemplate, loadMasterCv, loadProfilePhoto } from "@/lib/cv";
import { buildCvHtml, buildFileName } from "@/lib/cv-html";
import { findDuplicate, type PastApplication } from "@/lib/duplicates";
import { generateApplication } from "@/lib/gemini";
import { renderPdf } from "@/lib/pdf";
import {
  COLLECTIONS,
  describePocketBaseError,
  superuserClient,
} from "@/lib/pocketbase";
import type { ApplicationRecord, GenerateResponse } from "@/lib/types";

// Launching Chromium and uploading a file both need real Node APIs, so this
// route must not run on the edge runtime.
export const runtime = "nodejs";
// Gemini plus a browser launch and a PDF print comfortably exceeds the default
// 10s budget on serverless hosts.
export const maxDuration = 120;

const bodySchema = z.object({
  jobDescription: z
    .string()
    .trim()
    .min(60, "Paste a bit more of the job advert — at least a couple of sentences.")
    .max(30_000, "That job advert is too long. Paste just the role and requirements."),
  /** Set once the duplicate warning has been seen and waved through. */
  force: z.boolean().optional(),
});

/**
 * How far back the duplicate check looks. Enough to cover a real job hunt,
 * capped so the check cannot become the slow part — each row carries a full
 * job advert, and adverts are long.
 */
const DUPLICATE_LOOKBACK = 200;

/**
 * Looks for a past application matching this advert.
 *
 * A failure here must never stop a generation: not being told "you already
 * applied" is a far smaller harm than being unable to apply at all. So any
 * error is logged and treated as "no duplicate".
 */
async function findExistingApplication(
  pb: Awaited<ReturnType<typeof superuserClient>>,
  jobDescription: string
) {
  try {
    const past = await pb
      .collection(COLLECTIONS.applications)
      .getList(1, DUPLICATE_LOOKBACK, {
        sort: "-created",
        fields: "id,job_title,company,created,job_description",
      });

    return findDuplicate(
      jobDescription,
      past.items as unknown as PastApplication[]
    );
  } catch (err) {
    console.warn("[generate-application] duplicate check skipped:", err);
    return null;
  }
}

export async function POST(request: Request) {
  let jobDescription: string;
  let force = false;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    jobDescription = parsed.data.jobDescription;
    force = parsed.data.force ?? false;
  } catch {
    return NextResponse.json(
      { error: "Could not read the request body." },
      { status: 400 }
    );
  }

  try {
    // 1. Master CV out of PocketBase.
    const pb = await superuserClient();
    const cv = await loadMasterCv(pb);

    // 2. Have we been here before? This runs BEFORE Gemini deliberately, so
    //    spotting a repeat costs nothing — no tokens, no PDF, no record.
    //    It warns rather than blocks: re-applying months later, or rebuilding
    //    a CV that came out badly, are both perfectly reasonable.
    if (!force) {
      const duplicate = await findExistingApplication(pb, jobDescription);
      if (duplicate) {
        return NextResponse.json({ duplicate }, { status: 409 });
      }
    }

    // 3. Gemini maps that history onto this advert.
    const application = await generateApplication(jobDescription, cv);

    // 4. The same text is poured into the HTML template and printed to PDF,
    //    entirely in memory. The template comes from PocketBase when there is
    //    one, so edits made in the admin UI take effect immediately.
    const [template, photo] = await Promise.all([
      loadCvTemplate(pb),
      loadProfilePhoto(pb, cv.profile),
    ]);
    const html = buildCvHtml({ template, application, cv, photo });
    const { bytes: pdf, pages } = await renderPdf(html);
    const fileName = buildFileName(application, cv.profile.full_name);

    // The CV is never scaled or clipped to force one page, so a long one
    // simply becomes two. Say so rather than letting it be discovered by an
    // employer.
    if (pages > 1) {
      console.warn(
        `[generate-application] CV ran to ${pages} pages. Trim the content budget: ` +
          "summary 50-75 words, 3-4 bullets on the current role, 3 projects, 10-12 tools."
      );
    }

    // 5. Text and document are stored together as one record, so reopening a
    //    past chat restores both halves of the screen.
    const form = new FormData();
    form.append("job_title", application.job_title);
    form.append("company", application.company);
    form.append("cv_headline", application.cv_headline);
    form.append("job_description", jobDescription);
    form.append("tailored_intro", application.tailored_intro);
    form.append("resume_summary", application.resume_summary);
    form.append("skills_matched", JSON.stringify(application.skills_matched));
    form.append("skills_selected", JSON.stringify(application.skills_selected));
    form.append(
      "tailored_experience",
      JSON.stringify(application.tailored_experience)
    );
    form.append(
      "tailored_projects",
      JSON.stringify(application.tailored_projects)
    );
    form.append(
      "screening_answers",
      JSON.stringify(application.screening_answers)
    );
    form.append(
      "pdf",
      new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
      fileName
    );

    let record: ApplicationRecord;
    try {
      record = await pb
        .collection(COLLECTIONS.applications)
        .create<ApplicationRecord>(form);
    } catch (err) {
      throw new Error(describePocketBaseError(err));
    }

    const payload: GenerateResponse = {
      application: { ...record, ...application },
      docUrl: `/api/applications/${record.id}/file`,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong generating the application.";
    console.error("[generate-application]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
