"use client";

import { motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useEffect } from "react";

import PdfPreview, { downloadHref } from "@/components/PdfPreview";

/**
 * Split-screen document viewer.
 *
 * The panel itself — the slide-in, the header, Escape to close. The document
 * inside it is `PdfPreview`, shared with the application page.
 */

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
        <PdfPreview docUrl={docUrl} label={label} className="h-full" />
      </div>
    </motion.aside>
  );
}
