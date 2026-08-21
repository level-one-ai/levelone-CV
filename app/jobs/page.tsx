"use client";

import { AnimatePresence } from "framer-motion";
import { Globe, Loader2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import JobCard from "@/components/JobCard";
import JobsSidebar from "@/components/JobsSidebar";
import { asJobView, type JobStatus, type JobView, type StoredJob } from "@/lib/jobs";

/**
 * The job board.
 *
 * Searching is a button, not a schedule: it runs when asked, reports what it
 * found, and stops. The view lives in the URL so it can be bookmarked and the
 * back button works.
 */

interface ScrapeSummary {
  mode?: "local" | "remote";
  added: number;
  duplicates: number;
  filtered: number;
  discarded: number;
  notes: string[];
}

const EMPTY_COUNTS: Record<JobStatus, number> = {
  Scraped: 0,
  Applied: 0,
  Dismissed: 0,
};

const HEADINGS: Record<JobView, { title: string; blurb: string }> = {
  "top-match": {
    title: "Top match",
    blurb: "Best fit first. Nothing here has been applied to or dismissed.",
  },
  all: { title: "All jobs", blurb: "Everything found so far, newest first." },
  "not-applied": {
    title: "Not applied",
    blurb: "Found, and still waiting on you.",
  },
  applied: {
    title: "Applied",
    blurb: "Sent, with the CV and cover note that went with each one.",
  },
  dismissed: {
    title: "Not interested",
    blurb: "Hidden from the other views. Nothing is deleted.",
  },
};

function JobsBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const view = asJobView(params.get("view"));

  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [counts, setCounts] = useState<Record<JobStatus, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState<"" | "local" | "remote">("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ScrapeSummary | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs?view=${view}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load jobs.");
      setJobs(body.items ?? []);
      setCounts(body.counts ?? EMPTY_COUNTS);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Arriving from a button on the front screen: run that search straight away
  // rather than making him press a second button for the same intent.
  useEffect(() => {
    const requested = params.get("search");
    if (requested !== "local" && requested !== "remote") return;
    router.replace(`/jobs?view=${view}`);
    void handleScrape(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScrape(mode: "local" | "remote") {
    setScraping(mode);
    setError("");
    setSummary(null);

    try {
      const response = await fetch("/api/jobs/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The search failed.");

      setSummary(body);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The search failed.");
    } finally {
      setScraping("");
    }
  }

  /**
   * A job changed. Update it in place, or drop it if it no longer belongs in
   * this view — marking something "not interested" while looking at Top match
   * should make it leave, not sit there contradicting the heading.
   */
  function handleChanged(updated: StoredJob) {
    const belongs =
      view === "all" ||
      (view === "top-match" && updated.status === "Scraped") ||
      (view === "not-applied" && updated.status === "Scraped") ||
      (view === "applied" && updated.status === "Applied") ||
      (view === "dismissed" && updated.status === "Dismissed");

    setJobs((current) =>
      belongs
        ? current.map((job) => (job.id === updated.id ? updated : job))
        : current.filter((job) => job.id !== updated.id)
    );
    void refresh();
  }

  const heading = HEADINGS[view];

  return (
    <div className="flex h-screen overflow-hidden">
      <JobsSidebar
        view={view}
        counts={counts}
        total={counts.Scraped + counts.Applied + counts.Dismissed}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
      />

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
                Job search
              </p>
              <h1 className="mt-1 text-fluid-2xl font-semibold tracking-tight text-foreground">
                {heading.title}
              </h1>
              <p className="mt-1 text-fluid-sm text-muted">{heading.blurb}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleScrape("local")}
                disabled={scraping !== ""}
                className="btn-primary disabled:opacity-60"
              >
                {scraping === "local" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" aria-hidden />
                    Search jobs
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleScrape("remote")}
                disabled={scraping !== ""}
                title="Remote roles anywhere in the UK, excluding Edinburgh and Glasgow"
                className="btn-ghost disabled:opacity-60"
              >
                {scraping === "remote" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Searching…
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4" aria-hidden />
                    Remote (UK)
                  </>
                )}
              </button>
            </div>
          </header>

          {scraping ? (
            <p className="mt-4 text-fluid-xs text-muted">
              {scraping === "remote"
                ? "Looking for remote roles across the UK, minus Edinburgh and Glasgow. "
                : "Looking around Edinburgh. "}
              This takes a few minutes. LinkedIn is fetched one advert at a
              time, on purpose — asking faster is how it stops answering.
            </p>
          ) : null}

          {summary ? (
            <div className="card mt-6">
              <p className="text-fluid-sm text-foreground">
                {summary.mode === "remote" ? "Remote (UK): " : ""}
                <strong>{summary.added}</strong> new
                {summary.duplicates ? `, ${summary.duplicates} already seen` : ""}
                {summary.filtered ? `, ${summary.filtered} filtered out` : ""}
                {summary.discarded ? `, ${summary.discarded} scored too low` : ""}.
              </p>
              {summary.notes.length ? (
                <ul className="mt-2 space-y-1 text-fluid-xs text-muted">
                  {summary.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

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
          ) : jobs.length === 0 ? (
            <div className="card mt-10">
              <p className="text-fluid-sm font-semibold text-foreground">
                Nothing here yet
              </p>
              <p className="mt-2 text-fluid-sm text-muted">
                {view === "top-match" || view === "all"
                  ? "Press Search jobs to look through LinkedIn, Indeed and Google. Anything scoring under 40% is discarded rather than shown."
                  : "Nothing in this list yet."}
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              <AnimatePresence initial={false}>
                {jobs.map((job, index) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={index}
                    onChanged={handleChanged}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function JobsPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<p className="p-10 text-fluid-sm text-muted">Loading…</p>}>
      <JobsBoard />
    </Suspense>
  );
}
