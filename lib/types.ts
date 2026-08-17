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
  /** Parsed from one comma-separated line in PocketBase. */
  skills: string[];
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

/** What POST /api/generate-application answers with. */
export interface GenerateResponse {
  application: ApplicationRecord;
  /** Same-origin URL the viewer loads the PDF from. */
  docUrl: string;
}
