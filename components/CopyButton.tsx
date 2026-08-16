"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Puts a block of text on the clipboard and confirms it for two seconds.
 *
 * `navigator.clipboard` only exists in a secure context, so an app opened over
 * plain http on the LAN would otherwise have a copy button that silently does
 * nothing. The textarea fallback covers that case.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — permission denied or an insecure origin.
    }
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}

export default function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleCopy() {
    const ok = await writeToClipboard(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white/70 px-3 py-1.5 text-fluid-xs font-medium text-foreground transition-colors hover:border-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      aria-label={`${label} to clipboard`}
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : label}
    </button>
  );
}
