"use client";

import {
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ApplicationSummary } from "@/lib/types";

function groupLabel(iso: string): string {
  const created = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(created.getTime())) return "Earlier";

  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Earlier";
}

/** Keeps the buckets in calendar order rather than whatever Map insertion gives. */
const GROUP_ORDER = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Earlier",
];

export default function HistorySidebar({
  items,
  activeId,
  open,
  onToggle,
  onSelect,
  onNew,
  onDelete,
}: {
  items: ApplicationSummary[];
  activeId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  // The list is capped at 100 records server-side, so filtering here is
  // instant and avoids a round trip on every keystroke.
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? items.filter((item) =>
          `${item.job_title} ${item.company}`.toLowerCase().includes(term)
        )
      : items;

    const buckets = new Map<string, ApplicationSummary[]>();
    for (const item of matches) {
      const label = groupLabel(item.created);
      const bucket = buckets.get(label);
      if (bucket) bucket.push(item);
      else buckets.set(label, [item]);
    }

    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
      label,
      items: buckets.get(label)!,
    }));
  }, [items, query]);

  if (!open) {
    return (
      <div className="flex h-full shrink-0 flex-col items-center gap-4 border-r border-line bg-white/40 px-2 py-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open the history sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-canvas-deep"
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onNew}
          aria-label="New application"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-canvas-deep"
        >
          <Plus className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <nav
      className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-white/40 backdrop-blur-xl"
      aria-label="Previous applications"
    >
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 px-1 text-fluid-sm font-semibold tracking-[0.14em] text-foreground">
          <img src="/logo-mark.png" alt="" className="h-5 w-5 object-contain" />
          LEVEL ONE
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse the history sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas-deep hover:text-foreground"
        >
          <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      <div className="space-y-1 px-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-fluid-sm font-medium text-foreground transition-colors hover:bg-canvas-deep"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New application
        </button>

        <label className="flex items-center gap-3 rounded-full px-3 py-2.5 text-fluid-sm text-muted transition-colors focus-within:bg-canvas-deep hover:bg-canvas-deep">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search applications"
            aria-label="Search applications"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <div className="custom-scrollbar mt-3 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-fluid-xs text-muted">
            {items.length === 0
              ? "Your generated applications will appear here."
              : "No applications match that search."}
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-3 pb-1 pt-2 text-fluid-xs font-medium text-muted">
              {group.label}
            </p>
            <ul>
              {group.items.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <li key={item.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-2xl py-2 pl-3 pr-9 text-left transition-colors ${
                        isActive
                          ? "bg-canvas-deep text-foreground"
                          : "text-foreground/80 hover:bg-canvas-deep/70"
                      }`}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fluid-sm">
                          {item.job_title}
                        </span>
                        {item.company ? (
                          <span className="block truncate text-fluid-xs text-muted">
                            {item.company}
                          </span>
                        ) : null}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete ${item.job_title}`}
                      className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-white hover:text-foreground group-focus-within:flex group-hover:flex"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-4 py-3">
        <p className="text-fluid-sm font-medium text-foreground">Dean Finlayson</p>
        <p className="truncate text-fluid-xs text-muted">Level One Digital</p>
      </div>
    </nav>
  );
}
