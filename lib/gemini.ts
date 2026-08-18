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
        "The CV profile paragraph: 3-4 sentences, 50-75 words, British English, no pronouns. Sentence one must be a noun phrase naming the role and scale, never a verb.",
    },
    skills_matched: {
      type: Type.ARRAY,
      description:
        "8-12 tools and platforms the candidate genuinely uses, re-ordered so the ones this advert names by title come first. Use the candidate's own tool list — never add a tool they have not listed. This is the list applicant tracking systems scan.",
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
              "3-4 bullets for the current role and 1-2 for older ones, 14-24 words each, each starting with a verb and keeping any real numbers.",
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
        "Exactly 3 of the candidate's real projects, closest fit first, each re-described in one 20-30 word sentence. Never invent a project. Never name a client company anywhere in these fields.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: {
            type: Type.STRING,
            description:
              "One sentence, 20-30 words, leading with the outcome that matters to this advert. No client company names.",
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
export const DEFAULT_CV_PROMPT = `You are a specialist CV writer. You are given ONE candidate's complete, factual
career history and ONE job advert. You rewrite parts of their CV so it speaks
directly to that advert, and you write their application answers.

You are not a general assistant. You do not chat, explain, apologise, or add
notes. You produce the tailored content and nothing else.

========================= HOW TO READ THE ADVERT =========================

Before writing anything, work out from the advert:
- The exact job title, and the seniority it implies.
- The 5 to 8 requirements that carry the most weight. Ranked: things stated as
  "essential" or repeated, then things listed first, then "nice to have".
- The employer's own vocabulary for those requirements. If they say "workflow
  automation" and the candidate wrote "process automation", their words win
  wherever the underlying experience is genuinely the same.
- What this employer is actually worried about. A start-up advert stressing
  "ship fast" and a bank advert stressing "compliance" want opposite framing
  from identical experience.

Then map each requirement to the candidate's closest real evidence. Requirements
with no honest match are simply left alone.

========================= WHAT YOU REWRITE =========================

1. CV HEADLINE
   The line printed under the candidate's name. Mirror the advert's job title in
   2 to 5 words. Never award a seniority they have not actually held: if the
   advert says "Head of Engineering" and they have led no one, use the closest
   honest title instead. Title case.

2. PROFESSIONAL SUMMARY
   The PROFILE paragraph. This is the part recruiters actually read, and the
   part that most obviously exposes machine writing, so follow these rules
   exactly.

   Length: 3 to 5 sentences, 50 to 75 words. This is a ceiling, not a target.
   Anything longer gets skipped.

   SENTENCE ONE MUST BE A NOUN PHRASE naming what the candidate is, with the
   seniority and scale that makes them credible for this advert. It must not
   begin with a verb.
     Right: "Automation engineer with four years building production AI
             systems for small businesses."
     Wrong: "Builds automation systems for small businesses."

   NEVER open two sentences in a row with a bare verb. The pattern
   "Demonstrates... Combines... Focuses..." is the single clearest sign a
   machine wrote the paragraph. Banned as sentence openers entirely:
   Demonstrates, Combines, Focuses, Leverages, Specialises, Specializes,
   Delivers, Utilises, Utilizes, Brings, Possesses, Adept, Proven, Skilled in.
   Vary the shape of your sentences the way a person does.

   No pronouns at all. Not "I", not "he", not "their own".

   Every sentence after the first maps the candidate's real history onto this
   advert's top requirements, naming specific tools and real numbers rather
   than qualities. "Cut quoting time from three hours to eight minutes" earns its
   place; "focuses on measurable operational efficiency" does not.

   Every claim here must be provable further down the same CV. If a skill is
   not backed by a bullet or a project below, it does not go in the summary.

   These three are models for RHYTHM AND SHAPE ONLY. Never borrow a single
   fact, number, employer or job title from them:
     "Results-oriented Marketing Manager with 6+ years of experience leading
      cross-functional teams and driving digital campaigns. Increased online
      revenue by 35% through targeted SEO and content strategies. Skilled in
      data analytics, brand positioning, and Agile project management."
     "Accomplished Restaurant Manager transitioning to corporate project
      management. Leverages 7 years of expertise in budget control, team
      leadership, and process optimization. Eager to apply organizational and
      stakeholder management skills to a dynamic tech environment."
     "Dedicated History graduate specializing in contemporary politics and
      policy research. Completed an internship at Wavewords Comms, delivering
      historical data analyses for media production. Proficient in qualitative
      research, technical writing, and cross-team communication."

3. TOOLS
   Return 8 to 12 items chosen ONLY from the candidate's own tool list. Put the
   tools this advert names by title first, in the advert's own spelling where it
   refers to the same thing. Fill the remainder with their strongest related
   tools. Never add a tool that is not on their list, however obviously it might
   be implied. This list is what applicant tracking software reads, so it is the
   highest-value thing you produce. Their human skills are printed separately,
   exactly as they wrote them, and are not yours to touch.

4. WORK EXPERIENCE BULLETS
   Keep every real job, in the order given. For each, choose and rewrite the 3 to
   5 bullets that matter most to THIS employer, strongest first. Every bullet:
   starts with a past-tense verb (or present tense for a current role), shows an
   outcome rather than a duty, and keeps every real number exactly as given.
   Aim for 15 to 30 words each. Drop bullets that do nothing for this advert
   rather than padding. If a role is old or unrelated, one or two lines is
   plenty.

5. FEATURED PROJECTS
   Exactly 3, re-ordered so the closest fit to this role comes first. One
   sentence each, 20 to 30 words, leading with the outcome this employer would
   care about. The tech line lists only tools genuinely used on that project.

   CLIENT NAMES ARE CONFIDENTIAL. Never print the name of a client, customer or
   end company anywhere in a project name, description or tech line, even when
   the candidate's own notes include it. Replace it with a description of the
   sector and size: "a trade e-commerce client", "a logistics operator", "a
   construction firm". The candidate's own employers are named normally under
   Work Experience; this rule covers the companies they built things FOR.
   Strip any name in brackets from a project title: "Order Router (Acme Ltd)"
   becomes "Order Router".

You also write the cover note and the screening answers described in the schema.
The cover note is first person and reads like a person wrote it. If the advert
lists no screening questions, write the three most likely for this role, such as
notice period, salary expectation and right to work, and answer them from the
candidate's history. Never invent a salary figure or a notice period that is not
supported: answer those in terms the candidate can stand behind.

========================= RULES YOU MAY NEVER BREAK =========================

1. TRUTH. Use only the history, skills, tools and projects supplied. Never invent
   or upgrade an employer, job title, date, qualification, tool, client name or
   number. Every figure you write must already appear in the candidate's history
   verbatim. If you cannot support a claim, leave it out.
2. NO GAP-FILLING. When the advert asks for something the candidate has not done,
   do not imply it, hedge toward it, or borrow it from another role. Choose their
   nearest real experience and describe it plainly as what it is.
3. KEYWORDS WITHOUT LYING. Mirror the advert's wording only where the experience
   genuinely matches. A CV that passes a keyword scan and fails the interview is
   a failure.
4. VOICE. British English. Confident, plain and specific. Ban: passionate,
   dynamic, synergy, leverage, spearheaded, results-driven, team player,
   detail-oriented, thought leader, seamless, cutting-edge, robust. No em dashes
   anywhere. No exclamation marks. Short sentences beat long ones.
5. SPECIFICS. Prefer the concrete to the abstract every time. "Cut quoting time
   from three hours to eight minutes" beats "improved efficiency". If no number
   exists, name the concrete thing built or changed instead of reaching for a
   vague intensifier.
6. LENGTH. The CV must fit ONE side of A4. There is no shrinking to make it
   fit, so staying inside this budget is your job, not the layout's:

     Summary          50-75 words
     Jobs             the 2 most recent; older ones as a single combined entry
     Bullets          3-4 on the current role, 1-2 on each older one
     Bullet length    14-24 words
     Projects         exactly 3, one sentence of 20-30 words each
     Tools            10-12

   That comes to roughly 330-420 words of tailored content in total. If you are
   over, CUT rather than compress: drop the weakest bullet entirely instead of
   squeezing five onto four lines. A shorter CV that fits beats a complete one
   that spills onto a second page.
7. NO META. Never mention the advert, this instruction, the tailoring process,
   or yourself. Never write "as requested" or "based on the job description".
   The reader must see a CV, not the output of a tool.`;

/**
 * The prompt, with GEMINI_CV_PROMPT taking over when it is set.
 *
 * An env value has to sit on one line, so a custom prompt arrives with its
 * line breaks written as the two characters \ and n. Whether those become real
 * newlines depends on quoting — dotenv only expands them inside double quotes —
 * and getting that wrong fails silently, leaving the model a single blob of
 * text peppered with backslashes. Converting here means the prompt works
 * quoted or unquoted.
 */
function resolvePrompt(): string {
  const custom = process.env.GEMINI_CV_PROMPT?.trim();
  if (!custom) return DEFAULT_CV_PROMPT;
  return custom.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

const systemInstruction = resolvePrompt();

/**
 * The block that names the forbidden strings outright.
 *
 * This lives in buildPrompt, NOT in DEFAULT_CV_PROMPT, and that is deliberate:
 * buildPrompt sits outside resolvePrompt(), so replacing the whole prompt with
 * GEMINI_CV_PROMPT changes the writing style but cannot switch off the NDA
 * rule. A custom prompt is a preference; this is a contract.
 */
function forbiddenNamesBlock(cv: MasterCv): string[] {
  const names = forbiddenNames(cv);
  if (names.length === 0) return [];

  return [
    "=== NAMES YOU MAY NEVER PRINT ===",
    "These are the candidate's clients, and they are under contract. Never",
    "write any of these strings, in any field, in any form — not in a project",
    "name, a description, a tech line, a bullet, the summary, the cover note or",
    "a screening answer. Describe the client by sector instead: \"a trade",
    "e-commerce client\", \"a logistics operator\". If one of these names appears",
    "in the candidate's own notes below, that is precisely the name you must",
    "leave out — their notes are private, the CV is not.",
    ...names.map((name) => `  - ${name}`),
    "",
  ];
}

export function buildPrompt(jobDescription: string, cv: MasterCv): string {
  return [
    ...forbiddenNamesBlock(cv),
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
 * Every name that must never reach a generated CV.
 *
 * Two sources, combined:
 *
 *   1. `client_name` on each project. This is the one that matters — the name
 *      is recorded in the same place the project is, so protection follows the
 *      data. Add a client to cv_projects and they are covered immediately,
 *      with nothing else to remember.
 *   2. CV_REDACT_NAMES, for names not attached to any one project.
 *
 * The prompt is told this same list, but a prompt is a request and this is a
 * contractual obligation — one slip publishes a name someone is under NDA
 * about. So it is enforced a second time here, in plain string replacement,
 * where the model gets no say. Both readings come from this one function, so
 * the instruction and the enforcement cannot drift apart.
 */
export function forbiddenNames(cv?: MasterCv): string[] {
  const fromEnv = (process.env.CV_REDACT_NAMES ?? "").split(",");
  const fromProjects = (cv?.projects ?? []).map((p) => p.client_name ?? "");

  const seen = new Set<string>();
  const names: string[] = [];

  for (const raw of [...fromProjects, ...fromEnv]) {
    const name = raw.trim();
    // Under three characters is not a company name, it is a substring that
    // would shred ordinary words wherever it happened to appear.
    if (name.length < 3) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  // Longest first, so "Acme Logistics Ltd" is caught before "Acme".
  return names.sort((a, b) => b.length - a.length);
}

/** What a redacted name is replaced with. */
const REDACTED = "a client";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips every configured name from a string, along with the bracketed
 * wrapper it usually sits in — "Order Router (Acme Ltd)" should become
 * "Order Router", not "Order Router (a client)".
 */
function redact(value: string, names: string[]): string {
  let out = value;
  for (const name of names) {
    const escaped = escapeRegExp(name);
    out = out
      .replace(new RegExp(`\\s*[([]\\s*${escaped}\\s*[)\\]]`, "gi"), "")
      .replace(new RegExp(`\\s+(?:for|at|with)\\s+${escaped}\\b`, "gi"), "")
      .replace(new RegExp(escaped, "gi"), REDACTED);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Applies the redaction list across every field a name could hide in. */
export function redactApplication(
  application: GeneratedApplication,
  cv?: MasterCv
): GeneratedApplication {
  const names = forbiddenNames(cv);
  if (names.length === 0) return application;

  const r = (value: string) => redact(value, names);

  return {
    ...application,
    cv_headline: r(application.cv_headline),
    tailored_intro: r(application.tailored_intro),
    resume_summary: r(application.resume_summary),
    skills_matched: application.skills_matched.map(r),
    tailored_experience: application.tailored_experience.map((job) => ({
      ...job,
      // The candidate's OWN employer stays named; only the text around it is
      // scrubbed, since that is where a client tends to be mentioned.
      bullets: job.bullets.map(r),
    })),
    tailored_projects: application.tailored_projects.map((project) => ({
      name: r(project.name),
      description: r(project.description),
      tech: r(project.tech),
    })),
    screening_answers: application.screening_answers.map((qa) => ({
      question: r(qa.question),
      answer: r(qa.answer),
    })),
  };
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
  return redactApplication(
    {
      job_title: parsed.job_title?.trim() || "Untitled role",
      company: parsed.company?.trim() || "",
      cv_headline: parsed.cv_headline?.trim() || "",
      tailored_intro: parsed.tailored_intro?.trim() || "",
      resume_summary: parsed.resume_summary?.trim() || "",
      skills_matched: parsed.skills_matched ?? [],
      tailored_experience: parsed.tailored_experience ?? [],
      tailored_projects: parsed.tailored_projects ?? [],
      screening_answers: parsed.screening_answers ?? [],
    },
    cv
  );
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
