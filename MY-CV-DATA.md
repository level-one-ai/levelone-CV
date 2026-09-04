# What to type into each collection

Your actual CV content, ready to copy into PocketBase.

**Or skip all the typing.** This exact content is already in
`scripts/cv-content.mjs`, so one command loads it:

```bash
npm run seed:cv
```

Add `-- --force` if your CV is already filled in and you want to replace it.

---

## Before anything else — two things only you can fix

**1. Your links are placeholders.** They currently read
`YOUR-LINKEDIN-USERNAME` and `YOUR-GITHUB-USERNAME`. I do not know your
handles, and a broken link on a CV is worse than no link.

**2. Upload your photo.** PocketBase admin → `cv_profile` → your record →
`photo`. Square picture, under 5MB. It prints in black and white.

---

## 1. `cv_profile` — one record

| Field | What to type |
| --- | --- |
| `full_name` | `Dean Finlayson` |
| `headline` | `AI Automation Engineer` |
| `email` | `dean@levelone.digital` |
| `phone` | `07360 076374` |
| `location` | `Edinburgh, Scotland` |

### `links` (JSON)

```json
{
  "LinkedIn": "https://linkedin.com/in/YOUR-LINKEDIN-USERNAME",
  "GitHub": "https://github.com/YOUR-GITHUB-USERNAME"
}
```

Replace both before you send this anywhere.

### `master_summary`

```
Automation engineer and founder with four years building production AI systems for small businesses. Runs Level One, delivering custom CRMs, lead generation pipelines, document routing and internal dashboards that replace manual admin work. Works end to end, scoping the problem with the client, building the system, and running it in production afterwards. Background in civil engineering and building surveying, which is where the habit of working to a spec and checking the details came from.
```

Write this one long. The AI cuts it down to 80-120 words for each advert, but it
can never add something you did not tell it.

### `skills` — keep this to **6**

```
Problem-Solving, Client Communication, Systems Thinking, Project Management, Process Improvement, Adaptability
```

**Six is not a style choice, it is what fits.** Each skill is a ruled row in
the sidebar, and the AI never trims these — they are fixed. Nine of them pushed
the CV onto a second page on their own.

### `tools`

```
n8n, Make.com, Custom Webhooks, REST APIs, Claude Code, Cursor, GitHub Copilot, Claude API, ChatGPT API, TypeScript, Next.js, React, Docker, Coolify, Vercel, VPS / Linux, PostgreSQL, PocketBase, Firebase, Stripe, GoCardless
```

List everything you genuinely use. This one is safe to make long — the AI picks
the 4 that match each advert and drops the rest, so a longer list just gives
it more to match on. This is also the part applicant tracking software reads.

### `education`

```
BEng (Hons) Civil Engineering | Heriot-Watt University
HND Civil Engineering & Architecture | Granton College
Secondary Education | Boroughmuir High School
```

> **Check this one.** You first told me the BEng was at Granton College, then
> your system's output said Heriot-Watt. I have used Heriot-Watt because a BEng
> is a university degree, but you know which is right and this is the kind of
> detail an employer verifies.

No dates, because you have not given me any and I will not invent dates for a
job application. Add them as a third part when you have them:
`BEng (Hons) Civil Engineering | Heriot-Watt University | 2019 - 2022`

---

## 2. `cv_experience` — two records

### Record 1

| Field | Value |
| --- | --- |
| `company` | `Level One` |
| `role` | `Founder & AI Automation Engineer` |
| `start_date` | `2022` |
| `end_date` | `Present` |
| `location` | `Edinburgh, Scotland` |
| `order` | `1` |

`bullets` (JSON):

```json
[
  "Founded and run an automation agency building custom internal systems for small businesses, from first client conversation through to running the system in production",
  "Built a custom CRM and estimating tool that issues service agreement contracts and stores digital signatures against the job record",
  "Built a lead generation pipeline that scrapes prospects, qualifies them against the client's ideal customer profile, verifies emails and automates follow-up",
  "Built a document routing dashboard that reads incoming scanned orders, renames them to the client's convention and moves them between cloud drives",
  "Deploy and maintain self-hosted automation infrastructure on Docker and Coolify across client environments",
  "Work directly with non-technical business owners to scope what a system needs to do, then deliver and support it as a one-person team"
]
```

Six bullets here, and the AI picks the best four for each advert. Write more
than you need.

> **The one thing that would improve this CV most: numbers.** Hours saved per
> week, jobs processed per month, how many clients, revenue. Every bullet
> currently says what you built, none says what changed. The AI is banned from
> inventing figures, so the only numbers that can ever appear are ones you type
> here.

### Record 2

| Field | Value |
| --- | --- |
| `company` | `Various` |
| `role` | `Earlier roles` |
| `start_date` | `2013` |
| `end_date` | `2019` |
| `location` | `Edinburgh, Scotland` |
| `order` | `2` |

`bullets` (JSON):

```json
[
  "Track Manager, Xtreme Karting (2017 - 2019): ran shifts, staff allocation and customer safety on a live venue floor",
  "Bar Staff, The Mash House (2015 - 2016)",
  "Kitchen Staff, Five Guys (2014 - 2015)",
  "Painter and Decorator, Finlayson Decorators (2013 - 2014)"
]
```

---

## 3. `cv_projects` — five records

**Every client name has been removed on purpose.** You told me your client work
is under contract. Describe the client by sector, never by name — you cannot
leak a name that was never typed in.

| # | `name` | `tech` (JSON) | `order` |
| --- | --- | --- | --- |
| 1 | `Operations Command Centre & Document Router` | `["n8n", "REST APIs", "Custom Webhooks", "TypeScript", "PocketBase"]` | `1` |
| 2 | `Automated File Management Pipeline` | `["n8n", "REST APIs", "Custom Webhooks", "Docker"]` | `2` |
| 3 | `Client CRM & Estimating System` | `["n8n", "PocketBase", "REST APIs", "Custom Webhooks"]` | `3` |
| 4 | `Lead Scraping & Outreach Pipeline` | `["n8n", "Claude API", "REST APIs", "PostgreSQL"]` | `4` |
| 5 | `Trade E-Commerce & Inventory Integration` | `["Next.js", "TypeScript", "REST APIs", "Docker"]` | `5` |

`description` for each:

1. `Automation system and inventory API integration for a trade supplier, routing order paperwork and triggering local label printing automatically.`
2. `File workflows for a construction firm that classify, update and move project documentation across cloud storage with no manual filing.`
3. `Centralised client database for a trade company with automated email triggers, enquiry routing and contracts carrying a stored digital signature.`
4. `Prospecting system that scrapes leads, scores them against an ideal customer profile, verifies emails and automates personalised follow-up.`
5. `Web platform for a trade e-commerce client, integrating catalogue data with automated back-office management channels.`

`role` is `Designed and built` on all five. `link` stays empty.

**`client_name`:** put the real client's name in this field on each row — the
one you are under contract not to publish. It is never printed on your CV. It
is there so the system knows which name to keep out: the AI is given the list
as forbidden before it writes, and the finished text is scrubbed of those names
in code afterwards. I have left it empty in `scripts/cv-content.mjs`, because I
should not be the one typing your clients' names into a file.

Five projects, and the AI features the best three for each advert.

### Names that are not tied to one project

`client_name` covers your projects. For a company that only comes up elsewhere
— in a work-experience bullet, say — add it to `.env.local`:

```
CV_REDACT_NAMES=Grove Group, The Garage Conversion Co., Trader Brothers, Cekra
```

Both lists are handled the same way: stripped from the finished CV in code,
whatever the AI writes. The prompt forbids client names as well, but a prompt
is a request and your NDA is not.

---

## 4. `cv_template` — nothing to do

Filled in for you when you run `npm run setup:pocketbase`.

## 5. `applications` — nothing to do

The app writes a row here every time you generate a CV.

---

## Why this fits on one page

The layout does not shrink text to force a fit, so the content has to be the
right size. Measured, not guessed:

| Section | Budget |
| --- | --- |
| Profile summary | 80-120 words, 3-4 sentences |
| Skills | 6 |
| Tools shown | 4 (from your longer list) |
| Jobs | 2 most recent in full, all older ones merged into "Earlier Roles" |
| Bullets | exactly 1 per job |
| Bullet length | 20-30 words |
| Projects shown | 2 (from your five) |
| Project description | 20-30 words |
| Cover note | 120-180 words |

The AI is told these limits and cuts rather than compresses. If a CV ever does
run to two pages, the app logs a warning naming what to trim — it will not
silently cut anything off the bottom.
