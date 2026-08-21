"use client";

import {
  ClipboardList,
  FileText,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import type { JobStatus, JobView } from "@/lib/jobs";

/**
 * The job board's sidebar.
 *
 * Deliberately the same shape as HistorySidebar — same width, same header, same
 * footer — so moving between applications and jobs does not feel like moving
 * between two different programs.
 */

const VIEWS: Array<{
  view: JobView;
  label: string;
  icon: typeof Sparkles;
  hint: string;
  countFrom?: JobStatus;
}> = [
  {
    view: "top-match",
    label: "Top match",
    icon: Sparkles,
    hint: "Best fit first, nothing you have handled yet",
    countFrom: "Scraped",
  },
  { view: "all", label: "All jobs", icon: Layers, hint: "Newest first" },
  {
    view: "not-applied",
    label: "Not applied",
    icon: ClipboardList,
    hint: "Found, still waiting on you",
    countFrom: "Scraped",
  },
  {
    view: "applied",
    label: "Applied",
    icon: Send,
    hint: "Sent, with the documents you sent",
    countFrom: "Applied",
  },
  {
    view: "dismissed",
    label: "Not interested",
    icon: Trash2,
    hint: "Hidden from the other views",
    countFrom: "Dismissed",
  },
];

export default function JobsSidebar({
  view,
  counts,
  total,
  open,
  onToggle,
}: {
  view: JobView;
  counts: Record<JobStatus, number>;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Show the job list"
        className="absolute left-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/70 text-muted transition hover:text-foreground"
      >
        <PanelLeftOpen className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-canvas-deep/50">
      <header className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-fluid-sm font-semibold tracking-widest text-foreground">
          LEVEL ONE
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide the job list"
          className="text-muted transition hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {VIEWS.map(({ view: target, label, icon: Icon, hint, countFrom }) => {
          const active = target === view;
          const count = countFrom ? counts[countFrom] : total;

          return (
            <Link
              key={target}
              href={`/jobs?view=${target}`}
              title={hint}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-fluid-sm transition ${
                active
                  ? "bg-foreground/[0.06] font-medium text-foreground"
                  : "text-muted hover:bg-foreground/[0.03] hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="shrink-0 text-fluid-xs tabular-nums text-muted">
                {count}
              </span>
            </Link>
          );
        })}

        <div className="!mt-4 border-t border-line pt-3">
          <Link
            href="/paste"
            title="For a job someone sent you directly"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-fluid-sm text-muted transition hover:bg-foreground/[0.03] hover:text-foreground"
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Paste an advert</span>
          </Link>
        </div>
      </nav>

      <footer className="border-t border-line px-4 py-4">
        <p className="text-fluid-sm font-medium text-foreground">Dean Finlayson</p>
        <p className="text-fluid-xs text-muted">Level One Digital</p>
      </footer>
    </aside>
  );
}
