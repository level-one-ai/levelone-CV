"use client";

import { motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Split-screen document viewer.
 *
 * The .docx is rendered in the browser by docx-preview, straight from the
 * bytes our own /api/applications/[id]/file route returns. No Google Drive, no
 * conversion step, and nothing about the CV leaves the machines you control.
 * docx-preview touches `window` at import time, so it is loaded lazily inside
 * the effect rather than at module scope.
 */
export default function CvViewerPanel({
  docUrl,
  title,
  onClose,
}: {
  docUrl: string;
  title: string;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const target = container.current;
    if (!target) return;

    setStatus("loading");

    (async () => {
      try {
        const response = await fetch(docUrl);
        if (!response.ok) {
          const detail = await response
            .json()
            .then((body) => body.error as string)
            .catch(() => `Server responded ${response.status}.`);
          throw new Error(detail);
        }

        const blob = await response.blob();
        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;

        target.innerHTML = "";
        await renderAsync(blob, target, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: true,
          breakPages: true,
          experimental: true,
        });

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setMessage(
          err instanceof Error ? err.message : "Could not open the document."
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docUrl]);

  // Escape closes the panel, matching every other slide-over on the web.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.aside
      initial={{ x: "-100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full shrink-0 flex-col border-r border-line bg-canvas-deep/70 backdrop-blur-xl lg:w-[46%] xl:w-[42%]"
      aria-label="Updated CV"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-fluid-xs font-semibold uppercase tracking-widest text-muted">
            Updated CV
          </p>
          <p className="truncate text-fluid-sm text-foreground">{title}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`${docUrl}?download=1`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1.5 text-fluid-xs font-medium text-foreground transition-colors hover:border-foreground/40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the CV viewer"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white/70 text-foreground transition-colors hover:border-foreground/40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="custom-scrollbar relative flex-1 overflow-y-auto p-4">
        {status === "loading" ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-64 animate-pulse rounded-2xl border border-line bg-white/60" />
            <div className="h-40 animate-pulse rounded-2xl border border-line bg-white/40" />
          </div>
        ) : null}

        {status === "error" ? (
          <div className="card">
            <p className="text-fluid-sm font-semibold text-foreground">
              Could not display the CV
            </p>
            <p className="mt-2 text-fluid-sm text-muted">{message}</p>
            <a
              href={`${docUrl}?download=1`}
              className="btn-ghost mt-4 !px-5 !py-2"
            >
              Download it instead
            </a>
          </div>
        ) : null}

        <div
          ref={container}
          className="docx-viewport"
          style={{ display: status === "ready" ? "block" : "none" }}
        />
      </div>
    </motion.aside>
  );
}
