import { GoogleGenAI, Type } from "@google/genai";

import { formatCvForPrompt } from "@/lib/cv";
import type { GeneratedApplication, MasterCv } from "@/lib/types";

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

/**
 * The exact shape Gemini must answer in. Paired with
 * `responseMimeType: "application/json"` this is a hard constraint on
 * decoding, not a request — which is why nothing downstream has to strip
 * ```json fences or repair trailing commas.
 */
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    job_title: {
      type: Type.STRING,
      description: "The job title exactly as written in the advert.",
    },
    cv_headline: {
      type: Type.STRING,
      description:
        "The line printed under the candidate's name on the CV. Match the advert's job title, but never claim a seniority the candidate has not held. 2-5 words, title case.",
    },
    company: {
      type: Type.STRING,
      description:
        "The hiring company's name. Use an empty string if the advert never names it.",
    },
    tailored_intro: {
      type: Type.STRING,
      description:
        "A cover note of 120-180 words addressed to the hiring team, in first person, British English. No greeting line, no sign-off.",
    },
    resume_summary: {
      type: Type.STRING,
      description:
        "A 3-4 sentence CV professional summary rewritten for this advert, first person implied (no 'I'), British English.",
    },
    skills_matched: {
      type: Type.ARRAY,
      description:
        "6-10 skills drawn from the candidate's real history that the advert asks for, most relevant first.",
      items: { type: Type.STRING },
    },
    tailored_experience: {
      type: Type.ARRAY,
      description:
        "The candidate's real roles, re-ordered and re-worded for this advert. Never invent a role.",
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          role: { type: Type.STRING },
          dates: {
            type: Type.STRING,
            description: "e.g. 'Jan 2023 – Present'",
          },
          bullets: {
            type: Type.ARRAY,
            description:
              "3-5 achievement bullets, each starting with a past-tense verb and keeping any real numbers.",
            items: { type: Type.STRING },
          },
        },
        required: ["company", "role", "dates", "bullets"],
        propertyOrdering: ["company", "role", "dates", "bullets"],
      },
    },
    tailored_projects: {
      type: Type.ARRAY,
      description:
        "The candidate's real projects, re-ordered so the ones closest to this advert come first, and re-described to lead with what this employer cares about. Never invent a project. Include at most 4.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: {
            type: Type.STRING,
            description:
              "One or two sentences, leading with the outcome that matters to this advert.",
          },
          tech: {
            type: Type.STRING,
            description:
              "The tools used, comma separated on one line, e.g. 'Next.js, Gemini, PocketBase'.",
          },
        },
        required: ["name", "description", "tech"],
        propertyOrdering: ["name", "description", "tech"],
      },
    },
    screening_answers: {
      type: Type.ARRAY,
      description:
        "Answers to the screening questions in the advert. If it asks none, write 3 likely ones for this role (e.g. notice period, salary expectation, right to work) and answer them.",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: {
            type: Type.STRING,
            description: "40-90 words, first person, ready to paste into a form.",
          },
        },
        required: ["question", "answer"],
        propertyOrdering: ["question", "answer"],
      },
    },
  },
  required: [
    "job_title",
    "company",
    "cv_headline",
    "tailored_intro",
    "resume_summary",
    "skills_matched",
    "tailored_experience",
    "tailored_projects",
    "screening_answers",
  ],
  propertyOrdering: [
    "job_title",
    "company",
    "cv_headline",
    "tailored_intro",
    "resume_summary",
    "skills_matched",
    "tailored_experience",
    "tailored_projects",
    "screening_answers",
  ],
};

/**
 * The instruction Gemini follows. Override it with GEMINI_CV_PROMPT in
 * .env.local to retune the writing without touching code — the response schema
 * is enforced separately, so a custom prompt cannot break the output shape.
 */
export const DEFAULT_CV_PROMPT = `You tailor one specific candidate's CV and job application to one specific advert.

You are rewriting five parts of a CV, and nothing else:
1. CV HEADLINE — the line under their name. Match the advert's job title, but
   never promote them to a seniority they have not actually held.
2. PROFESSIONAL SUMMARY — a short paragraph built around the main skills and
   keywords in the advert, drawn only from what the candidate has really done.
3. CORE SKILLS — their real skills, re-ordered so the ones the advert asks for
   by name come first. Use the advert's own wording where it genuinely matches.
4. WORK EXPERIENCE BULLETS — the same real jobs, with the achievements that
   matter to this employer brought to the front and reworded in their terms.
5. FEATURED PROJECTS — the same real projects, re-ordered and re-described to
   lead with the work closest to this role's goals.

Rules you must never break:
1. Use ONLY the work history, skills and projects given to you. If the advert
   asks for something the candidate has not done, do not claim it — pick the
   closest real experience and describe it honestly.
2. Never invent employers, dates, job titles, qualifications, tools or metrics.
   Every number you write must already appear in the candidate's history.
3. Mirror the advert's vocabulary only where the experience is genuinely there,
   so applicant tracking systems match without the CV becoming a lie.
4. Write in British English, in a confident, plain, human voice. No cliches
   like "passionate", "synergy" or "dynamic team player", and no em dashes.
5. Every bullet shows an outcome, not a duty. Keep real numbers.
6. Keep the CV to one page of A4: at most 4 jobs, at most 4 bullets each, at
   most 4 projects, and at most 10 skills.`;

const systemInstruction = process.env.GEMINI_CV_PROMPT || DEFAULT_CV_PROMPT;

function buildPrompt(jobDescription: string, cv: MasterCv): string {
  return [
    "=== CANDIDATE MASTER CV ===",
    formatCvForPrompt(cv),
    "",
    "=== JOB ADVERT ===",
    jobDescription.trim(),
    "",
    "Write the tailored application for this advert, following the schema.",
  ].join("\n");
}

/** Errors worth trying once more: rate limits and transient server faults. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? "");
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    /overloaded|unavailable|timeout|ECONNRESET/i.test(message)
  );
}

/**
 * Sends the advert plus the master CV to Gemini and returns the structured
 * application. One retry on a transient fault, because a single 503 should not
 * cost the whole generation run.
 */
export async function generateApplication(
  jobDescription: string,
  cv: MasterCv
): Promise<GeneratedApplication> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local — see SETUP.md step 2."
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const request = {
    model: GEMINI_MODEL,
    contents: buildPrompt(jobDescription, cv),
    config: {
      systemInstruction,
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  let text: string | undefined;
  try {
    text = (await ai.models.generateContent(request)).text;
  } catch (err) {
    if (!isTransient(err)) throw describeGeminiError(err);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      text = (await ai.models.generateContent(request)).text;
    } catch (retryErr) {
      throw describeGeminiError(retryErr);
    }
  }

  if (!text) {
    throw new Error(
      "Gemini returned an empty response. This usually means the advert triggered a safety filter — try pasting it again without any personal contact details."
    );
  }

  let parsed: GeneratedApplication;
  try {
    parsed = JSON.parse(text) as GeneratedApplication;
  } catch {
    throw new Error("Gemini returned a response that was not valid JSON.");
  }

  // The schema guarantees the keys exist, but a model can still answer with
  // empty arrays. Normalising here keeps every consumer free of null checks.
  return {
    job_title: parsed.job_title?.trim() || "Untitled role",
    company: parsed.company?.trim() || "",
    cv_headline: parsed.cv_headline?.trim() || "",
    tailored_intro: parsed.tailored_intro?.trim() || "",
    resume_summary: parsed.resume_summary?.trim() || "",
    skills_matched: parsed.skills_matched ?? [],
    tailored_experience: parsed.tailored_experience ?? [],
    tailored_projects: parsed.tailored_projects ?? [],
    screening_answers: parsed.screening_answers ?? [],
  };
}

function describeGeminiError(err: unknown): Error {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? "unknown error");

  if (status === 400 && /API key/i.test(message)) {
    return new Error(
      "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local — see SETUP.md step 2."
    );
  }
  if (status === 403) {
    return new Error(
      "Gemini refused the request (403). The API key may be restricted, or the Generative Language API is not enabled for its project."
    );
  }
  if (status === 404) {
    return new Error(
      `Gemini has no model called "${GEMINI_MODEL}". Change GEMINI_MODEL in .env.local to a model your key can use, such as gemini-2.5-flash.`
    );
  }
  if (status === 429) {
    return new Error(
      "Gemini is rate limiting this key. Wait a minute and try again."
    );
  }
  return new Error(`Gemini error: ${message}`);
}
