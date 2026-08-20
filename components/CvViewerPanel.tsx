"use client";

import { motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Split-screen document viewer.
 *
 * The PDF is served by our own /api/applications/[id]/file route and shown in
 * the browser's built-in PDF viewer. Nothing is converted or re-rendered, so
 * what you see here is exactly the file an employer receives — which was the
 * whole point of moving from Word to PDF.
 */
/**
 * The download link is the same URL with download=1 on it — but the cover note
 * URL already carries ?doc=cover-note, so appending "?download=1" would make
 * nonsense of it. Build it properly rather than by string concatenation.
 */
function downloadHref(docUrl: string): string {
  return docUrl + (docUrl.includes("?") ? "&" : "?") + "download=1";
}

export default function CvViewerPanel({
  docUrl,
  title,
  label = "Updated CV",
  onClose,
}: {
  docUrl: string;
  title: string;
  /** What this document is, e.g. "Updated CV" or "Cover note". */
  label?: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Escape closes the panel, matching every other slide-over on the web.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // An <iframe> fires `load` for a failed response too, so check the document
  // is really there before deciding the preview worked.
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

  return (
    <motion.aside
      initial={{ x: "-100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full shrink-0 flex-col border-r border-line bg-canvas-deep/70 backdrop-blur-xl lg:w-[46%] xl:w-[42%]"
      aria-label={label}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
            {label}
          </p>
          <p className="truncate text-fluid-sm text-foreground">{title}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={downloadHref(docUrl)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1.5 text-fluid-xs font-medium text-foreground transition-colors hover:border-foreground/40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download PDF
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close the ${label.toLowerCase()} viewer`}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white/70 text-foreground transition-colors hover:border-foreground/40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden p-3">
        {status === "loading" ? (
          <div
            className="h-full animate-pulse rounded-2xl border border-line bg-white/60"
            aria-hidden
          />
        ) : null}

        {status === "error" ? (
          <div className="card">
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
        ) : null}

        {status === "ready" ? (
          <iframe
            src={docUrl}
            title={label}
            className="h-full w-full rounded-2xl border border-line bg-white"
          />
        ) : null}
      </div>
    </motion.aside>
  );
}
