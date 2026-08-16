"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { FileText, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import GeneratingLoader from "@/components/GeneratingLoader";
import HistorySidebar from "@/components/HistorySidebar";
import JobDescriptionComposer from "@/components/JobDescriptionComposer";
import OutputCards from "@/components/OutputCards";
import type {
  ApplicationRecord,
  ApplicationSummary,
  GenerateResponse,
} from "@/lib/types";

// Both of these reach for `window` (WebGL / docx-preview), so neither can be
// server-rendered.
const Background3D = dynamic(() => import("@/components/Background3D"), {
  ssr: false,
});
const CvViewerPanel = dynamic(() => import("@/components/CvViewerPanel"), {
  ssr: false,
});

type Status = "idle" | "loading" | "ready" | "error";

export default function HomePage() {
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [docUrl, setDocUrl] = useState("");

  const [history, setHistory] = useState<ApplicationSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

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

  function show(payload: GenerateResponse) {
    setApplication(payload.application);
    setDocUrl(payload.docUrl);
    setStatus("ready");
  }

  async function handleGenerate() {
    const text = jobDescription.trim();
    if (!text) return;

    setStatus("loading");
    setError("");
    setViewerOpen(false);

    try {
      const response = await fetch("/api/generate-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: text }),
      });

      const body = (await response.json()) as GenerateResponse & { error?: string };
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
    setViewerOpen(false);

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
    setError("");
    setViewerOpen(false);
    setStatus("idle");
  }

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">
      <Background3D busy={status === "loading"} dimmed={viewerOpen} />

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
        {viewerOpen && docUrl && application ? (
          <CvViewerPanel
            key={docUrl}
            docUrl={docUrl}
            title={
              application.company
                ? `${application.job_title} · ${application.company}`
                : application.job_title
            }
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <main
        className={`custom-scrollbar min-w-0 flex-1 overflow-y-auto ${
          viewerOpen ? "hidden lg:block" : "block"
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

                <OutputCards application={application} />

                <div className="flex flex-wrap items-center justify-center gap-3 pb-2">
                  <button
                    type="button"
                    onClick={() => setViewerOpen((open) => !open)}
                    className="btn-primary"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    {viewerOpen ? "Hide CV" : "View updated CV"}
                  </button>
                  <button type="button" onClick={handleNew} className="btn-ghost">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    New application
                  </button>
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
                    onChange={setJobDescription}
                    onSubmit={handleGenerate}
                  />
                </div>

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
