import type { RecordModel } from "pocketbase";

import type {
  ApplicationRecord,
  ScreeningAnswer,
  TailoredExperience,
  TailoredProject,
} from "@/lib/types";

/**
 * PocketBase hands `json` fields back already parsed, but a record written
 * before a field existed — or edited by hand in the Admin UI — can still
 * arrive as a string or as null. Every read path goes through here so the UI
 * never has to guard the shape itself.
 */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toApplicationRecord(record: RecordModel): ApplicationRecord {
  return {
    id: record.id,
    job_title: String(record.job_title ?? "Untitled role"),
    company: String(record.company ?? ""),
    cv_headline: String(record.cv_headline ?? ""),
    job_description: String(record.job_description ?? ""),
    tailored_intro: String(record.tailored_intro ?? ""),
    resume_summary: String(record.resume_summary ?? ""),
    skills_matched: parseJson<string[]>(record.skills_matched, []),
    skills_selected: parseJson<string[]>(record.skills_selected, []),
    tailored_experience: parseJson<TailoredExperience[]>(
      record.tailored_experience,
      []
    ),
    tailored_projects: parseJson<TailoredProject[]>(
      record.tailored_projects,
      []
    ),
    screening_answers: parseJson<ScreeningAnswer[]>(
      record.screening_answers,
      []
    ),
    pdf: String(record.pdf ?? ""),
    created: String(record.created ?? ""),
    updated: String(record.updated ?? ""),
  };
}
