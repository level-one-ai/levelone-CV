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

/** The structured object Gemini returns, matching the response schema. */
export interface GeneratedApplication {
  job_title: string;
  company: string;
  tailored_intro: string;
  resume_summary: string;
  skills_matched: string[];
  tailored_experience: TailoredExperience[];
  screening_answers: ScreeningAnswer[];
}

/** An `applications` record as PocketBase hands it back. */
export interface ApplicationRecord extends GeneratedApplication {
  id: string;
  job_description: string;
  /** Stored filename of the generated .docx, empty until it is attached. */
  docx: string;
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
  /** Same-origin URL the viewer fetches the .docx bytes from. */
  docUrl: string;
}
