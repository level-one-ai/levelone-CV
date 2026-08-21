# Level One — CV & Application Generator

Paste a job advert. Get a tailored cover note, screening answers, and a designed
PDF CV rewritten for that exact role.

**New here? Read [SETUP.md](./SETUP.md).** It walks through every step in plain
English, from installing Node to typing in your CV.

**Just need the keys and settings? Read [ENV-VARS.md](./ENV-VARS.md).** It
covers the environment variables on their own — where each one comes from, what
breaks when it is wrong, and how to check it.

**Need the database layout? Read [COLLECTIONS.md](./COLLECTIONS.md).** Every
collection, every field, and an example of what to type in each one.

**Want Dean's actual values ready to paste? Read [MY-CV-DATA.md](./MY-CV-DATA.md).**
The same content is in `scripts/cv-content.mjs`, loadable with `npm run seed:cv`.

---

## How it works

```
Paste advert  ─▶  POST /api/generate-application
                    1. PocketBase → master CV, projects and your photo
                    1b. duplicates → have you applied to this one already?
                    2. Gemini     → structured JSON, tailored to the advert
                    3. cv-html.ts → fills the HTML template's {{placeholders}}
                    4. pdf.ts     → headless Chromium prints an A4 PDF, in memory
                    4b. …and a second one for the cover note
                    5. PocketBase → saves the text + both PDFs together
                    6. returns the text and same-origin document URLs
```

No file ever leaves the machines you control, and there is no PDF service. The
usual approach here is a Gotenberg container reached over HTTP; Gotenberg is a
headless Chromium with an API in front of it, so this app drives Chromium
directly instead — same engine, no container, no network hop. The generated PDF
is stored in PocketBase's `pdf` file field and streamed back through
`/api/applications/[id]/file`, which the split-screen viewer shows in an iframe.

Chromium is found automatically: Playwright's browsers first, then the usual
Google Chrome, Chromium and Edge locations on macOS, Windows and Linux. Set
`PDF_CHROMIUM_PATH` to override.

## Deploying

A container has no browser in it, so `npm start` on a stock Node image gets
through Gemini and then fails on the print step. The `Dockerfile` installs
Chromium and the fonts the CV layout depends on — `fonts-liberation` in
particular is load-bearing, not cosmetic: without it Chromium falls back to
DejaVu Sans and the CV runs to two pages.

```bash
docker build -t levelone-cv .
docker run -p 3000:3000 --env-file .env.local levelone-cv
```

On Coolify, set the build pack to **Dockerfile** (not Nixpacks) and the port to
3000. SETUP.md, "Putting it on a server", walks through it.

## Finding jobs

The front screen is two buttons: **Search Jobs** and **Jobs List**. `/jobs`
searches on demand, never on a schedule. Each result is filtered, scored 0-100
and stored in `scraped_jobs`.

One press, two legs, into one list:

| Leg | Asks for |
| --- | --- |
| **Local** | Anything around Edinburgh, any working pattern |
| **Remote (UK)** | Remote roles across the whole UK, **minus Edinburgh and Glasgow** — those are already covered by the local leg |

Six sources. LinkedIn, Indeed, Google and Glassdoor go through python-jobspy
and need no key. Adzuna and Reed are keyed APIs (`ADZUNA_APP_ID`,
`ADZUNA_APP_KEY`, `REED_API_KEY`) and are skipped with a note when the keys are
absent — worth having because an API answers every time, where a scraped board
rate limits. Adzuna returns only a summary of each advert, so those jobs skip
the required-skill rule and say so on the card.

Anything you have applied to before is flagged on the card and needs a second
press to apply again. The check runs when the board is read rather than being
stored, so it is never stale — see `lib/applied.ts`.

The remote leg adds a gate in `lib/uk-location.ts`, because a UK-scoped search
still returns "Remote" listings from Austin and Bangalore — the boards match on
the word, not the place. The rule is **keep unless the location clearly names
somewhere else**, since an allow-list would discard every advert that says
nothing but "Remote", which is most of them. A job whose location is not marked
remote is kept only if the advert itself says "fully remote" or "remote-first".

The sidebar holds the views: **Top match** (best fit, nothing actioned), **All
jobs**, **Not applied**, **Applied**, **Not interested**, and **Paste an
advert** for a job someone sends you directly (the old front screen, now at
`/paste`).

Applying is two steps, deliberately:

1. **Apply** writes the CV and cover note. Nothing is generated before this — a
   search of fifty jobs must not cost fifty Gemini calls.
2. **Apply to Position** opens the advert and marks the job `Applied`.

Splitting them means a job you prepared but did not send stays honestly marked
as not applied.

```
Find jobs  ─▶  POST /api/jobs/scrape
                 1. scraper.ts  → spawns scripts/scrape_jobs.py (python-jobspy)
                 2. job-filter  → title rules, required and banned skills
                 3. job-score   → 0-100, tier, and the gaps in your profile
                 4. PocketBase  → scraped_jobs, deduped on a unique job_url
```

Three things worth knowing before you rely on it:

- **LinkedIn rate limits at around ten pages from one IP**, and descriptions
  need one extra request each. Runs are deliberately small and slow. A partial
  result with a note is normal, not a failure.
- **Applicant counts are not available.** jobspy does not return them.
- **The score measures the advert, not you.** It rewards two things: the stack
  these roles ask for (LangGraph, RAG, vector databases, FastAPI) and the things
  you can actually evidence (shipping end to end, n8n, integrations, client-
  facing work, employers who hire on portfolio rather than degree). The second
  group is capped at 30 points so a wordy advert cannot out-score a good one.
  Each card shows both halves: **You can evidence** in green, **Not on your
  profile** in amber. Read those before the number.

Job searching needs Python and `python-jobspy`. Both are in the Docker image;
locally, `pip install --break-system-packages python-jobspy`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
PocketBase · `@google/genai` · `playwright-core` driving headless Chromium ·
`@react-three/fiber` for the background · framer-motion

## Layout

| Path | What it is |
| --- | --- |
| `app/page.tsx` | The whole client shell — sidebar, composer, output, viewer |
| `app/api/generate-application/route.ts` | The generation chain |
| `app/api/applications/*` | List, read, delete, and stream the PDF |
| `lib/cv.ts` | Reads the master CV and flattens it for the prompt |
| `lib/gemini.ts` | The prompt, the response schema, the error messages |
| `lib/cv-html.ts` | Fills the CV template's placeholders, and enforces the limits |
| `lib/pdf.ts` | Prints the HTML to PDF with headless Chromium |
| `components/` | Sidebar, composer, loader, cards, document viewer |
| `templates/cv-template.html` | The default CV design, seeded into PocketBase |
| `templates/cover-note-template.html` | The cover note design, likewise |
| `lib/scraper.ts` | Runs the Python scraper and types its output |
| `lib/job-filter.ts` · `lib/job-score.ts` | The rules and the 0-100 score, pure |
| `lib/jobs.ts` | Stores and lists scraped jobs |
| `app/jobs/page.tsx` | The job board |
| `scripts/scrape_jobs.py` | The only Python: jobspy in, JSON out |

## Running it

```bash
npm install
cp .env.example .env.local     # then fill it in — see ENV-VARS.md
./pocketbase serve             # in one terminal
npm run setup:pocketbase       # build the five collections, once
npm run dev                    # in another terminal
```

Then open http://localhost:3000.

## Handy commands

```bash
npm run setup:pocketbase             # build the five collections
npm run setup:pocketbase -- --dry-run # ...or just report what's missing
npm run setup:pocketbase -- --json   # ...or emit JSON for Import collections
npm run setup:pocketbase -- --fix-limits # raise a text field's max length
npm run seed:cv                      # load the CV content
npm run build                        # production build
```

`seed:cv --force` rebuilds your profile row from `scripts/cv-content.mjs`,
which deletes the old one — including an uploaded photo and anything typed
straight into PocketBase that the file does not carry. It now works out what
would be lost, names it, and stops. Only `--force --yes` goes through with it.

`setup:pocketbase` is additive only — it never drops a collection, never edits
or removes an existing field, and never touches API rules, so it is safe to
re-run against a database that already holds your CV. It also reports a text
field whose max length is too small to hold what the app must store: a hand-made
field with a blank Max length is capped at 5000 characters by PocketBase, not
unlimited, which is enough to silently break a template. `--fix-limits` raises
those, and raising a limit cannot truncate anything. The schema it applies
lives in `scripts/pocketbase-schema.mjs`, which is the single source of truth
for what the collections must contain.

## The cover note PDF

Every generation also prints the cover note as its own A4 PDF, in the same
design as the CV but with a sidebar holding only contact details and links —
it is a letter, not a second CV. It is stored on the same record in
`applications.cover_note_pdf` and downloaded from the **PDF** button on the
cover note card.

Its design lives in **`cv_template.cover_note_html`**, next to the CV design in
the same row, so both are edited in one place. Empty field falls back to
`templates/cover-note-template.html` — PocketBase is optional for templates,
not required.

Each loader checks the stored template is the right kind of document — a CV
design must contain `{{experience_html}}`, a cover note `{{cover_note_html}}`.
The two designs sit in adjacent fields and look alike, so swapping them is an
easy mistake, and one that otherwise renders a perfectly tidy CV with no work
history on it.

**View cover note** under the cover note card opens it in the same split-screen
panel the CV uses, and **PDF** on the card header downloads it directly. The
panel shows one document at a time, so viewing one closes the other.

**Every application has one, including the ones generated before the feature
existed.** If a record has no stored `cover_note_pdf` but does have cover note
text in `tailored_intro`, the file route builds the PDF on request, caches it
back onto the record, and streams it. No Gemini call — the letter is already
written, so this is a template and a browser.

That also covers the case where `applications.cover_note_pdf` does not exist
yet: PocketBase **silently discards an unknown field on create** (measured
against 0.39.10, not assumed), so the file would vanish with no error. The
document is rebuilt on every request until `npm run setup:pocketbase` adds the
field, which works but is slower — and the server log says so plainly rather
than leaving it a mystery.

## Keeping it to one page

The CV is never scaled or clipped to fit, so the limits are content limits, set
in the prompt AND enforced in `lib/cv-html.ts` — one sentence per job, two
projects, 4 tools, 4 skills, and only the two most recent roles in full. The prompt asks; the renderer makes sure, on
the principle that a prompt is a request and a CV silently growing a second
page is what we are trying to stop.

`dropOverlappingTools()` in `lib/gemini.ts` also stops n8n and Make.com
appearing together, unless the advert is for no-code or low-code work — that
tie-break needs the job advert, which only that layer can see.

Skills are chosen for the advert but never reworded: `chooseSkills()` matches
the model's picks back against the master list and prints your spelling, so
nothing invented reaches the page.

## Applying twice

Before anything is generated, the pasted advert is checked against the last 200
applications (`lib/duplicates.ts`). Three signals, strongest first: a
fingerprint of the normalised text catches a straight re-paste; word
containment at 0.9 catches a trimmed or messier copy; and the stored company
*and* job title both appearing catches the same job found on another board.

A match returns **409** with the existing record, and the UI offers to open it
or to generate anyway. It **warns, never blocks** — re-applying months later is
legitimate. The check runs before Gemini, so noticing a repeat costs nothing.

Both the company and the title are required for the third signal on purpose. A
second, unrelated vacancy at an employer you have applied to before is not a
duplicate, and a warning that cries wolf gets ignored on the day it is right.

## How applications are stored

One generation writes **one record** to the `applications` collection — the
sidebar is a list of past results, not a resumable conversation. The text
and JSON fields plus the `.pdf` go up in a single `create()` call
(`app/api/generate-application/route.ts`), which is why reopening an entry
restores both the cards and the document.

The sidebar reads only `id,job_title,company,created`, sorted `-created`
(`app/api/applications/route.ts`), so the list stays cheap regardless of how
many adverts are stored. Date grouping is computed client-side in
`HistorySidebar.tsx`. The full record is fetched on click, and the document
separately from `/api/applications/[id]/file`.

## Notes

- Every CV collection keeps PocketBase's default locked API rules. All database
  access happens server-side with the superuser login in `.env.local`; nothing
  in `components/` touches PocketBase. The login is a PocketBase-only account
  created in its admin UI — see SETUP.md step 3.
- The viewer shows the real PDF in an iframe, so the preview and the downloaded
  file are the same bytes.
- The CV design is seeded into the `cv_template` collection on first setup and
  read from there afterwards, so edits in the PocketBase admin UI take effect
  immediately. `setup:pocketbase` never overwrites an edited design.
- Gemini's system prompt can be replaced wholesale with `GEMINI_CV_PROMPT`; the
  response schema is enforced separately, so a custom prompt cannot break the
  output shape.
