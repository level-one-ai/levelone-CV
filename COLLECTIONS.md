# Your PocketBase collections

This is every table the app uses, every field inside it, and an example of what
to type in each one.

**You do not have to build these by hand.** One command makes all five:

```bash
npm run setup:pocketbase
```

This page is here so you know what it built, what to type where, and what to
check if something looks wrong.

---

## The five collections at a glance

| Collection | What it holds | Who fills it in |
| --- | --- | --- |
| `cv_profile` | You: name, contact details, summary, skills, education, photo | **You**, one row |
| `cv_experience` | Your jobs | **You**, one row per job |
| `cv_projects` | Your projects | **You**, one row per project |
| `cv_template` | The CV design, as HTML | Filled in automatically |
| `applications` | Every CV the app has made for you | The app |

You only ever type into the first three.

---

## 1. `cv_profile`

**One row only.** This is you.

| Field | Type | Example |
| --- | --- | --- |
| `full_name` | Plain text | `Dean Finlayson` |
| `headline` | Plain text | `AI Automation Engineer` |
| `email` | Plain text | `dean@levelone.digital` |
| `phone` | Plain text | `+44 7700 900123` |
| `location` | Plain text | `Glasgow, United Kingdom` |
| `links` | JSON | see below |
| `master_summary` | Plain text | see below |
| `skills` | Plain text | see below |
| `education` | Plain text | see below |
| `photo` | File | your headshot, a `.jpg` or `.png` |

### `links`

This one is JSON, so the shape matters. Copy this and change the addresses:

```json
{
  "LinkedIn": "https://linkedin.com/in/deanfinlayson",
  "Website": "https://levelone.digital",
  "GitHub": "https://github.com/deanfinlayson"
}
```

Every part needs `"straight quotes"`. Put a comma between the lines, but not
after the last one. If PocketBase turns the box red, a quote or comma is wrong.

These appear in the CONTACT panel of your CV, with the `https://` trimmed off.

### `master_summary`

A paragraph about what you do. **Write it long.** The AI shortens it for each
job, but it can never add things you did not tell it.

> Example:
> `AI automation engineer who builds production systems for service businesses. Ten years across full-stack development, with the last three focused on LLM-powered internal tools. Built and shipped a proposal engine, a booking platform and a CV generator, all end to end. Comfortable owning everything from database schema to the interface people actually use.`

### `skills`

All your skills on **one line**, separated by commas:

```
TypeScript, Next.js, React, Node.js, PocketBase, Gemini API, n8n, Docker, SQL, Tailwind CSS
```

No quotes, no brackets. Spacing does not matter. List 15 to 30 — the AI picks
out the ones each advert asks for and puts those first on the CV.

New lines work too, if you prefer one per line.

### `education`

**One qualification per line.** Three parts, separated by the `|` character:

```
M.Sc. Artificial Intelligence | University of Glasgow | 2018 - 2019
B.Sc. Computer Science | University of Strathclyde | 2014 - 2018
```

The order is **Degree | School | Dates**. This is printed exactly as you type
it — the AI never rewrites your education.

### `photo`

Click the field, click **Upload file**, pick your headshot.

- A square picture works best. It is cropped to a square on the CV.
- It is printed in black and white, to match the design.
- Under 5MB. `.jpg`, `.png` or `.webp`.
- No photo? The CV still works — that panel shows a plain Level One block.

---

## 2. `cv_experience`

**One row per job.**

| Field | Type | Example |
| --- | --- | --- |
| `company` | Plain text | `Level One Digital` |
| `role` | Plain text | `Founder & AI Engineer` |
| `start_date` | Plain text | `Jan 2023` |
| `end_date` | Plain text | `Present` |
| `location` | Plain text | `Glasgow, United Kingdom` |
| `bullets` | JSON | see below |
| `order` | Number | `1` |

**`order`** decides which job comes first. Put `1` on your newest job, `2` on
the one before it, and so on.

**Dates** are printed exactly as you type them, so keep the style the same on
every row.

### `bullets`

A JSON list of the things you actually did:

```json
[
  "Built an AI proposal system that cut quoting time from 3 hours to 8 minutes",
  "Automated lead follow-up for 40+ trade clients using n8n and PocketBase",
  "Grew monthly retainer revenue from £0 to £6k in nine months"
]
```

Square brackets around the whole thing. `"Quotes"` around each line. A comma
after each one except the last.

**Numbers are what get you interviews.** Money saved, hours saved, people
served, percent improved. Put them in — the AI is not allowed to invent any, so
the only numbers on your CV are the ones you write here.

Write more bullets than you need. The AI picks the ones that match each advert.

---

## 3. `cv_projects`

**One row per project.**

| Field | Type | Example |
| --- | --- | --- |
| `name` | Plain text | `Proposal Engine` |
| `role` | Plain text | `Lead developer` |
| `description` | Plain text | `End-to-end AI proposal system handling discovery, generation, signature and payment.` |
| `tech` | JSON | `["Next.js", "Gemini", "PocketBase", "Stripe"]` |
| `outcome` | Plain text | `Cut quoting time from 3 hours to 8 minutes` |
| `link` | Plain text | `https://levelone.digital/proposals` |
| `order` | Number | `1` |

`tech` is a JSON list, same rules as `bullets`: square brackets, quotes around
each item, commas between.

---

## 4. `cv_template`

**One row, filled in for you.** This holds the CV design as HTML.

| Field | Type | Example |
| --- | --- | --- |
| `name` | Plain text | `Level One` |
| `html` | Plain text | the whole design, several thousand characters |

You never need to touch this. It is here so you *can* — change a colour, move a
section, resize the photo panel — without going near the code.

**If you edit it, your edit is safe.** `npm run setup:pocketbase` will never
overwrite a design that is already there.

**To start again:** delete the row and run the setup command. It puts the
original design back.

The design uses `{{placeholders}}` where your details go. Two kinds:

- `{{full_name}}`, `{{headline}}`, `{{summary}}` — a single value.
- `{{experience_html}}`, `{{skills_html}}`, `{{projects_html}}`,
  `{{education_html}}`, `{{contact_html}}`, `{{photo_html}}` — a whole block the
  app builds. **Move these around, but do not try to write inside them.**

---

## 5. `applications`

**You never type in this one.** The app adds a row every time you generate a CV.

| Field | Type | What goes in it |
| --- | --- | --- |
| `job_title` | Plain text | `Senior AI Engineer` |
| `company` | Plain text | `Acme AI` |
| `cv_headline` | Plain text | the line under your name, matched to the advert |
| `job_description` | Plain text | the advert you pasted |
| `tailored_intro` | Plain text | your cover note |
| `resume_summary` | Plain text | your rewritten profile paragraph |
| `skills_matched` | JSON | the skills chosen for this job |
| `tailored_experience` | JSON | your jobs, rewritten for this advert |
| `tailored_projects` | JSON | your projects, rewritten for this advert |
| `screening_answers` | JSON | the question and answer pairs |
| `pdf` | File | **your finished CV** |
| `created` | Autodate | when it was made |
| `updated` | Autodate | when it last changed |

Three of these have settings that matter, and the setup command handles all
three for you:

- **`job_description`** — max length `30000`. Job adverts are long, and the
  default limit cuts them off halfway.
- **`pdf`** — max 1 file, 5MB, **Protected** ticked. Protected means nobody can
  download your CV without going through the app.
- **`created`** — an Autodate with **Create** ticked. The sidebar sorts on it.
  Without it, your history cannot load at all.

---

## Checking your setup

To see whether anything is missing, without changing a thing:

```bash
npm run setup:pocketbase -- --dry-run
```

It lists any collection or field that is not right yet. Run it without
`--dry-run` to fix them.

**It is always safe to run.** It never deletes a collection, never deletes or
changes a field you already have, never touches your privacy settings, and
never overwrites your CV design.

---

## A note on privacy

All five collections are locked by default. That is deliberate — your CV has
your phone number and address in it. The app reads them on the server using the
login in your `.env.local`; nothing in your browser ever talks to PocketBase.

**Do not set the API rules to public on these collections.**
