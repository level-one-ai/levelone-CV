"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import OutputCards from "@/components/OutputCards";
import { downloadHref } from "@/components/PdfPreview";
import type { StoredJob } from "@/lib/jobs";
import type { ApplicationRecord, GenerateResponse } from "@/lib/types";

// Reaches for the browser's PDF viewer, so it cannot be server-rendered.
const PdfPreview = dynamic(() => import("@/components/PdfPreview"), {
  ssr: false,
});

/**
 * One finished application: both documents, and every piece of text that went
 * into them.
 *
 * This page exists because a PDF is not the whole application. Most job forms
 * want the cover note pasted into a box, the summary in another, and three
 * screening answers typed out one at a time — which is what `OutputCards` has
 * always done for the paste flow and what the job board had no route to.
 *
 * Reading comes before sending, deliberately: **Apply to Position** is here,
 * beside the documents, rather than on the board where it could be pressed
 * without ever opening them.
 */

type Doc = "cv" | "cover-note";

function formatDate(iso: string): string {
  const date = new Date((iso ?? "").replace(" ", "T"));
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

function ApplicationScreen() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const jobId = search.get("job") ?? "";

  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [docUrl, setDocUrl] = useState("");
  const [coverNoteUrl, setCoverNoteUrl] = useState("");
  const [job, setJob] = useState<StoredJob | null>(null);
  const [showing, setShowing] = useState<Doc>("cv");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/applications/${params.id}`);
        const body = (await response.json()) as GenerateResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not open that application.");
        if (cancelled) return;

        setApplication(body.application);
        setDocUrl(body.docUrl);
        setCoverNoteUrl(body.coverNoteUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open that application.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // The job is only needed for the Apply button. It is fetched separately and
  // its failure is silent on purpose: an application opened without ?job= is
  // perfectly readable, it just has nothing to apply to.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const body = await response.json();
        if (!cancelled && response.ok) setJob(body.job as StoredJob);
      } catch {
        /* the page works without it */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  /** He is actually applying: open the advert, and stop pretending otherwise. */
  async function handleApplied() {
    if (!job || !application) return;
    try {
      const response = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.id,
          status: "Applied",
          application: application.id,
        }),
      });
      const body = await response.json();
      if (response.ok) setJob(body.job as StoredJob);
    } catch {
      /* the advert is already opening; a failed status update is not worth
         blocking on, and the board can be corrected by hand */
    }
  }

  const current = showing === "cover-note" ? coverNoteUrl : docUrl;
  const applied = job?.status === "Applied";

  return (
    <div className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/jobs?view=top-match"
          className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to jobs
        </Link>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-fluid-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-10 text-fluid-sm text-muted">Loading…</p>
        ) : application ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
                  Your application
                </p>
                <h1 className="mt-1 text-fluid-2xl font-semibold tracking-tight text-foreground">
                  {application.job_title}
                </h1>
                <p className="mt-1 text-fluid-sm text-muted">
                  {application.company}
                  {application.company && application.created ? " · " : ""}
                  {formatDate(application.created)}
                </p>
              </div>

              {job?.job_url ? (
                <div className="flex flex-col items-end gap-1">
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={handleApplied}
                    className="btn-primary"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Apply to Position
                  </a>
                  {applied ? (
                    <span className="inline-flex items-center gap-1 text-fluid-xs text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      Marked as applied
                    </span>
                  ) : (
                    <span className="text-fluid-xs text-muted">
                      Opens the advert and marks this applied
                    </span>
                  )}
                </div>
              ) : null}
            </header>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* The documents. Read them before you send them. */}
              <section className="lg:sticky lg:top-10 lg:h-[calc(100vh-6rem)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-line bg-white/60 p-1">
                    {([
                      ["cv", "CV", docUrl],
                      ["cover-note", "Cover note", coverNoteUrl],
                    ] as const).map(([key, label, url]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setShowing(key)}
                        disabled={!url}
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-fluid-xs font-medium transition disabled:opacity-40 ${
                          showing === key
                            ? "bg-foreground text-canvas"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>

                  {current ? (
                    <a
                      href={downloadHref(current)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1.5 text-fluid-xs font-medium text-foreground transition hover:border-foreground/40"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      Download
                    </a>
                  ) : null}
                </div>

                {current ? (
                  <PdfPreview
                    // Keyed on the URL so switching tabs remounts and re-checks
                    // the document, rather than leaving the previous PDF up.
                    key={current}
                    docUrl={current}
                    label={showing === "cover-note" ? "Cover note" : "Updated CV"}
                    className="mt-3 h-[70vh] lg:h-[calc(100%-3rem)]"
                  />
                ) : (
                  <div className="card mt-3">
                    <p className="text-fluid-sm text-muted">
                      There is no {showing === "cover-note" ? "cover note" : "CV"}{" "}
                      document on this application.
                    </p>
                  </div>
                )}
              </section>

              {/* Everything you might have to paste into a form by hand. */}
              <section>
                <OutputCards application={application} />
              </section>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

export default function ApplicationPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<p className="p-10 text-fluid-sm text-muted">Loading…</p>}>
      <ApplicationScreen />
    </Suspense>
  );
}
