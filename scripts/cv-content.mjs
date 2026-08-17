/**
 * Dean's CV content.
 *
 * This is the master copy of everything that goes on the CV. Edit it here and
 * run `npm run seed:cv -- --force` to push the changes into PocketBase, or
 * edit it directly in the PocketBase admin page — whichever you prefer.
 *
 * Two rules the whole system depends on:
 *
 *   1. Everything here must be TRUE. Gemini is forbidden from inventing
 *      employers, dates, tools or numbers, so the only facts that can ever
 *      appear on your CV are the ones written below.
 *   2. Write MORE than you need. Gemini picks what fits each advert. It can
 *      cut, re-order and reword — it cannot add what you never told it.
 */

export const PROFILE = {
  full_name: "Dean Finlayson",
  headline: "AI Automation Engineer",
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
    "AI automation engineer who designs and ships custom internal systems for " +
    "small businesses. Runs Level One, building CRMs, lead generation " +
    "pipelines and document workflows that replace manual admin work. Works " +
    "end to end, scoping the problem with the client, building the system, " +
    "and running it in production afterwards. Background in civil engineering " +
    "and building surveying, which is where the habit of working to a spec and " +
    "checking the details came from.",

  // Human skills. Printed on the CV exactly as written — Gemini never
  // re-orders these, because they read the same to every employer.
  skills: [
    "Problem-Solving",
    "Client Communication",
    "Systems Thinking",
    "Project Management",
    "Process Improvement",
    "Attention to Detail",
    "Adaptability",
    "Self-Direction",
    "Learning Agility",
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
    "Firebase",
    "Docker",
    "VPS / Linux",
    "PostgreSQL",
    "PocketBase",
    "Stripe",
    "GoCardless",
  ].join(", "),

  // One qualification per line. Parts split by "|" as Title | School | Dates.
  // Lines starting with "-" are details of the entry above them.
  //
  // No dates: you did not give me any, and I will not invent dates that go on
  // a job application. Add them as a third part when you have them, e.g.
  //   BEng (Hons) Civil Engineering | Granton College | 2019 - 2022
  education: [
    "BEng (Hons) Civil Engineering | Granton College",
    "HND Architecture | Granton College",
    "HND Building Surveying | Granton College",
    "Boroughmuir High School | Edinburgh",
    "- Maths: Credit 2, Higher B, Advanced Higher A",
    "- Physics: Credit 2, Higher B, Advanced Higher B",
    "- English: General 3, Higher B, Advanced Higher B",
    "- Graphic Communication: Credit 2, Higher A",
    "- Art: Higher A",
    "- Music: Credit 2, Higher A",
    "- Physical Education: Credit 2, Higher A",
    "- Geography: Credit 2",
    "- Japanese: Credit 2",
    "- French: General 3",
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
      "Founded and run an automation agency building custom internal systems for small businesses, working from first client conversation through to running the system in production",
      "Built a custom CRM and estimating tool for a trade company that also issues service agreement contracts, capturing client details and storing digital signatures against the record",
      "Built a lead generation and outreach system that scrapes prospects, qualifies them against the client's ideal customer profile, verifies email addresses, writes a personalised opening line, and files everything into their CRM with automated follow-up",
      "Built a document routing dashboard that reads incoming scanned orders, renames them to the client's own convention, moves them between OneDrive and Google Drive, and updates the CRM to confirm each file landed",
      "Work directly with non-technical business owners to scope what the system needs to do, then deliver and support it as a one-person team",
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
      "Track Manager, Xtreme Karting (2017 - 2019): ran shifts, staff and customer safety on a live venue floor",
      "Bar Staff, The Mash House (2015 - 2016)",
      "Kitchen Staff, Five Guys (2014 - 2015)",
      "Painter and Decorator, Finlayson Decorators (2013 - 2014)",
    ],
  },
];

export const PROJECTS = [
  {
    name: "Trade CRM & Estimating System",
    role: "Designed and built",
    description:
      "Custom CRM and estimate builder for a local trade company. Generates service agreement contracts pre-filled with client details, and captures and stores a digital signature against the job record.",
    tech: ["n8n", "PocketBase", "Custom Webhooks", "REST APIs"],
    outcome:
      "Replaced manual quoting and paper contracts with one system the office runs day to day",
    link: "",
    order: 1,
  },
  {
    name: "Lead Scraping & Outreach Pipeline",
    role: "Designed and built",
    description:
      "End-to-end prospecting system. Scrapes leads, scores them against the client's ideal customer profile, verifies each email address, generates a personalised icebreaker, and writes the result into their CRM with a status field and automated follow-up.",
    tech: ["n8n", "Claude API", "REST APIs", "PostgreSQL"],
    outcome:
      "Turned a manual prospecting job into a pipeline that runs unattended and hands over qualified, contactable leads",
    link: "",
    order: 2,
  },
  {
    name: "PDF Router & Order Dashboard",
    role: "Designed and built",
    description:
      "Dashboard that processes a client's incoming scanned orders. Reads each file, renames it to their existing convention, moves it from OneDrive into the right Google Drive folder, and updates the CRM to confirm the move.",
    tech: ["n8n", "Docker", "VPS / Linux", "Custom Webhooks"],
    outcome:
      "Removed a daily manual filing step and fitted the client's existing workflow rather than replacing it",
    link: "",
    order: 3,
  },
];
