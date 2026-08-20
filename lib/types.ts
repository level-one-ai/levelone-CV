/** Shapes shared by the API routes, the CV loader and the UI. */

export interface CvProfile {
  id: string;
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  /** Free-form label -> URL map, e.g. { LinkedIn: "https://..." }. */
  links: Record<string, string>;
  master_summary: string;
  /** Human skills, e.g. Problem-Solving. Printed as written, never tailored. */
  skills: string[];
  /** Tools and platforms, e.g. n8n, Docker. Tailored to each advert. */
  tools: string[];
  /** One qualification per line: "Degree | School | Dates". */
  education: string;
  /** Stored filename of the uploaded headshot, empty if none. */
  photo: string;
}

export interface CvExperience {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: string[];
  order: number;
}

export interface CvProject {
  id: string;
  name: string;
  role: string;
  description: string;
  tech: string[];
  outcome: string;
  link: string;
  order: number;
  /**
   * The client this was built for. Never rendered, never sent to the model as
   * part of the project description — it is here only so the name can be
   * forbidden in the prompt and scrubbed from the output.
   */
  client_name: string;
}

/** Everything Gemini is given about Dean, in one object. */
export interface MasterCv {
  profile: CvProfile;
  experience: CvExperience[];
  /** Lifted from the profile record — see CvProfile.skills. */
  skills: string[];
  projects: CvProject[];
}

export interface TailoredExperience {
  company: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface ScreeningAnswer {
  question: string;
  answer: string;
}

/** A project as rewritten for this advert. */
export interface TailoredProject {
  name: string;
  description: string;
  /** A single line, e.g. "Next.js, Gemini, PocketBase". */
  tech: string;
}

/** The structured object Gemini returns, matching the response schema. */
export interface GeneratedApplication {
  job_title: string;
  company: string;
  /** The line under your name on the CV, matched to the advert's job title. */
  cv_headline: string;
  tailored_intro: string;
  resume_summary: string;
  skills_matched: string[];
  /**
   * The human skills chosen for this advert, from the candidate's own list.
   * Filtered against that list in code before rendering, so nothing invented
   * can reach the page.
   */
  skills_selected: string[];
  tailored_experience: TailoredExperience[];
  tailored_projects: TailoredProject[];
  screening_answers: ScreeningAnswer[];
}

/** An `applications` record as PocketBase hands it back. */
export interface ApplicationRecord extends GeneratedApplication {
  id: string;
  job_description: string;
  /** Stored filename of the generated PDF, empty until it is attached. */
  pdf: string;
  /** Stored filename of the cover note PDF, empty when there is none. */
  cover_note_pdf: string;
  created: string;
  updated: string;
}

/** The trimmed shape the sidebar lists. */
export interface ApplicationSummary {
  id: string;
  job_title: string;
  company: string;
  created: string;
}

/** Why an advert was flagged as one you have already applied to. */
export type DuplicateReason = "identical" | "near-identical" | "same-role";

/** A past application that looks like the advert just pasted. */
export interface DuplicateMatch {
  id: string;
  job_title: string;
  company: string;
  created: string;
  reason: DuplicateReason;
  /** Jaccard similarity, 0 to 1. Zero for a `same-role` match, which is not scored. */
  score: number;
}

/** What POST /api/generate-application answers with. */
export interface GenerateResponse {
  application: ApplicationRecord;
  /** Same-origin URL the viewer loads the PDF from. */
  docUrl: string;
  /** Same, for the cover note PDF. Empty when there is no cover note. */
  coverNoteUrl: string;
}
