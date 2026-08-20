"use client";

import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import JobCard from "@/components/JobCard";
import type { StoredJob } from "@/lib/jobs";

/**
 * The job board.
 *
 * Searching is a button, not a schedule: it runs when asked, reports what it
 * found, and stops. That removes a queue, a cron, and the question of what has
 * changed since last time.
 */

interface ScrapeSummary {
  added: number;
  duplicates: number;
  filtered: number;
  discarded: number;
  notes: string[];
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ScrapeSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load jobs.");
      setJobs(body.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleScrape() {
    setScraping(true);
    setError("");
    setSummary(null);

    try {
      const response = await fetch("/api/jobs/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The search failed.");

      setSummary(body);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The search failed.");
    } finally {
      setScraping(false);
    }
  }

  const tier1 = jobs.filter((job) => job.tier === "tier-1");
  const tier2 = jobs.filter((job) => job.tier === "tier-2");

  return (
    <main className="custom-scrollbar min-h-screen overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to applications
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
              Job search
            </p>
            <h1 className="mt-1 text-fluid-2xl font-semibold tracking-tight text-foreground">
              Matched roles
            </h1>
            <p className="mt-1 text-fluid-sm text-muted">
              AI and automation roles in Edinburgh and UK remote, scored against
              your profile.
            </p>
          </div>

          <button
            type="button"
            onClick={handleScrape}
            disabled={scraping}
            className="btn-primary disabled:opacity-60"
          >
            {scraping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Searching…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden />
                Find jobs
              </>
            )}
          </button>
        </header>

        {scraping ? (
          <p className="mt-4 text-fluid-xs text-muted">
            This takes a few minutes. LinkedIn is fetched one advert at a time,
            on purpose — asking faster is how it stops answering.
          </p>
        ) : null}

        {summary ? (
          <div className="card mt-6">
            <p className="text-fluid-sm text-foreground">
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
              Nothing found yet
            </p>
            <p className="mt-2 text-fluid-sm text-muted">
              Press <strong>Find jobs</strong> to search LinkedIn, Indeed and
              Google. Anything scoring under 40% is discarded rather than shown.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {[
              ["Tier 1 — high match", tier1] as const,
              ["Tier 2 — moderate match", tier2] as const,
            ].map(([heading, list]) =>
              list.length ? (
                <section key={heading}>
                  <h2 className="mb-3 text-fluid-xs font-semibold uppercase tracking-widest text-muted">
                    {heading} ({list.length})
                  </h2>
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {list.map((job, index) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          index={index}
                          onApplied={(applied, applicationId) =>
                            setJobs((current) =>
                              current.map((j) =>
                                j.id === applied.id
                                  ? { ...j, status: "applied", application: applicationId }
                                  : j
                              )
                            )
                          }
                          onDismissed={(dismissed) =>
                            setJobs((current) =>
                              current.filter((j) => j.id !== dismissed.id)
                            )
                          }
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              ) : null
            )}
          </div>
        )}
      </div>
    </main>
  );
}
