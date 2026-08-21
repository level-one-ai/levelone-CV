"use client";

import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, FileText, Loader2, MapPin, X } from "lucide-react";
import { useState } from "react";

import type { StoredJob } from "@/lib/jobs";

/**
 * One scraped job: what it is, what it scored, why, and what to do about it.
 *
 * Applying is two steps on purpose:
 *
 *   1. "Prepare application" writes the CV and cover note. Nothing is generated
 *      before this — a search of fifty jobs must not cost fifty Gemini calls.
 *   2. "Apply to Position" opens the advert AND marks the job Applied.
 *
 * Splitting them means a job he prepared but did not send stays honestly marked
 * as not applied, rather than the board quietly claiming he applied to things
 * he only looked at.
 */

function tierLabel(tier: string): { text: string; className: string } {
  return tier === "tier-1"
    ? { text: "Tier 1 · high match", className: "bg-foreground text-canvas" }
    : { text: "Tier 2 · moderate", className: "border border-line text-muted" };
}

export default function JobCard({
  job,
  index,
  onChanged,
}: {
  job: StoredJob;
  index: number;
  onChanged: (job: StoredJob) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applicationId, setApplicationId] = useState(job.application);

  const tier = tierLabel(job.tier);
  const reasons = job.score_reasons;
  const gaps = reasons?.gaps ?? [];
  const evidence = reasons?.evidence ?? [];
  const prepared = Boolean(applicationId);

  async function patch(status: StoredJob["status"], application?: string) {
    const response = await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, status, application }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not update the job.");
    return body.job as StoredJob;
  }

  /** Step one: write the documents. Does NOT mark the job applied. */
  async function handlePrepare() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/generate-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The duplicate check already ran when this job was scraped.
        body: JSON.stringify({ jobDescription: job.description, force: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not generate.");

      const id = body.application?.id ?? "";
      setApplicationId(id);
      // Status stays "Scraped": the documents exist, the application does not.
      onChanged(await patch("Scraped", id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /** Step two: he is actually applying. */
  async function handleApplied() {
    try {
      onChanged(await patch("Applied", applicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark it applied.");
    }
  }

  async function handleDismiss() {
    try {
      onChanged(await patch("Dismissed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss it.");
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      className="card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-fluid-base font-semibold text-foreground">{job.title}</h2>
          <p className="mt-0.5 text-fluid-sm text-muted">
            {job.company}
            {job.location ? (
              <span className="inline-flex items-center gap-1">
                {" · "}
                <MapPin className="h-3 w-3" aria-hidden />
                {job.location}
              </span>
            ) : null}
            {job.is_remote ? " · Remote" : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-fluid-xl font-semibold tabular-nums text-foreground">
            {job.score}%
          </span>
          <span className={`rounded-full px-2 py-0.5 text-fluid-xs ${tier.className}`}>
            {tier.text}
          </span>
          {job.status === "Applied" ? (
            <span className="inline-flex items-center gap-1 text-fluid-xs text-emerald-700">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Applied
            </span>
          ) : null}
        </div>
      </header>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-fluid-xs text-muted">
        {job.date_posted ? <span>Posted {job.date_posted}</span> : null}
        {job.job_type ? <span>{job.job_type}</span> : null}
        {job.salary_text ? <span>{job.salary_text}</span> : null}
        {job.company_num_employees ? <span>{job.company_num_employees} staff</span> : null}
        {job.source ? <span className="uppercase tracking-wide">{job.source}</span> : null}
      </dl>

      {evidence.length ? (
        <p className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-fluid-xs text-emerald-900">
          <strong>You can evidence:</strong>{" "}
          {evidence.map((e) => e.term).join(", ")}
        </p>
      ) : null}

      {gaps.length ? (
        <p className="mt-2 rounded-xl bg-amber-50/70 px-3 py-2 text-fluid-xs text-amber-900">
          <strong>Not on your profile:</strong> {gaps.join(", ")}. Expect to be
          asked about these.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-fluid-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!prepared ? (
          <button
            type="button"
            onClick={handlePrepare}
            disabled={busy}
            className="btn-primary !px-5 !py-2 !text-fluid-xs disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Writing your CV and cover note…
              </>
            ) : (
              "Apply"
            )}
          </button>
        ) : (
          <>
            {job.job_url ? (
              <a
                href={job.job_url}
                target="_blank"
                rel="noreferrer"
                onClick={handleApplied}
                className="btn-primary !px-5 !py-2 !text-fluid-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Apply to Position
              </a>
            ) : null}

            <a
              href={`/api/applications/${applicationId}/file`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-fluid-xs text-muted transition hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              CV
            </a>
            <a
              href={`/api/applications/${applicationId}/file?doc=cover-note`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-fluid-xs text-muted transition hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Cover note
            </a>
          </>
        )}

        {!prepared && job.job_url ? (
          <a
            href={job.job_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-fluid-xs text-muted transition hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            View posting
          </a>
        ) : null}

        {job.status !== "Dismissed" ? (
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 text-fluid-xs text-muted transition hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Not interested
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}
