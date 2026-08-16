"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * The paste box. Enter submits, Shift+Enter starts a new line — the same
 * contract as every chat interface, which matters here because job adverts are
 * pasted as multi-line blocks.
 */
export default function JobDescriptionComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with the advert, but stop before the box swallows the screen.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="w-full"
    >
      <div className="flex items-end gap-2 rounded-[28px] border border-line bg-white/70 px-4 py-3 shadow-[0_16px_60px_-30px_rgba(17,17,16,0.35)] backdrop-blur-xl transition-colors focus-within:border-foreground/30">
        <textarea
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder="Paste the job description and press Enter"
          aria-label="Job description"
          className="custom-scrollbar max-h-80 min-h-[28px] flex-1 resize-none bg-transparent py-1.5 text-fluid-base leading-relaxed text-foreground outline-none placeholder:text-muted/70 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Generate application"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-cream transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-25"
        >
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      <p className="mt-2 px-2 text-center text-fluid-xs text-muted">
        Enter to generate · Shift + Enter for a new line
      </p>
    </form>
  );
}
