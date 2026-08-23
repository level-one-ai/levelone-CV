"use client";

import { useEffect, useState } from "react";

/**
 * A PDF, shown in the browser's own viewer.
 *
 * Nothing is converted or re-rendered on the way, so what is on screen is
 * exactly the file an employer receives — which was the whole point of moving
 * from Word to PDF.
 *
 * The one subtlety is worth keeping: an `<iframe>` fires its `load` event for a
 * failed response too, so a 404 shows as a blank white rectangle and looks like
 * a slow load forever. A HEAD request first is what turns that into an error
 * anyone can act on.
 *
 * Used by both the slide-over viewer on the paste flow and the application
 * page, which is why it is a component rather than an iframe in two places.
 */

/**
 * The download link is the same URL with download=1 on it — but the cover note
 * URL already carries ?doc=cover-note, so appending "?download=1" would make
 * nonsense of it. Build it properly rather than by string concatenation.
 */
export function downloadHref(docUrl: string): string {
  return docUrl + (docUrl.includes("?") ? "&" : "?") + "download=1";
}

export default function PdfPreview({
  docUrl,
  label,
  className = "",
}: {
  docUrl: string;
  /** What this document is, e.g. "Updated CV" or "Cover note". */
  label: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    fetch(docUrl, { method: "HEAD" })
      .then((response) => {
        if (cancelled) return;
        setStatus(response.ok ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [docUrl]);

  if (status === "loading") {
    return (
      <div
        className={`animate-pulse rounded-2xl border border-line bg-white/60 ${className}`}
        aria-hidden
      />
    );
  }

  if (status === "error") {
    return (
      <div className={`card ${className}`}>
        <p className="text-fluid-sm font-semibold text-foreground">
          Could not open this document
        </p>
        <p className="mt-2 text-fluid-sm text-muted">
          The document could not be loaded. Try downloading it instead.
        </p>
        <a href={downloadHref(docUrl)} className="btn-ghost mt-4 !px-5 !py-2">
          Download PDF
        </a>
      </div>
    );
  }

  return (
    <iframe
      // The fragment is read by the browser's PDF viewer and never sent to the
      // server, so it does not affect the HEAD check above. It opens the
      // document fitted to the width with the thumbnail rail closed — that rail
      // takes half the panel, to show one page of a one-page CV.
      src={`${docUrl}#view=FitH&navpanes=0`}
      title={label}
      className={`w-full rounded-2xl border border-line bg-white ${className}`}
    />
  );
}
