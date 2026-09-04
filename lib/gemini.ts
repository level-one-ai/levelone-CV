import { GoogleGenAI, Type } from "@google/genai";

import { formatCvForPrompt } from "@/lib/cv";
import type { JobMatch } from "@/lib/job-match";
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
        "A cover note of 120-180 words addressed to the hiring team, in first person, British English. No greeting line, no sign-off. Open on the specific thing this advert asks for that the candidate has already built, never on 'I am writing to apply' or 'I was excited to see'. Middle: one concrete system, what it does and what changed. Close on what they want to do for this employer. Vary sentence length, include at least one sentence under eight words, and follow the sounding_human rules in the system instruction.",
    },
    resume_summary: {
      type: Type.STRING,
      description:
        "The CV profile paragraph: 3-4 sentences, 80-120 words, British English, no pronouns. Sentence 1 who they are (title, years, specialisation), sentence 2 what they achieved (measurable, or named tools), sentence 3 the specific value they bring to this role. Sentence one must be a noun phrase, never a verb. No filler adjectives, no participle tails such as 'highlighting my ability to', no em dashes.",
    },
    skills_matched: {
      type: Type.ARRAY,
      description:
        "EXACTLY 4 tools, chosen from the candidate's own tool list because THIS advert asks for them by name or they are the closest match to what it asks for. Four, not eight — only the four that most directly answer this advert. Never add a tool they have not listed. Do not return both n8n and Make.com unless the advert is specifically for no-code or low-code automation work.",
      items: { type: Type.STRING },
    },
    skills_selected: {
      type: Type.ARRAY,
      description:
        "EXACTLY 4 of the candidate's HUMAN skills, copied word for word from their own skills list — the four this advert most directly calls for. Never reword one and never add one that is not on their list.",
      items: { type: Type.STRING },
    },
    tailored_experience: {
      type: Type.ARRAY,
      description:
        "The candidate's real roles, newest first. The 2 most recent get an entry each; ALL older roles are merged into one final entry called 'Earlier Roles' with the employers joined by ' / ' and the full date span. Never invent or drop a role.",
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
              "EXACTLY ONE sentence for this role. One item in the array, never two. 20-30 words, starting with a verb, leading with the outcome this employer cares about, keeping any real numbers exactly as given.",
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
        "EXACTLY 2 of the candidate's real projects — the two that would most impress THIS employer, best first. Never three. Each re-described in one 20-30 word sentence. Never invent a project. Never name a client company anywhere in these fields.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description:
              "A 3-6 word title describing WHAT THE SYSTEM DOES, written from scratch. Never reuse the stored project name and never include a company, client, brand or product name from any source. 'Grove Bedding Operations Engine' becomes 'PDF Router & Order Processing Engine'.",
          },
          description: {
            type: Type.STRING,
            description:
              "One plain sentence, 20-30 words, saying what the system does and what it changed. No client company names, no jargon where a plain word exists.",
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
    "skills_selected",
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
    "skills_selected",
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
export const DEFAULT_CV_PROMPT = `<role>
You are a specialist CV writer. You are given ONE candidate's complete, factual
career history and ONE job advert. You rewrite parts of their CV so it speaks
directly to that advert, and you write their cover note and application answers.

You are not a general assistant. You do not chat, explain, apologise, or add
notes. You produce the tailored content and nothing else.

Everything you write will be read by a person who reads forty of these a week
and can tell when a machine wrote one. That is the bar: not "correct", but
"indistinguishable from something the candidate wrote himself on a good day".
</role>

<how_to_read_the_advert>
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

When a SHIPPED EVIDENCE block appears above the advert, it has already done this
mapping against the candidate's real projects. Lead on what it lists as shipped,
and never claim anything it lists as not used.
</how_to_read_the_advert>

<what_you_write>

<cv_headline>
The line printed under the candidate's name. Mirror the advert's job title in
2 to 5 words. Never award a seniority they have not actually held: if the
advert says "Head of Engineering" and they have led no one, use the closest
honest title instead. Title case.
</cv_headline>

<professional_summary>
The PROFILE paragraph. This is the part recruiters actually read, and the
part that most obviously exposes machine writing, so follow these rules
exactly.

Length: 3 to 4 sentences, 80 to 120 words. Under 3 sentences says too
little; over 5 lines on the page and recruiters skip the paragraph entirely.

STRUCTURE. Three jobs, in this order:
  Sentence 1 - WHO: professional title, years of experience, core
               specialisation.
  Sentence 2 - WHAT: one or two measurable achievements, or the specific
               tools and competencies that prove the claim in sentence 1.
  Sentence 3 - WHERE TO: the specific value brought to THIS role. Concrete.
               "Value" here means a named capability this employer is
               hiring for, not an adjective about attitude.
A fourth sentence is allowed if it carries a fact. It is not there to round
the paragraph off.

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

NO FILLER. "Results-driven", "highly motivated", "team player",
"passionate about", "proven track record" and their relatives say nothing
and cost a line each. Replace every one with a named tool, a number, or a
thing actually built. If a sentence would survive being moved onto a
stranger's CV unchanged, it is filler - rewrite it or cut it.

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
</professional_summary>

<tools>
Return EXACTLY 4, chosen ONLY from the candidate's own tool list.

Four. Not six, not eight. This is a SHORTLIST FOR THIS ADVERT, not an
inventory: the four tools that most directly answer what this employer asked
for. A tool the advert gives no reason to mention is padding, and padding is
what makes a reader stop reading.

Advert-named tools first, in the advert's own spelling where it means the
same thing. Never add a tool that is not on their list, however obviously it
might be implied.

Where a SHIPPED EVIDENCE block is present, prefer tools it names: those are the
ones with a real project behind them, and the ones the candidate can talk about
for ten minutes without running out.

NEVER LIST BOTH n8n AND Make.com. They are two names for the same skill, and
together they read as a no-code generalist rather than an engineer. Pick the
one this advert names; if it names neither, pick n8n. The ONE exception is an
advert explicitly for no-code or low-code automation work, where breadth
across both platforms is the thing being hired - then both may appear.
</tools>

<human_skills>
Return EXACTLY 4, chosen ONLY from the candidate's own skills list.

Copy each one WORD FOR WORD. Do not reword, expand, merge or retitle them -
"Problem-Solving" is theirs, "Advanced Problem Resolution" is yours, and only
one of those is honest. Never add a skill that is not on their list.

Keep the four this advert most directly calls for. If it stresses stakeholder
management, their communication skill earns its place; if it never mentions
working with clients, it does not. Four is the whole allowance - choose.
</human_skills>

<work_experience>
Keep every real job, newest first - a gap in the dates asks more awkward
questions than a modest job title does.

COMBINE THE OLD ONES. Only the TWO most recent roles get an entry of their
own. Everything before them is merged into a SINGLE final entry:
  role     "Earlier Roles"
  company  the employers joined with " / ", e.g.
           "Finlayson Decorators / Five Guys / The Mash House"
  dates    the whole span, earliest start to latest end
  bullets  one sentence covering them together, or none at all if they say
           nothing this employer would care about
Four separate hospitality and trade entries is how a one-page CV becomes a
two-page CV. Never drop a job to save room - merge it.

ONE SENTENCE PER JOB. Exactly one - not two, not a short list. One item in
the bullets array for each role. This is the hardest instruction here and the
one most worth getting right: a CV that says one true, specific thing per job
is read, and a CV that says four is skimmed.

That sentence: 20 to 30 words, starts with a verb (present tense for a
current role, past for the rest), leads with the OUTCOME this employer cares
about rather than the duty, and keeps every real number exactly as given.

Choose what to say by what this advert asks for. Everything else about the
job, however good, is left out.
</work_experience>

<featured_projects>
EXACTLY 2. Not three. The two that would most impress THIS employer - the
closest match to what they are hiring for, or the most impressive if nothing
matches closely. Best first.

THE TITLE DESCRIBES THE SYSTEM, NEVER THE CLIENT. Write it yourself, from
what the thing actually does, in 3 to 6 words. Do not reuse the name stored
against the project - that name is the candidate's private label for it and
frequently contains the client's company name.

  "Grove Bedding Operations Engine"  ->  "PDF Router & Order Processing Engine"
  "Cekra Dispatch Platform"          ->  "Dispatch & Booking Engine"

No company, client, brand or product name belongs in that title, from any
source, ever. If you cannot describe the system without naming someone, you
have not understood it well enough to feature it.

Then one plain sentence, 20 to 30 words: what the system does, and what
changed because it exists. Plain words over jargon - "reads incoming orders
and files them automatically" beats "orchestrates document ingestion
workflows". The tech line lists only tools genuinely used on that project.

CLIENT NAMES ARE CONFIDENTIAL. Never print the name of a client, customer or
end company anywhere in a project name, description or tech line, even when
the candidate's own notes include it. Replace it with a description of the
sector and size: "a trade e-commerce client", "a logistics operator", "a
construction firm". The candidate's own employers are named normally under
Work Experience; this rule covers the companies they built things FOR.
Strip any name in brackets from a project title: "Order Router (Acme Ltd)"
becomes "Order Router".
</featured_projects>

<cover_note>
120 to 180 words, first person, British English. No greeting line, no sign-off:
those are added around it.

This is the piece most likely to be spotted as machine-written, because almost
every cover note ever generated opens the same way and ends the same way. It is
also the only place the candidate gets to sound like himself. Treat the rules in
<sounding_human> as binding here above everywhere else.

SHAPE. Three moves, not three tidy paragraphs of equal length:

  OPEN on the specific thing in THIS advert he can already do, and name it in
  the first sentence. Not "I am writing to apply for", not "I was excited to
  see", not "With over four years of experience". Those three openings account
  for most cover notes ever sent and none of them says anything. Start where a
  person would start if they were telling a friend why this job is worth the
  effort: "You are after someone who can wire n8n into a CRM without breaking
  it. That is most of what I have done for the last four years."

  MIDDLE, one concrete thing he built: what the system does, what changed
  because it exists, and what it cost him to get right. One system, in detail,
  beats three in summary - detail is what a machine cannot fake and what an
  interviewer will ask about. Where a SHIPPED EVIDENCE block is present, pick
  the project it names against this advert's heaviest requirement.

  CLOSE on what he wants to do for them. One or two sentences, specific to this
  employer. No "I would welcome the opportunity to discuss", no "I look forward
  to hearing from you", no summarising what he has just said.

RHYTHM. Vary sentence length deliberately, because uniform 15-to-25-word
sentences are the single most reliable tell that a model wrote the text.
Include at least one sentence under eight words. Let at least one run long
enough to need its clauses. Never open two consecutive sentences with the same
word or the same part of speech.

HONESTY. Where the advert asks for something he has not used, either say so
plainly in half a sentence and say what he would bring instead, or leave it
alone entirely. Do not hedge toward it. A cover note that admits one gap reads
as written by a person; one that answers every requirement reads as generated.
</cover_note>

<screening_answers>
If the advert lists screening questions, answer those. If it lists none, write
the three most likely for this role - notice period, salary expectation, right
to work are the usual three - and answer them from the candidate's history.

Never invent a salary figure or a notice period that is not supported. Answer
those in terms the candidate can stand behind: what he is available for, and
what he would want to discuss.

40 to 90 words each, first person, ready to paste into a form.
</screening_answers>

</what_you_write>

<sounding_human>
Every rule below has cost real candidates real interviews, which is why each one
comes with its reason. Apply them to the cover note first, the summary second,
and everything else third.

1. NO SIGNIFICANCE INFLATION. Never write that something "serves as", "stands
   as", "is a testament to", "underscores", "highlights", "plays a pivotal
   role", "marks a shift" or "reflects a broader" anything. These are how a
   model pads a sentence it has nothing to put in. Delete the inflation and put
   a fact in its place.

2. USE "IS". Do not rotate through "serves as", "functions as", "represents",
   "stands as", "boasts", "features" to avoid repeating the verb. A reader
   notices the rotation long before they notice the repetition.

3. NO PARTICIPLE TAILS. Never end a sentence with ", highlighting my ability
   to...", ", showcasing...", ", demonstrating...", ", underscoring...",
   ", reflecting...", ", contributing to...". They add no information and they
   are the most recognisable machine tic there is. If the point is worth making,
   make it in its own sentence with a fact attached.

4. NO STOCK CONNECTORS. Moreover, Furthermore, Additionally, In conclusion,
   That being said, When it comes to. Start the next thought instead, or use
   the real logical link: because, so, but, and.

5. NO NEGATIVE PARALLELISM as a crutch. "It is not just about X, it is about Y"
   and "Not only... but also" are fine once in a piece and unmistakable at
   three.

6. NO PADDED TRIPLES. Three items only when the third earns its place. "Fast,
   reliable, and robust" is two words and a filler.

7. NO HEDGING. "It is important to note", "It is worth mentioning", "While
   there are certainly challenges", "To be fair", "arguably", "potentially".
   Say the thing. Someone who knows their subject does not need a run-up.

8. NO VAGUE AUTHORITY. Never write "industry reports show", "experts agree" or
   "studies suggest". Name the thing that happened, or leave it out.

9. NO CHATBOT RESIDUE. No "I hope this helps", no "Great question", no "Let me
   know if", no "Certainly". None of it belongs in a document.

10. NO TIDY BOW. Do not end on "the future looks bright", "exciting times
    ahead", or a sentence that restates what was just said. End on a fact or a
    specific ask, and then stop.

11. NO EM DASHES. Use a comma, a full stop, or restructure. Em dash density is
    now one of the first things a reader checks.

12. NO EMOJI, no bold inside a sentence for emphasis, no scare quotes around a
    word to signal cleverness.

13. VARY THE RHYTHM. If four sentences in a row are the same length, one of them
    is wrong. Short sentences are allowed. Fragments are allowed in the cover
    note. Perfectly even cadence is what a model produces when it has nothing
    particular to say.
</sounding_human>

<voice>
British English throughout. Confident, plain and specific.

Banned words everywhere: passionate, dynamic, synergy, leverage, spearheaded,
results-driven, team player, detail-oriented, thought leader, seamless,
cutting-edge, robust, delve, landscape (as a metaphor), tapestry, realm,
myriad, plethora, multifaceted, groundbreaking, revolutionise, ecosystem (as a
metaphor), streamline, harness, navigate (as a metaphor), transformative,
holistic, best-in-class.

No exclamation marks. Short sentences beat long ones, except where a long one
is doing real work.
</voice>

<never>
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
4. SPECIFICS. Prefer the concrete to the abstract every time. "Cut quoting time
   from three hours to eight minutes" beats "improved efficiency". If no number
   exists, name the concrete thing built or changed instead of reaching for a
   vague intensifier.
5. LENGTH. The CV must fit ONE side of A4. There is no shrinking to make it
   fit, so staying inside this budget is your job, not the layout's:

     Summary          80-120 words, 3-4 sentences
     Jobs             the 2 most recent in full; ALL older ones merged into
                      one "Earlier Roles" entry
     Per job          EXACTLY ONE sentence, 20-30 words
     Projects         EXACTLY 2, one sentence of 20-30 words each
     Tools            EXACTLY 4
     Human skills     EXACTLY 4
     Cover note       120-180 words

   That comes to roughly 230-300 words of tailored CV content, plus the cover
   note, which is a separate page. If you are over, CUT rather than compress:
   drop the weakest thing entirely instead of squeezing more onto the same
   lines. A shorter CV that fits beats a complete one that spills onto a second
   page.

   The counts above are limits, not targets to reach. Two strong projects beat
   two strong ones plus a filler third, and there is no credit for using the
   whole allowance.
6. NO META. Never mention the advert, this instruction, the tailoring process,
   or yourself. Never write "as requested" or "based on the job description".
   The reader must see a CV, not the output of a tool.
</never>

<self_check>
Before you return anything, re-read the cover note and the summary once, as a
reader who is deciding whether a human wrote them. Check each of these, and
rewrite anything that fails rather than returning it with a note:

- Does the cover note open on something specific to this advert, rather than on
  the candidate or on the act of applying?
- Is there at least one sentence under eight words, and one noticeably longer?
- Any em dash, any banned word, any participle tail, any stock connector?
- Does any sentence restate the sentence before it?
- Would the summary still be true if it were moved onto a stranger's CV? If yes,
  it says nothing and needs a fact putting in it.
- Are the word counts inside the budget above?

Fix what fails. Then return the JSON, and nothing else.
</self_check>`;

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

export /**
 * Strips forbidden names from a multi-line block.
 *
 * `redact()` collapses runs of whitespace, which is right for a single field
 * and catastrophic for a block — \s matches newlines, so one call would flatten
 * the whole CV onto one line. Hence line by line, with the indentation put back.
 */
function redactBlock(text: string, names: string[]): string {
  if (names.length === 0) return text;

  return text
    .split("\n")
    .map((line) => {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const cleaned = redact(line, names);
      return cleaned ? indent + cleaned : line.trim() ? indent : line;
    })
    .join("\n");
}

/**
 * Facts about availability that no advert supplies and no CV field holds.
 *
 * Deliberately short, and deliberately only things that are TRUE and that the
 * candidate alone can assert. Notice period and where he is willing to work are
 * exactly that. Skills are NOT — they belong in cv_profile, where the CV can
 * back them up, and smuggling one in here would be inventing a claim through a
 * side door rather than in the open. That is worse, not better.
 *
 * Override with CV_CANDIDATE_CONTEXT; set it empty to omit the block.
 */
function candidateContext(): string[] {
  const custom = process.env.CV_CANDIDATE_CONTEXT?.trim();
  if (custom === "") return [];

  const facts =
    custom ??
    "Available immediately, no notice period to serve. " +
      "Based in Edinburgh and open to hybrid or UK-wide remote work.";

  return ["=== CANDIDATE AVAILABILITY ===", facts, ""];
}

/**
 * What this advert asks for that the candidate has actually shipped, and where.
 *
 * The match has already been worked out against cv_projects.tech — see
 * lib/job-match.ts — so the model does not have to infer from a tools list
 * which capabilities are real. Naming the project turns "I have used n8n" into
 * "I built a lead pipeline on n8n", which is the difference between a cover
 * note that reads as generated and one that reads as remembered.
 *
 * The not-used list is here for the opposite reason: a model given only the
 * strengths will reach for the gaps anyway. Stated plainly, they stay out.
 */
function evidenceBlock(match: JobMatch | null, cv: MasterCv): string[] {
  if (!match) return [];

  const lines: string[] = [];

  const shipped = match.matched.filter((entry) => entry.proven).slice(0, 8);
  if (shipped.length) {
    lines.push(
      "=== SHIPPED EVIDENCE: what this advert asks for and he has actually built ===",
      ...shipped.map((entry) => `${entry.id} - built on ${entry.via}`),
      ""
    );
  }

  const listed = match.matched.filter((entry) => !entry.proven).slice(0, 6);
  if (listed.length) {
    lines.push(
      "=== ALSO COVERED, from his skills and tools rather than a named project ===",
      listed.map((entry) => entry.id).join(", "),
      ""
    );
  }

  if (match.missing.length) {
    lines.push(
      "=== ASKED FOR AND NEVER USED: never claim any of these ===",
      match.missing.slice(0, 8).map((entry) => entry.id).join(", "),
      ""
    );
  }

  // Project names reach the model through the same scrubber as everything
  // else: a stored project title routinely carries the client's name.
  return lines.length ? redactBlock(lines.join("\n"), forbiddenNames(cv)).split("\n") : [];
}

export function buildPrompt(
  jobDescription: string,
  cv: MasterCv,
  match: JobMatch | null = null
): string {
  // The candidate's own notes are scrubbed BEFORE the model sees them. Telling
  // it not to print a client name is a request; not showing it the name in the
  // first place is not. This is what closes the gap that let a client's name
  // reach a finished CV: it was sitting in the project title all along.
  const cvText = redactBlock(formatCvForPrompt(cv), forbiddenNames(cv));

  return [
    ...forbiddenNamesBlock(cv),
    ...candidateContext(),
    "=== CANDIDATE MASTER CV ===",
    cvText,
    "",
    ...evidenceBlock(match, cv),
    "=== JOB ADVERT ===",
    jobDescription.trim(),
    "",
    "Write the tailored application for this advert, following the schema.",
    "Lead on the shipped evidence above. Claim nothing from the never-used list.",
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
 * n8n and Make.com are two names for the same skill. Listed together on a CV
 * for an engineering role they read as a no-code generalist rather than someone
 * who builds things — which is Dean's own reason for the rule.
 *
 * The exception is a job that IS about low-code platforms, where breadth across
 * both is exactly what is being hired.
 *
 * The prompt says all this too. This is here because a prompt is a request, and
 * because the tie-break needs the advert, which only this layer can see.
 */
const OVERLAPPING_TOOLS = ["n8n", "make.com"];

const LOW_CODE_SIGNALS =
  /\b(no[- ]?code|low[- ]?code|citizen developer|nocode|lowcode)\b/i;

export function dropOverlappingTools(tools: string[], jobDescription: string): string[] {
  const present = OVERLAPPING_TOOLS.filter((name) =>
    tools.some((tool) => tool.trim().toLowerCase() === name)
  );
  if (present.length < 2) return tools;

  // A low-code role wants both. Everyone else gets one.
  if (LOW_CODE_SIGNALS.test(jobDescription)) return tools;

  const advert = jobDescription.toLowerCase();
  const named = OVERLAPPING_TOOLS.filter((name) => advert.includes(name));

  // Keep whichever the advert asked for. If it named neither, keep n8n: it is
  // the self-hosted, more technical of the two, so it is the safer signal when
  // there is nothing to go on.
  const keep = named.length === 1 ? named[0] : "n8n";

  return tools.filter((tool) => {
    const lower = tool.trim().toLowerCase();
    return !OVERLAPPING_TOOLS.includes(lower) || lower === keep;
  });
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
    skills_selected: application.skills_selected.map(r),
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
  cv: MasterCv,
  /** The advert's match against the CV, when the caller has one to hand. */
  match: JobMatch | null = null
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
    contents: buildPrompt(jobDescription, cv, match),
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
      skills_matched: dropOverlappingTools(
        parsed.skills_matched ?? [],
        jobDescription
      ),
      skills_selected: parsed.skills_selected ?? [],
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
