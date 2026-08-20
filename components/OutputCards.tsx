"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { Download } from "lucide-react";

import CopyButton from "@/components/CopyButton";
import type { ApplicationRecord } from "@/lib/types";

function Card({
  title,
  hint,
  copyText,
  index,
  action,
  children,
}: {
  title: string;
  hint?: string;
  copyText: string;
  index: number;
  /** An extra control beside Copy, e.g. Download PDF. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="card"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-fluid-sm font-semibold uppercase tracking-widest text-foreground">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-fluid-xs text-muted">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <CopyButton text={copyText} />
        </div>
      </header>
      {children}
    </motion.section>
  );
}

/** Body copy shared by the prose cards — preserves the model's paragraphs. */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-fluid-base leading-relaxed text-foreground/90">
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

/**
 * The output dashboard: one card per block of text, each independently
 * copyable, because job forms are filled one field at a time.
 */
/** Matches CopyButton's shape so the two sit together without fuss. */
function DownloadPdfButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      // The route sets Content-Disposition: attachment, so this saves the file
      // rather than navigating away from the results.
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-fluid-xs font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      PDF
    </a>
  );
}

export default function OutputCards({
  application,
  coverNoteUrl,
}: {
  application: ApplicationRecord;
  /** Empty for applications generated before cover note PDFs existed. */
  coverNoteUrl?: string;
}) {
  const qaPlainText = application.screening_answers
    .map((qa) => `${qa.question}\n${qa.answer}`)
    .join("\n\n");

  let index = 0;

  return (
    <div className="space-y-4">
      {application.tailored_intro ? (
        <Card
          title="Cover note"
          hint="Paste into the application's message or cover letter box — or send the PDF."
          copyText={application.tailored_intro}
          index={index++}
          action={
            coverNoteUrl ? (
              <DownloadPdfButton href={`${coverNoteUrl}&download=1`} />
            ) : null
          }
        >
          <Prose text={application.tailored_intro} />
        </Card>
      ) : null}

      {application.resume_summary ? (
        <Card
          title="CV summary"
          hint="Already written into the generated CV — copy it if a form asks separately."
          copyText={application.resume_summary}
          index={index++}
        >
          <Prose text={application.resume_summary} />
        </Card>
      ) : null}

      {application.skills_matched.length ? (
        <Card
          title="Skills matched"
          hint="Your real skills that this advert asks for, strongest first."
          copyText={application.skills_matched.join(", ")}
          index={index++}
        >
          <ul className="flex flex-wrap gap-2">
            {application.skills_matched.map((skill) => (
              <li
                key={skill}
                className="rounded-full border border-line bg-white/60 px-3 py-1.5 text-fluid-xs text-foreground"
              >
                {skill}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {application.screening_answers.length ? (
        <Card
          title="Screening answers"
          hint="One answer per question — copy them individually or all at once."
          copyText={qaPlainText}
          index={index++}
        >
          <ol className="space-y-4">
            {application.screening_answers.map((qa, i) => (
              <li key={i} className="rounded-2xl border border-line/70 bg-white/40 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-fluid-sm font-semibold text-foreground">
                    {qa.question}
                  </p>
                  <CopyButton text={qa.answer} label="Copy" />
                </div>
                <p className="whitespace-pre-line text-fluid-base leading-relaxed text-foreground/90">
                  {qa.answer}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
