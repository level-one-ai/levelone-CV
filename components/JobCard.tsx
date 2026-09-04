"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { JobMatch } from "@/lib/job-match";
import type { StoredJob } from "@/lib/jobs";

/**
 * One scraped job: what it is, what it scored, why, and what to do about it.
 *
 * Applying is two steps on purpose, and they now happen on two screens:
 *
 *   1. **Apply**, here, writes the CV and cover note and opens the application
 *      page. Nothing is generated before this — a search of fifty jobs must not
 *      cost fifty Gemini calls.
 *   2. **Apply to Position**, over there, opens the advert AND marks the job
 *      Applied.
 *
 * Splitting them means a job he prepared but did not send stays honestly marked
 * as not applied. Keeping step two on the other screen means it cannot be
 * pressed without the documents being in front of him — which is the point of
 * generating them at all.
 *
 * **Applied**, here, is the third door: it marks the job applied without
 * generating anything, for the ones sent through the employer's own site or
 * from a phone. It is about STATE, not documents, so it does not disturb the
 * two steps above — and because Top match is `status = "Scraped"`, pressing it
 * clears the job off the board immediately. Move back undoes it.
 */

/**
 * Where the documents live.
 *
 * The job id rides along so "Apply to Position" over there knows which advert
 * to open and which row to mark applied.
 */
function applicationHref(applicationId: string, jobId: string): string {
  return `/applications/${applicationId}?job=${encodeURIComponent(jobId)}`;
}

/** Says WHICH past application this looks like, in a sentence. */
function describeDuplicate(match: NonNullable<StoredJob["duplicate"]>): string {
  const when = match.created
    ? new Date(match.created).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const what =
    match.reason === "identical"
      ? "This is the same advert"
      : match.reason === "near-identical"
        ? "This is all but the same advert"
        : "The same role at the same company";

  const where = [match.job_title, match.company].filter(Boolean).join(" at ");

  return `${what}${where ? ` — ${where}` : ""}${when ? `, ${when}` : ""}.`;
}

function tierLabel(tier: string): { text: string; className: string } {
  return tier === "tier-1"
    ? { text: "Tier 1 · high match", className: "bg-foreground text-canvas" }
    : { text: "Tier 2 · moderate", className: "border border-line text-muted" };
}

/** How a matched requirement reads on the card: "n8n · Lead Scraping Pipeline". */
function describeMatch(entry: JobMatch["matched"][number]): string {
  return entry.proven ? `${entry.id} · ${entry.via}` : entry.id;
}

/**
 * The score in four parts, so the number can be argued with.
 *
 * Only groups the advert actually asked something of are shown — a component
 * sitting at the neutral 0.5 because the advert never mentioned it says nothing
 * and would read as a middling result rather than a missing question.
 */
const COMPONENT_LABELS: Array<[keyof JobMatch["components"], string]> = [
  ["tech", "tech"],
  ["role", "role"],
  ["ways-of-working", "how they work"],
  ["circumstance", "logistics"],
];

function componentSummary(match: JobMatch): string {
  return COMPONENT_LABELS.filter(([group]) =>
    match.matched.some((m) => m.group === group) ||
    match.missing.some((m) => m.group === group)
  )
    .map(([group, label]) => `${label} ${Math.round(match.components[group] * 100)}%`)
    .join(" · ");
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applicationId, setApplicationId] = useState(job.application);
  const [confirmed, setConfirmed] = useState(false);

  const tier = tierLabel(job.tier);
  const reasons = job.score_reasons;
  // A score worked out from a summary can say what the advert DID ask for, but
  // not what it did not — so the missing list is hidden rather than guessed at.
  const partial = Boolean(reasons?.partial);
  const matched = reasons?.matched ?? [];
  const missing = partial ? [] : reasons?.missing ?? [];
  const prepared = Boolean(applicationId);
  // A warning, never a block. Two different jobs at one employer are a real
  // thing, and he is the one who knows which this is.
  const seenBefore = job.duplicate;
  const needsConfirming = Boolean(seenBefore) && !confirmed && !prepared;

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

      // Straight to the documents. Nothing opens until they are written, so
      // the page is never half-there.
      router.push(applicationHref(id, job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
    // No `finally`: on success the page is navigating away, and dropping the
    // spinner first would flash a finished-looking card for half a second.
  }

  async function handleDismiss() {
    try {
      onChanged(await patch("Dismissed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss it.");
    }
  }

  /**
   * Marks the job applied and takes it off the board.
   *
   * Any application record already generated rides along, so opening the job
   * from the Applied tab still finds its CV and cover note.
   */
  async function handleApplied() {
    try {
      onChanged(await patch("Applied", applicationId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark it applied.");
    }
  }

  /** Undo. A misclick should cost one press, not a re-scrape. */
  async function handleUnapply() {
    try {
      onChanged(await patch("Scraped", applicationId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move it back.");
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // AnimatePresence has always wrapped this list; without an exit the card
      // it removes just vanishes. Pressing Applied is the first action that
      // takes a card off the board while you are looking at it.
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      className="card overflow-hidden"
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

      {matched.length ? (
        <p className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-fluid-xs text-emerald-900">
          <strong>You can evidence:</strong>{" "}
          {matched.slice(0, 6).map(describeMatch).join(", ")}
        </p>
      ) : null}

      {missing.length ? (
        <p className="mt-2 rounded-xl bg-amber-50/70 px-3 py-2 text-fluid-xs text-amber-900">
          <strong>They ask for, you have not used:</strong>{" "}
          {missing.slice(0, 6).map((m) => m.id).join(", ")}. Expect to be asked
          about these.
        </p>
      ) : null}

      {reasons?.blockers.length ? (
        <p className="mt-2 rounded-xl bg-amber-100/80 px-3 py-2 text-fluid-xs text-amber-950">
          <strong>Working against you:</strong>{" "}
          {reasons.blockers.map((b) => b.label).join("; ")}.
        </p>
      ) : null}

      {reasons ? (
        <p className="mt-2 text-fluid-xs text-muted">{componentSummary(reasons)}</p>
      ) : null}

      {seenBefore ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-100/80 px-3 py-2 text-fluid-xs text-amber-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong>You have applied to this before.</strong>{" "}
            {describeDuplicate(seenBefore)} Check it is not the same vacancy
            before you send another.
          </span>
        </p>
      ) : null}

      {partial ? (
        <p className="mt-2 text-fluid-xs text-muted">
          This site only gives a summary of the advert. Open the posting for the
          full description before you apply.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-fluid-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {prepared ? (
          <Link
            href={applicationHref(applicationId, job.id)}
            className="btn-primary !px-5 !py-2 !text-fluid-xs"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Open application
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (needsConfirming ? setConfirmed(true) : handlePrepare())}
            disabled={busy}
            className={`!px-5 !py-2 !text-fluid-xs disabled:opacity-60 ${
              needsConfirming
                ? "inline-flex items-center gap-1.5 rounded-full border border-amber-400 px-4 py-2 text-amber-900 transition hover:bg-amber-50"
                : "btn-primary"
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Writing your CV and cover note…
              </>
            ) : needsConfirming ? (
              "Apply anyway"
            ) : (
              "Apply"
            )}
          </button>
        )}

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

        {job.status === "Applied" ? (
          <button
            type="button"
            onClick={handleUnapply}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-fluid-xs text-muted transition hover:text-foreground"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Move back to jobs
          </button>
        ) : (
          <button
            type="button"
            onClick={handleApplied}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-fluid-xs text-muted transition hover:text-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Applied
          </button>
        )}

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
