# Your PocketBase collections

This is every table the app uses, every field inside it, and an example of what
to type in each one.

**You do not have to build these by hand.** There are two ways to make them.

**Way 1 — one command:**

```bash
npm run setup:pocketbase
```

**Way 2 — paste JSON into the admin page.** Open
[`pocketbase-collections.json`](./pocketbase-collections.json), copy all of it,
then in PocketBase go to **Settings → Import collections** and paste it in.
Regenerate that file any time with:

```bash
npm run setup:pocketbase -- --json
```

Both routes produce exactly the same tables. This was checked by building one
database each way and comparing them field by field.

This page is here so you know what it built, what to type where, and what to
check if something looks wrong.

---

## If your import "does nothing"

Tested against PocketBase 0.39.10, so these are measured, not guessed.

**The usual cause is an `id` in your JSON.** PocketBase matches an incoming
collection to an existing one by its **id**, not its name. If your JSON hardcodes
an id that does not match the one PocketBase generated, it tries to *create* a
second collection with a name that is already taken, hits a
`UNIQUE constraint failed: _collections.name` error, and — because the import is
all-or-nothing — **rejects the entire paste**. Nothing changes, which looks
exactly like "it did not add the fields".

**The fix: delete every `"id"` line**, from the collections and from the fields.
With no ids, PocketBase matches by name and merges, whether the collection
already exists or not. The generated file has no ids for this reason.

Two more things worth knowing:

- **Field options must be flattened.** Write `"max": 30000` directly on the
  field. The older `"options": { "max": 30000 }` shape is pre-0.23.
- **`"listRule": ""` is not "no rule".** An empty string is a rule that always
  passes, which makes that collection readable by anyone who can reach your
  PocketBase — your address and phone number included. `null` is what locks it
  to you. Every rule in the generated file is `null`.

**The import screen creates tables only. It cannot load records.** For your
actual CV content, use `npm run seed:cv` after importing.

---

## The five collections at a glance

| Collection | What it holds | Who fills it in |
| --- | --- | --- |
| `cv_profile` | You: contact details, summary, skills, tools, education, photo | **You**, one row |
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
| `tools` | Plain text | see below |
| `education` | Plain text | see below |
| `photo` | File | your headshot, a `.jpg` or `.png` |

### `links`

This one is JSON. Use a **list**, one entry per link — the order you write
them is the order they print:

```json
[
  { "name": "Website",  "url": "https://portfolio.levelone.digital/" },
  { "name": "GitHub",   "url": "https://github.com/level-one-ai" },
  { "name": "LinkedIn", "url": "https://www.linkedin.com/in/dean-finlayson" }
]
```

Every part needs `"straight quotes"`. Put a comma between the entries, but not
after the last one. If PocketBase turns the box red, a quote or comma is wrong.

The older `{"GitHub": "https://..."}` shape still works too, so nothing breaks
if that is what you already have. An entry with no `url` is skipped rather than
printed as a blank line.

These fill the **LINKS** panel of your CV, directly under Contact. Each one is
a real clickable link in the PDF; the visible text drops the `https://` so a
long address does not wrap onto three lines.

**Leave this empty and the panel does not appear at all** — no empty heading.
If your links are missing from a generated CV, this field is the place to look.

### `master_summary`

A paragraph about what you do. **Write it long.** The AI shortens it for each
job, but it can never add things you did not tell it.

> Example:
> `AI automation engineer who builds production systems for service businesses. Ten years across full-stack development, with the last three focused on LLM-powered internal tools. Built and shipped a proposal engine, a booking platform and a CV generator, all end to end. Comfortable owning everything from database schema to the interface people actually use.`

### `skills` — your human skills

These are the ones in the **SKILLS** panel. Not code, not software. The things
you are good at as a person.

```
Problem-Solving, Client Communication, Systems Thinking, Project Management, Process Improvement, Attention to Detail, Adaptability, Self-Direction, Learning Agility
```

One line, separated by commas. No quotes, no brackets. Spacing does not matter,
and new lines work too if you prefer one per line.

**The AI picks which 4 of these to print, but never changes the words.** Its choices are matched back against your list in code, so a skill
you did not write cannot appear, and "Problem-Solving" cannot quietly become
"Advanced Problem Resolution". Write more than you need; the ones that suit
each advert get used.

**These fill the SKILLS panel. Your links now have their own panel** directly
under Contact, filled from the `links` field above.

### `tools` — the software you use

These fill the **TOOLS** panel underneath.

```
n8n, Make.com, Custom Webhooks, REST APIs, Claude Code, Cursor, GitHub Copilot, Claude API, Firebase, Docker, VPS / Linux, PostgreSQL, PocketBase, Stripe, GoCardless
```

**Only 4 of these print, chosen for each advert.** If a job asks for Docker,
Docker is one of the four. n8n and Make.com are never printed together unless
the job is specifically a no-code or low-code role — side by side they read as
a no-code generalist rather than an engineer. This is the part that machines read — most companies scan
CVs for tool names before a human ever sees them, so list everything you
genuinely use.

The AI can only re-order this list. It can never add a tool you have not
written here.

### `education`

**One qualification per line.** Three parts, separated by the `|` character:

```
M.Sc. Artificial Intelligence | University of Glasgow | 2018 - 2019
B.Sc. Computer Science | University of Strathclyde | 2014 - 2018
```

The order is **Degree | School | Dates**. You can leave any part out — a
qualification with no dates just prints without them.

**Adding subjects and grades:** start a line with `-` and it becomes a detail
of the entry above it:

```
BEng (Hons) Civil Engineering | Granton College
HND Architecture | Granton College
Boroughmuir High School | Edinburgh
- Maths: Credit 2, Higher B, Advanced Higher A
- Physics: Credit 2, Higher B, Advanced Higher B
- English: General 3, Higher B, Advanced Higher B
```

This is printed exactly as you type it — the AI never rewrites your education.

### `photo`

Click the field, click **Upload file**, pick your headshot.

- A square picture works best. It is cropped to a square on the CV.
- It is printed in black and white, to match the design.
- The bottom edge fades into the dark sidebar, so keep your face in the
  upper two thirds of the picture. The fade is shallow and never reaches it.
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
| `client_name` | Plain text | `Grove Group` — **never printed on your CV** |

`tech` is a JSON list, same rules as `bullets`: square brackets, quotes around
each item, commas between.

### Keeping your clients anonymous

**Put the client's name in `client_name`, and nowhere else.**

That field is never printed on your CV. It exists for the opposite reason —
typing the name there is what hides it. Two things then happen automatically,
every time you generate:

1. **The AI is told the name before it writes anything**, as a string it may
   never print in any field.
2. **The finished text is checked afterwards, in code.** Every field is
   scanned and the name is replaced with "a client", whatever the AI did.
   Brackets go with it, so `Order Router (Grove Group)` becomes
   `Order Router`.

The second step is the one that matters. An instruction to an AI is a request;
this is a contract. So it is enforced again where the AI gets no say.

**Still do not type the name in `name` or `description`.** You cannot leak a
name that was never there, and `client_name` is a safety net, not a licence.

Instead of:

```
Operations Command Center & Automated Document Router (Grove Group)
```

write:

```
Operations Command Centre & Automated Document Router
```

and describe the client by sector in the description: "a trade e-commerce
client", "a logistics operator".

**For names not tied to one project** — a company that only comes up in a
work-experience bullet, say — there is `CV_REDACT_NAMES` in `.env.local`, a
comma-separated list handled exactly the same way:

```
CV_REDACT_NAMES=Grove Group, Trader Brothers, Cekra
```

You do not need to repeat a name here that is already in a `client_name`
field. Names under three characters are ignored, because a two-letter "name"
would chew holes in ordinary words.

---

## 4. `cv_template`

**One row, filled in for you.** This holds the CV design as HTML.

| Field | Type | Example |
| --- | --- | --- |
| `name` | Plain text | `Level One` |
| `html` | Plain text | the CV design, several thousand characters |
| `cover_note_html` | Plain text | the cover note design, same idea |

You never need to touch this. It is here so you *can* — change a colour, move a
section, resize the photo panel — without going near the code.

**If you edit it, your edit is safe.** `npm run setup:pocketbase` will never
overwrite a design that is already there.

**To start again:** delete the row and run the setup command. It puts the
original designs back.

### If a design will not save

**Set `Max length` to `200000` on `html` and on `cover_note_html`.**

A text field created by hand with the **Max length box left blank is not
unlimited.** PocketBase stores that as `0` and enforces **5000 characters**.
The cover note design is about 7,800 characters and the CV design about 11,000,
so both are rejected — the field turns red and saving fails with:

> Must be no more than 5000 character(s).

Measured against PocketBase 0.39.10, so this is the behaviour, not a guess.

One command fixes it:

```bash
npm run setup:pocketbase -- --fix-limits
```

That only ever **raises** a limit, so nothing can be truncated, and it loads
the design in the same run. Plain `npm run setup:pocketbase` will now tell you
when a field is too small rather than reporting it as correct.

### `cover_note_html` — the cover note

Same design as the CV — same colours, same dark sidebar, same photo — but the
sidebar holds **only your contact details and your links**. No skills, no tools,
no education. It is a letter, not a second CV.

It uses the same placeholders as the CV plus two of its own:

- `{{cover_note_html}}` — your cover note, as paragraphs
- `{{date}}` — today's date, written out: `20 August 2026`

**If this field is empty**, the app uses the design shipped in
`templates/cover-note-template.html`, so nothing breaks. Running
`npm run setup:pocketbase` fills it in for you — and it will fill in an empty
`cover_note_html` on a row that already has a CV design, without touching that
design.

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
| `skills_matched` | JSON | the tools chosen and re-ordered for this job |
| `tailored_experience` | JSON | your jobs, rewritten for this advert |
| `tailored_projects` | JSON | your projects, rewritten for this advert |
| `screening_answers` | JSON | the question and answer pairs |
| `pdf` | File | **your finished CV** |
| `cover_note_pdf` | File | **your cover note**, as its own PDF |
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

It lists any collection or field that is not right yet, including a text field
whose **Max length is too small to hold what has to go in it**. Run it without
`--dry-run` to fix them.

**It is always safe to run.** It never deletes a collection, never deletes or
changes a field you already have, never touches your privacy settings, and
never overwrites your CV design.

The one exception is `--fix-limits`, and only because you asked for it: that
raises a text field's Max length when it is too small. Raising a limit cannot
truncate anything, so there is nothing to lose either way.

---

## A note on privacy

All five collections are locked by default. That is deliberate — your CV has
your phone number and address in it. The app reads them on the server using the
login in your `.env.local`; nothing in your browser ever talks to PocketBase.

**Do not set the API rules to public on these collections.**
