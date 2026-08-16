"use client";

import { motion } from "framer-motion";

const WORD = "Generating";

/**
 * The waiting state that replaces the composer while an application is being
 * written. The ring sweeps and the letters light left to right; the styling
 * lives in `app/globals.css` under the `.loader-*` classes.
 */
export default function GeneratingLoader({
  subtitle = "Reading the advert, matching your history, and rewriting your CV.",
}: {
  subtitle?: string;
} = {}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center gap-8 py-6"
      role="status"
      aria-live="polite"
      aria-label="Generating your application"
    >
      <div className="loader-wrapper">
        {WORD.split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="loader-letter"
            style={{ "--i": index } as React.CSSProperties}
            aria-hidden
          >
            {letter}
          </span>
        ))}
        <div className="loader" aria-hidden />
      </div>

      <p className="max-w-sm text-center text-fluid-sm text-muted">{subtitle}</p>
    </motion.div>
  );
}
