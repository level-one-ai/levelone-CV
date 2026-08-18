/**
 * Dean's CV content.
 *
 * This is the master copy of everything that goes on the CV. Edit it here and
 * run `npm run seed:cv -- --force` to push the changes into PocketBase, or
 * edit it directly in the PocketBase admin page — whichever you prefer.
 *
 * Three rules the whole system depends on:
 *
 *   1. Everything here must be TRUE. Gemini is forbidden from inventing
 *      employers, dates, tools or numbers, so the only facts that can ever
 *      appear on your CV are the ones written below.
 *   2. Write MORE than you need. Gemini picks what fits each advert. It can
 *      cut, re-order and reword — it cannot add what you never told it.
 *   3. NEVER type a client's company name. You cannot leak a name that was
 *      never here. Describe them by sector instead: "a trade e-commerce
 *      client", "a logistics operator". Belt and braces: also list them in
 *      CV_REDACT_NAMES in .env.local.
 */

export const PROFILE = {
  full_name: "Dean Finlayson",
  headline: "AI Automation Engineer",

  // A CV a recruiter cannot reply to is a dead CV. Both of these must stay.
  email: "dean@levelone.digital",
  phone: "07360 076374",
  location: "Edinburgh, Scotland",

  // TODO(dean): replace both with your real profile addresses before you send
  // this CV anywhere. These are placeholders — I do not know your usernames,
  // and a wrong link on a CV is worse than no link.
  links: {
    LinkedIn: "https://linkedin.com/in/YOUR-LINKEDIN-USERNAME",
    GitHub: "https://github.com/YOUR-GITHUB-USERNAME",
  },

  master_summary:
    "Automation engineer and founder with four years building production AI " +
    "systems for small businesses. Runs Level One, delivering custom CRMs, " +
    "lead generation pipelines, document routing and internal dashboards that " +
    "replace manual admin work. Works end to end, scoping the problem with the " +
    "client, building the system, and running it in production afterwards. " +
    "Background in civil engineering and building surveying, which is where " +
    "the habit of working to a spec and checking the details came from.",

  // Human skills. Printed on the CV exactly as written — Gemini never
  // re-orders or trims these, which is why the count matters.
  //
  // KEEP THIS TO 6. Each one is a ruled row in the sidebar, and this is fixed
  // content the AI cannot shorten to make room. Nine of them pushed the CV
  // onto a second page on its own. Pick the six that say most about you.
  skills: [
    "Problem-Solving",
    "Client Communication",
    "Systems Thinking",
    "Project Management",
    "Process Improvement",
    "Adaptability",
  ].join(", "),

  // Tools and platforms. This IS re-ordered per advert, so the ones a job
  // names by title appear first. Add anything you genuinely use.
  tools: [
    "n8n",
    "Make.com",
    "Custom Webhooks",
    "REST APIs",
    "Claude Code",
    "Cursor",
    "GitHub Copilot",
    "Claude API",
    "ChatGPT API",
    "TypeScript",
    "Next.js",
    "React",
    "Docker",
    "Coolify",
    "Vercel",
    "VPS / Linux",
    "PostgreSQL",
    "PocketBase",
    "Firebase",
    "Stripe",
    "GoCardless",
  ].join(", "),

  // One qualification per line: Title | School | Dates.
  // Lines starting with "-" are details of the entry above them.
  //
  // No dates: you have not given me any, and I will not invent dates that go
  // on a job application. Add them as a third part when you have them, e.g.
  //   BEng (Hons) Civil Engineering | Heriot-Watt University | 2019 - 2022
  education: [
    "BEng (Hons) Civil Engineering | Heriot-Watt University",
    "HND Civil Engineering & Architecture | Granton College",
    "Secondary Education | Boroughmuir High School",
  ].join("\n"),
};

export const EXPERIENCE = [
  {
    company: "Level One",
    role: "Founder & AI Automation Engineer",
    start_date: "2022",
    end_date: "Present",
    location: "Edinburgh, Scotland",
    order: 1,
    // TODO(dean): these describe WHAT you built, which is the hard half. The
    // half that gets interviews is WHAT CHANGED — hours saved per week, jobs
    // handled per month, how many clients, revenue. Add real numbers here and
    // they will appear on every CV from then on. Gemini cannot add them for
    // you: it is banned from inventing figures.
    bullets: [
      "Founded and run an automation agency building custom internal systems for small businesses, from first client conversation through to running the system in production",
      "Built a custom CRM and estimating tool that issues service agreement contracts and stores digital signatures against the job record",
      "Built a lead generation pipeline that scrapes prospects, qualifies them against the client's ideal customer profile, verifies emails and automates follow-up",
      "Built a document routing dashboard that reads incoming scanned orders, renames them to the client's convention and moves them between cloud drives",
      "Deploy and maintain self-hosted automation infrastructure on Docker and Coolify across client environments",
      "Work directly with non-technical business owners to scope what a system needs to do, then deliver and support it as a one-person team",
    ],
  },
  {
    company: "Various",
    role: "Earlier roles",
    start_date: "2013",
    end_date: "2019",
    location: "Edinburgh, Scotland",
    order: 2,
    bullets: [
      "Track Manager, Xtreme Karting (2017 - 2019): ran shifts, staff allocation and customer safety on a live venue floor",
      "Bar Staff, The Mash House (2015 - 2016)",
      "Kitchen Staff, Five Guys (2014 - 2015)",
      "Painter and Decorator, Finlayson Decorators (2013 - 2014)",
    ],
  },
];

// NOTE: every client name has been removed on purpose. Describe the client by
// sector and size, never by name.
//
// `client_name` is the one place a real client name belongs. It is NEVER
// printed on the CV. Filling it in is what hides the name: it is listed to the
// model as forbidden before it writes a word, and stripped from the generated
// text in code afterwards, so neither a bad day from the model nor a slip in
// your own wording can leak it. Leave it empty and you simply get no extra
// protection for that project.
export const PROJECTS = [
  {
    name: "Operations Command Centre & Document Router",
    role: "Designed and built",
    description:
      "Automation system and inventory API integration for a trade supplier, routing order paperwork and triggering local label printing automatically.",
    tech: ["n8n", "REST APIs", "Custom Webhooks", "TypeScript", "PocketBase"],
    outcome:
      "Removed a daily manual filing and labelling step from the order process",
    link: "",
    // TODO(dean): the real client name, if this one had a client.
    client_name: "",
    order: 1,
  },
  {
    name: "Automated File Management Pipeline",
    role: "Designed and built",
    description:
      "File workflows for a construction firm that classify, update and move project documentation across cloud storage with no manual filing.",
    tech: ["n8n", "REST APIs", "Custom Webhooks", "Docker"],
    outcome:
      "Fitted the client's existing workflow rather than forcing them to change it",
    link: "",
    // TODO(dean): the real client name, if this one had a client.
    client_name: "",
    order: 2,
  },
  {
    name: "Client CRM & Estimating System",
    role: "Designed and built",
    description:
      "Centralised client database for a trade company with automated email triggers, enquiry routing and contracts carrying a stored digital signature.",
    tech: ["n8n", "PocketBase", "REST APIs", "Custom Webhooks"],
    outcome:
      "Replaced manual quoting and paper contracts with one system the office runs day to day",
    link: "",
    // TODO(dean): the real client name, if this one had a client.
    client_name: "",
    order: 3,
  },
  {
    name: "Lead Scraping & Outreach Pipeline",
    role: "Designed and built",
    description:
      "Prospecting system that scrapes leads, scores them against an ideal customer profile, verifies emails and automates personalised follow-up.",
    tech: ["n8n", "Claude API", "REST APIs", "PostgreSQL"],
    outcome:
      "Turned manual prospecting into a pipeline that hands over qualified, contactable leads",
    link: "",
    // TODO(dean): the real client name, if this one had a client.
    client_name: "",
    order: 4,
  },
  {
    name: "Trade E-Commerce & Inventory Integration",
    role: "Designed and built",
    description:
      "Web platform for a trade e-commerce client, integrating catalogue data with automated back-office management channels.",
    tech: ["Next.js", "TypeScript", "REST APIs", "Docker"],
    outcome: "Connected the shopfront to back-office stock without manual re-entry",
    link: "",
    // TODO(dean): the real client name, if this one had a client.
    client_name: "",
    order: 5,
  },
];
