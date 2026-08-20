"use client";

import { motion } from "framer-motion";
import { ExternalLink, Loader2, MapPin, X } from "lucide-react";
import { useState } from "react";

import type { StoredJob } from "@/lib/jobs";

/**
 * One scraped job: what it is, what it scored, why, and what to do about it.
 *
 * The score is a match against the target profile, not a measure of how
 * qualified you are — which is why the gaps line matters as much as the number
 * beside it.
 */

function tierLabel(tier: string): { text: string; className: string } {
  return tier === "tier-1"
    ? { text: "Tier 1 · high match", className: "bg-foreground text-canvas" }
    : { text: "Tier 2 · moderate", className: "border border-line text-muted" };
}

export default function JobCard({
  job,
  index,
  onApplied,
  onDismissed,
}: {
  job: StoredJob;
  index: number;
  onApplied: (job: StoredJob, applicationId: string) => void;
  onDismissed: (job: StoredJob) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tier = tierLabel(job.tier);
  const reasons = job.score_reasons;
  const gaps = reasons?.gaps ?? [];

  async function handleApply() {
    setBusy(true);
    setError("");

    try {
      // Straight into the existing chain. force: true because the advert was
      // already checked against past applications when it was scraped.
      const response = await fetch("/api/generate-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: job.description, force: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not generate.");

      const applicationId = body.application?.id ?? "";
      await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, status: "applied", application: applicationId }),
      });

      onApplied(job, applicationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    onDismissed(job);
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, status: "dismissed" }),
    }).catch(() => {});
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
        </div>
      </header>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-fluid-xs text-muted">
        {job.date_posted ? <span>Posted {job.date_posted}</span> : null}
        {job.job_type ? <span>{job.job_type}</span> : null}
        {job.salary_text ? <span>{job.salary_text}</span> : null}
        {job.company_num_employees ? <span>{job.company_num_employees} staff</span> : null}
        {job.source ? <span className="uppercase tracking-wide">{job.source}</span> : null}
      </dl>

      {reasons ? (
        <p className="mt-3 text-fluid-xs text-muted">
          {reasons.boosts.map((b) => `+${b.points} ${b.term}`).join(", ")}
          {reasons.penalties.length ? " · " : ""}
          {reasons.penalties.map((p) => `−${p.points} ${p.term}`).join(", ")}
        </p>
      ) : null}

      {gaps.length ? (
        // The point of the whole gap list: a high score can mean "they want
        // exactly the things you cannot evidence".
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
        <button
          type="button"
          onClick={handleApply}
          disabled={busy || job.status === "applied"}
          className="btn-primary !px-5 !py-2 !text-fluid-xs disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Writing your application…
            </>
          ) : job.status === "applied" ? (
            "Applied"
          ) : (
            "Apply"
          )}
        </button>

        {job.job_url ? (
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

        <button
          type="button"
          onClick={handleDismiss}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 text-fluid-xs text-muted transition hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Not interested
        </button>
      </div>
    </motion.article>
  );
}
