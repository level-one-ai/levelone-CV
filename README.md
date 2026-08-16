# Level One — CV & Application Generator

Paste a job advert. Get a tailored cover note, screening answers, and a Word CV
rewritten for that exact role.

**New here? Read [SETUP.md](./SETUP.md).** It walks through every step in plain
English, from installing Node to typing in your CV.

**Just need the keys and settings? Read [ENV-VARS.md](./ENV-VARS.md).** It
covers the six environment variables on their own — where each one comes from,
what breaks when it is wrong, and how to check it.

---

## How it works

```
Paste advert  ─▶  POST /api/generate-application
                    1. PocketBase  → your master CV, skills and projects
                    2. Gemini      → structured JSON, tailored to the advert
                    3. docxtemplater → fills templates/master-cv.docx in memory
                    4. PocketBase  → saves the text + the .docx together
                    5. returns the text and a same-origin document URL
```

No file ever leaves the machines you control. The generated `.docx` is stored
in PocketBase's `docx` file field and streamed back through
`/api/applications/[id]/file`, which is what the split-screen viewer renders.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
PocketBase · `@google/genai` · `docxtemplater` + `pizzip` · `docx-preview` ·
`@react-three/fiber` for the background · framer-motion

## Layout

| Path | What it is |
| --- | --- |
| `app/page.tsx` | The whole client shell — sidebar, composer, output, viewer |
| `app/api/generate-application/route.ts` | The generation chain |
| `app/api/applications/*` | List, read, delete, and stream the `.docx` |
| `lib/cv.ts` | Reads the master CV and flattens it for the prompt |
| `lib/gemini.ts` | The prompt, the response schema, the error messages |
| `lib/docx.ts` | Template rendering and the tag list |
| `components/` | Sidebar, composer, loader, cards, document viewer |
| `templates/` | Your master `.docx` lives here — see `templates/README.md` |

## Running it

```bash
npm install
cp .env.example .env.local     # then fill it in — see ENV-VARS.md
./pocketbase serve             # in one terminal
npm run setup:pocketbase       # build the four collections, once
npm run dev                    # in another terminal
```

Then open http://localhost:3000.

## Handy commands

```bash
npm run setup:pocketbase             # build the four collections
npm run setup:pocketbase -- --dry-run # ...or just report what's missing
npm run check:template               # list the tags in templates/master-cv.docx
npm run build                        # production build
```

`setup:pocketbase` is additive only — it never drops a collection, never edits
or removes an existing field, and never touches API rules, so it is safe to
re-run against a database that already holds your CV. The schema it applies
lives in `scripts/pocketbase-schema.mjs`, which is the single source of truth
for what the collections must contain.

## How applications are stored

One generation writes **one record** to the `applications` collection — the
sidebar is a list of past results, not a resumable conversation. The eight text
and JSON fields plus the `.docx` go up in a single `create()` call
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
- The `.docx` preview is a faithful in-browser render, not a pixel-perfect copy
  of Word. The Download button always gives you the exact file.
- `templates/master-cv.docx` is deliberately not committed — it is your
  personal CV. Drop your own copy in before the first run.
