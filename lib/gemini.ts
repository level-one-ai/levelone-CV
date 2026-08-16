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
    "tailored_intro",
    "resume_summary",
    "skills_matched",
    "tailored_experience",
    "screening_answers",
  ],
  propertyOrdering: [
    "job_title",
    "company",
    "tailored_intro",
    "resume_summary",
    "skills_matched",
    "tailored_experience",
    "screening_answers",
  ],
};

const systemInstruction = `You write job applications for one specific candidate.

Rules you must never break:
1. Use ONLY the work history, skills and projects given to you. If the advert
   asks for something the candidate has not done, do not claim it — instead
   pick the closest real experience and describe it honestly.
2. Never invent employers, dates, job titles, qualifications or metrics.
3. Mirror the advert's own vocabulary where the candidate genuinely has the
   experience, so applicant tracking systems match on it.
4. Write in British English, in a confident, plain, human voice. No cliches
   like "passionate", "synergy", "dynamic team player", and no em dashes.
5. Every bullet should show an outcome, not a duty.`;

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
    tailored_intro: parsed.tailored_intro?.trim() || "",
    resume_summary: parsed.resume_summary?.trim() || "",
    skills_matched: parsed.skills_matched ?? [],
    tailored_experience: parsed.tailored_experience ?? [],
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
