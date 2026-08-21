"use client";

import { motion } from "framer-motion";
import { List, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

// Reaches for `window` (WebGL), so it cannot be server-rendered.
const Background3D = dynamic(() => import("@/components/Background3D"), {
  ssr: false,
});

/**
 * The front door.
 *
 * Was a paste box; now two buttons, because finding jobs happens inside the
 * system rather than in a browser tab. Pasting still exists at /paste for a job
 * someone sends directly, and is linked from the job board's sidebar.
 *
 * Deliberately TWO buttons and not three: the local and remote searches are one
 * question asked of two places, and making someone press both — then merge the
 * answers in their head — was the wrong shape for it.
 */
export default function HomePage() {
  return (
    <div className="relative flex h-screen overflow-hidden">
      <Background3D busy={false} dimmed={false} />

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-6 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt=""
              className="h-16 w-16 object-contain sm:h-20 sm:w-20"
            />

            <h1 className="text-fluid-3xl font-semibold tracking-tight text-foreground">
              Hi Dean, let&rsquo;s get started
            </h1>

            <p className="max-w-md text-fluid-base text-muted">
              One search covers AI and automation roles around Edinburgh and
              remote roles anywhere else in the UK. Every job is scored against
              your profile before you see it.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {/* search=1 makes the board start a search on arrival, so this is
                  one press rather than two for the same intention. */}
              <Link href="/jobs?view=top-match&search=1" className="btn-primary">
                <Search className="h-4 w-4" aria-hidden />
                Search Jobs
              </Link>

              <Link href="/jobs?view=all" className="btn-ghost">
                <List className="h-4 w-4" aria-hidden />
                Jobs List
              </Link>
            </div>

            <Link
              href="/paste"
              className="text-fluid-xs text-muted underline-offset-4 transition hover:text-foreground hover:underline"
            >
              Or paste an advert someone sent you
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
