/**
 * Offline check on the filter and the match score.
 *
 * Everything in lib/job-filter.ts and lib/job-match.ts is a pure function over
 * strings, which is the whole reason to keep it that way: the weights can be
 * tuned against real adverts without a scrape, a database or an API key.
 *
 *   npx tsx scripts/check-matching.ts
 *
 * The fixtures below are the cases the rules exist for. If one of them starts
 * behaving differently, that is a rule change and it should be a deliberate
 * one. Exits non-zero when an expectation fails.
 */

import { buildCapabilityProfile } from "../lib/capabilities";
import { filterJob } from "../lib/job-filter";
import { matchJob } from "../lib/job-match";
import type { MasterCv } from "../lib/types";
// The seed content, so the check runs against the CV that is actually shipped.
import { EXPERIENCE, PROFILE, PROJECTS } from "./cv-content.mjs";

const split = (value: unknown) =>
  String(value ?? "")
    .split(/\s*,\s*/)
    .filter(Boolean);

const cv: MasterCv = {
  profile: {
    id: "seed",
    full_name: PROFILE.full_name,
    headline: PROFILE.headline,
    email: "",
    phone: "",
    location: PROFILE.location,
    links: {},
    master_summary: PROFILE.master_summary,
    skills: split(PROFILE.skills),
    tools: split(PROFILE.tools),
    education: PROFILE.education ?? "",
    photo: "",
  },
  skills: split(PROFILE.skills),
  experience: EXPERIENCE.map((job: Record<string, unknown>, i: number) => ({
    id: String(i),
    company: String(job.company ?? ""),
    role: String(job.role ?? ""),
    start_date: String(job.start_date ?? ""),
    end_date: String(job.end_date ?? ""),
    location: String(job.location ?? ""),
    bullets: (job.bullets as string[]) ?? [],
    order: i,
  })),
  projects: PROJECTS.map((project: Record<string, unknown>, i: number) => ({
    id: String(i),
    name: String(project.name ?? ""),
    role: String(project.role ?? ""),
    description: String(project.description ?? ""),
    tech: split(project.tech),
    outcome: String(project.outcome ?? ""),
    link: "",
    order: i,
    client_name: String(project.client_name ?? ""),
  })),
};

const profile = buildCapabilityProfile(cv);

interface Fixture {
  name: string;
  title: string;
  body: string;
  /** "filtered", or a [min, max] the score must land inside. */
  expect: "filtered" | [number, number];
}

const FIXTURES: Fixture[] = [
  {
    name: "automation role he can evidence",
    title: "Automation Engineer",
    expect: [80, 100],
    body: `We are hiring an Automation Engineer in Edinburgh.
Essential:
- Strong n8n or Make.com experience building production workflows
- REST APIs and webhooks, integrating third-party SaaS
- TypeScript, Docker, Postgres
- Client-facing: you will run scoping sessions with stakeholders
You will own automation projects end to end in a small team. Startup pace.`,
  },
  {
    name: "deep ML role he cannot",
    title: "AI Engineer",
    expect: [0, 39],
    body: `AI Engineer, London (hybrid, 3 days on-site).
Essential requirements:
- Python, FastAPI, strong software engineering
- LangGraph and LangChain, production RAG pipelines
- Vector databases (Pinecone or pgvector), embeddings
- AWS Bedrock, Kubernetes
- MSc in Computer Science required
- 10+ years experience`,
  },
  {
    name: "banned stack",
    title: "Integration Engineer",
    expect: "filtered",
    body: "Integration Engineer working with C# and .NET across our API estate. Python a plus.",
  },
  {
    name: "construction PM that mentions an API",
    title: "Construction Project Manager",
    expect: "filtered",
    body: "Managing site delivery. Some use of our internal API-driven reporting software.",
  },
  {
    name: "guarded title, construction body",
    title: "Solutions Architect",
    expect: "filtered",
    body: "Solutions Architect for our building services division. Design mechanical layouts. API of works to be agreed.",
  },
  {
    name: "guarded title, software body",
    title: "Solutions Architect",
    expect: [65, 95],
    body: `Solutions Architect for our SaaS platform. You will design LLM-backed
integrations, work with REST APIs and n8n, and run presales discovery with
clients. Python useful.`,
  },
  {
    name: "prompt engineering role",
    title: "Prompt Engineer",
    expect: [55, 85],
    body: `Remote (UK). Prompt Engineer / LLM Operations.
What you'll need:
- Hands-on prompt engineering with LLM APIs (OpenAI, Anthropic)
- Structured outputs and function calling
- Building agentic workflows and evaluating them
- Python or TypeScript
No degree required, we hire on portfolio.`,
  },
  {
    name: "no-code implementation consultant",
    title: "AI Implementation Consultant",
    expect: [80, 100],
    body: `AI Implementation Consultant, remote UK, contract inside IR35.
You will audit client operations, scope automation opportunities and build them.
Requirements: n8n or Zapier, no-code and low-code tooling, REST API integration,
client-facing consultancy, end to end delivery. Equivalent experience welcome.`,
  },
];

let failures = 0;

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "  ok  " : " FAIL "} ${message}`);
  if (!condition) failures++;
}

console.log("Capability index built from cv_profile, cv_experience and cv_projects\n");
check(profile.capabilities.get("n8n")?.proven === true, "n8n is proven by a project, not just listed");
check(
  (profile.capabilities.get("n8n")?.sources.length ?? 0) >= 4,
  "n8n carries several project sources (the asSkillList comma fix)"
);
check(!profile.capabilities.has("python"), "python is absent, because it is not on the CV");
check(!profile.capabilities.has("langchain"), "langchain is absent, for the same reason");

console.log("\nAdverts\n");
for (const fixture of FIXTURES) {
  const verdict = filterJob({ title: fixture.title, description: fixture.body });

  if (fixture.expect === "filtered") {
    check(!verdict.keep, `${fixture.name}: rejected (${verdict.reason || "kept, and should not be"})`);
    continue;
  }

  if (!verdict.keep) {
    check(false, `${fixture.name}: filtered out (${verdict.reason}) but should have been scored`);
    continue;
  }

  const match = matchJob(`${fixture.title}\n${fixture.body}`, profile);
  const [min, max] = fixture.expect;
  check(
    match.score >= min && match.score <= max,
    `${fixture.name}: ${match.score}% (wanted ${min}-${max})` +
      ` have=[${match.matched.slice(0, 4).map((m) => m.id).join(", ")}]` +
      ` missing=[${match.missing.slice(0, 3).map((m) => m.id).join(", ")}]`
  );
}

console.log(failures ? `\n${failures} failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
