"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { FileText, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import GeneratingLoader from "@/components/GeneratingLoader";
import HistorySidebar from "@/components/HistorySidebar";
import JobDescriptionComposer from "@/components/JobDescriptionComposer";
import OutputCards from "@/components/OutputCards";
import type {
  ApplicationRecord,
  ApplicationSummary,
  DuplicateMatch,
  GenerateResponse,
} from "@/lib/types";

// Both of these reach for `window` (WebGL / the PDF iframe), so neither can be
// server-rendered.
const Background3D = dynamic(() => import("@/components/Background3D"), {
  ssr: false,
});
const CvViewerPanel = dynamic(() => import("@/components/CvViewerPanel"), {
  ssr: false,
});

type Status = "idle" | "loading" | "ready" | "error";

/**
 * PocketBase hands dates back as "2026-08-12 09:00:00Z", which Safari will not
 * parse — hence the same space-to-T swap HistorySidebar uses.
 */
function formatDate(iso: string): string {
  const date = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function HomePage() {
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [docUrl, setDocUrl] = useState("");
  const [coverNoteUrl, setCoverNoteUrl] = useState("");

  const [history, setHistory] = useState<ApplicationSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** Which document the split-screen panel is showing, if any. */
  const [viewing, setViewing] = useState<"cv" | "cover-note" | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/applications");
      if (!response.ok) return;
      const body = (await response.json()) as { items: ApplicationSummary[] };
      setHistory(body.items ?? []);
    } catch {
      // A sidebar that cannot load is not worth interrupting the user over;
      // the generate call surfaces any real PocketBase outage.
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // The sidebar costs too much room on a phone; start collapsed there.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1024px)").matches) setSidebarOpen(false);
  }, []);

  const viewingUrl =
    viewing === "cv" ? docUrl : viewing === "cover-note" ? coverNoteUrl : "";

  function show(payload: GenerateResponse) {
    setApplication(payload.application);
    setDocUrl(payload.docUrl);
    setCoverNoteUrl(payload.coverNoteUrl ?? "");
    setStatus("ready");
  }

  /**
   * `force` skips the already-applied check. It is only ever set by the button
   * on the warning itself, so the check cannot be bypassed by accident.
   */
  async function handleGenerate(force = false) {
    const text = jobDescription.trim();
    if (!text) return;

    setStatus("loading");
    setError("");
    setDuplicate(null);
    setViewing(null);

    try {
      const response = await fetch("/api/generate-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: text, force }),
      });

      const body = (await response.json()) as GenerateResponse & {
        error?: string;
        duplicate?: DuplicateMatch;
      };

      // 409 is not a failure — it is the system doing its job. It gets its own
      // card rather than the red error box.
      if (response.status === 409 && body.duplicate) {
        setDuplicate(body.duplicate);
        setStatus("idle");
        return;
      }

      if (!response.ok) throw new Error(body.error ?? "Generation failed.");

      show(body);
      void refreshHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
      setStatus("error");
    }
  }

  async function handleSelect(id: string) {
    setStatus("loading");
    setError("");
    setViewing(null);

    try {
      const response = await fetch(`/api/applications/${id}`);
      const body = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not open that application.");

      setJobDescription(body.application.job_description);
      show(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that application.");
      setStatus("error");
    }
  }

  async function handleDelete(id: string) {
    // Optimistic: the row disappears now, and a failed delete is corrected by
    // the refresh that follows.
    setHistory((rows) => rows.filter((row) => row.id !== id));
    if (application?.id === id) handleNew();
    try {
      await fetch(`/api/applications/${id}`, { method: "DELETE" });
    } finally {
      void refreshHistory();
    }
  }

  function handleNew() {
    setJobDescription("");
    setApplication(null);
    setDocUrl("");
    setCoverNoteUrl("");
    setError("");
    setDuplicate(null);
    setViewing(null);
    setStatus("idle");
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">
      <Background3D busy={status === "loading"} dimmed={viewing !== null} />

      <HistorySidebar
        items={history}
        activeId={application?.id ?? null}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
      />

      <AnimatePresence initial={false}>
        {viewingUrl && application ? (
          <CvViewerPanel
            // Keyed on the URL so switching between the CV and the cover note
            // remounts the panel and re-checks the document, rather than
            // leaving the previous PDF on screen.
            key={viewingUrl}
            docUrl={viewingUrl}
            label={viewing === "cover-note" ? "Cover note" : "Updated CV"}
            title={
              application.company
                ? `${application.job_title} · ${application.company}`
                : application.job_title
            }
            onClose={() => setViewing(null)}
          />
        ) : null}
      </AnimatePresence>

      <main
        className={`custom-scrollbar min-w-0 flex-1 overflow-y-auto ${
          viewing ? "hidden lg:block" : "block"
        }`}
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
          <AnimatePresence mode="wait">
            {status === "ready" && application ? (
              <motion.div
                key="output"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <header className="px-1">
                  <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
                    Tailored application
                  </p>
                  <h1 className="mt-1 text-fluid-2xl font-semibold tracking-tight text-foreground">
                    {application.job_title}
                  </h1>
                  {application.company ? (
                    <p className="mt-1 text-fluid-base text-muted">
                      {application.company}
                    </p>
                  ) : null}
                </header>

                <OutputCards
                  application={application}
                  coverNoteUrl={coverNoteUrl}
                  viewingCoverNote={viewing === "cover-note"}
                  onToggleCoverNote={() =>
                    setViewing((current) =>
                      current === "cover-note" ? null : "cover-note"
                    )
                  }
                />

                <div className="flex flex-wrap items-center justify-center gap-3 pb-2">
                  <button
                    type="button"
                    onClick={() =>
                      setViewing((current) => (current === "cv" ? null : "cv"))
                    }
                    className="btn-primary"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    {viewing === "cv" ? "Hide CV" : "View updated CV"}
                  </button>
                  <button type="button" onClick={handleNew} className="btn-ghost">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    New application
                  </button>
                  <a href="/jobs" className="btn-ghost">
                    <Search className="h-4 w-4" aria-hidden />
                    Find jobs
                  </a>
                </div>
              </motion.div>
            ) : status === "loading" ? (
              <GeneratingLoader key="loading" />
            ) : (
              <motion.div
                key="composer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-8"
              >
                <div className="flex flex-col items-center gap-4 text-center">
                  <img
                    src="/logo-mark.png"
                    alt="Level One"
                    className="h-16 w-16 object-contain sm:h-20 sm:w-20"
                  />
                  <h1 className="text-fluid-3xl font-semibold tracking-tight text-foreground">
                    Hi Dean, let&rsquo;s get started
                  </h1>
                  <p className="max-w-md text-fluid-base text-muted">
                    Paste a job advert below. I&rsquo;ll write your cover note,
                    screening answers and a CV tailored to it.
                  </p>
                </div>

                <div className="w-full">
                  <JobDescriptionComposer
                    value={jobDescription}
                    onChange={(next) => {
                      // A different advert is a different question, so the old
                      // answer must not linger.
                      setJobDescription(next);
                      if (duplicate) setDuplicate(null);
                    }}
                    onSubmit={() => handleGenerate()}
                  />
                </div>

                {duplicate ? (
                  <div
                    role="alert"
                    className="w-full rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-fluid-sm text-amber-900 backdrop-blur"
                  >
                    <p className="font-semibold">
                      You have applied to this one already.
                    </p>
                    <p className="mt-1">
                      {duplicate.job_title}
                      {duplicate.company ? ` at ${duplicate.company}` : ""}
                      {duplicate.created ? `, ${formatDate(duplicate.created)}` : ""}
                      {duplicate.reason === "same-role"
                        ? " — same job title and employer, worded differently."
                        : duplicate.reason === "near-identical"
                          ? " — almost the same advert."
                          : " — the same advert."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSelect(duplicate.id)}
                        className="rounded-full bg-amber-900 px-4 py-2 text-fluid-xs font-medium text-amber-50 transition hover:bg-amber-800"
                      >
                        Open that application
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerate(true)}
                        className="rounded-full border border-amber-300 px-4 py-2 text-fluid-xs font-medium text-amber-900 transition hover:bg-amber-100"
                      >
                        Generate it again anyway
                      </button>
                    </div>
                  </div>
                ) : null}

                {status === "error" && error ? (
                  <div
                    role="alert"
                    className="w-full rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-fluid-sm text-red-800 backdrop-blur"
                  >
                    {error}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
