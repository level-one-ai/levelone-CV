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
npm run seed:cv                      # load the CV content
npm run build                        # production build
```

`seed:cv --force` rebuilds your profile row from `scripts/cv-content.mjs`,
which deletes the old one — including an uploaded photo and anything typed
straight into PocketBase that the file does not carry. It now works out what
would be lost, names it, and stops. Only `--force --yes` goes through with it.

`setup:pocketbase` is additive only — it never drops a collection, never edits
or removes an existing field, and never touches API rules, so it is safe to
re-run against a database that already holds your CV. The schema it applies
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
`templates/cover-note-template.html`.

Records generated before this existed have no cover note PDF; the button simply
does not appear for them.

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
