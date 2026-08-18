# Setup guide

This guide sets up your CV and job application generator.

It is written in plain English. Every step is one small action. If you do them
in order, it will work. You do not need to know how to code.

**Time needed:** about 40 minutes the first time.

---

## What you will end up with

A web page on your computer. You paste a job advert into a box. A few seconds
later you get:

- a cover note you can copy
- a summary for your CV
- answers to the screening questions
- a designed PDF CV, rewritten for that exact job

Everything is saved so you can look at old applications later.

---

## Before you start

You need three things.

**1. Node.js.** This runs the website.

- Go to **https://nodejs.org**
- Click the big green button that says **LTS**
- Open the file it downloads
- Click Next, Next, Next, Install
- Restart your computer if it asks

To check it worked, open a terminal and type:

```bash
node --version
```

You should see a number like `v22.14.0`. Anything that starts with 20, 22 or
higher is fine.

> **How do I open a terminal?**
> **Windows:** press the Windows key, type `powershell`, press Enter.
> **Mac:** press Cmd + Space, type `terminal`, press Enter.

**2. A Google account.** You almost certainly have one already.

**3. This project on your computer.** In your terminal, type:

```bash
git clone https://github.com/level-one-ai/levelone-CV.git
cd levelone-CV
npm install
```

The last line downloads everything the app needs. It takes a minute or two.
Lots of text will scroll past. That is normal.

---

## Step 1 — Make your settings file

The app keeps its passwords in a file called `.env.local`.

In your terminal, in the project folder, type:

**Windows:**

```bash
copy .env.example .env.local
```

**Mac:**

```bash
cp .env.example .env.local
```

Now open `.env.local` in any text editor. It has blank spaces in it. You will
fill them in as you go through this guide.

**Important:** never share this file, and never put it on GitHub. It is your
set of keys.

---

## Step 2 — Get your Gemini API key

Gemini is the AI that writes your application. The key is like a password that
lets your app talk to it.

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. If it asks you to agree to the terms, read them and click **I accept**
4. Click the blue button that says **Create API key**
5. It asks which project to use. If you have never done this before, pick
   **Create API key in new project**
6. Wait a moment. A long string of letters and numbers appears
7. Click the **copy** icon next to it

Now go to your `.env.local` file. Find this line:

```
GEMINI_API_KEY=
```

Paste your key right after the `=` sign, with no spaces:

```
GEMINI_API_KEY=AIzaSyC...the rest of your key
```

Save the file.

> **Keep this secret.** Anyone with this key can spend money on your account.
> Never paste it into a chat, an email, or a screenshot.

> **Is it free?** Gemini has a free tier that is generous enough for personal
> job hunting. If you go over it, Google will ask you to add a card. You can
> check your usage at https://aistudio.google.com.

---

## Step 3 — Install PocketBase

PocketBase is your database. It holds your CV, your skills, and every
application you have ever generated. It is one small file that runs on your own
computer. Nothing goes to anyone else's servers.

1. Go to **https://pocketbase.io/docs/**
2. Click the **Download** link at the top of the page
3. Pick the file that matches your computer:
   - Windows: the one with `windows_amd64` in the name
   - Mac with an M1/M2/M3/M4 chip: `darwin_arm64`
   - Older Intel Mac: `darwin_amd64`
4. Unzip the file you downloaded
5. Inside there is a file called `pocketbase` (or `pocketbase.exe` on Windows)
6. Move that file into your project folder, next to `package.json`

Now start it. Open a **new** terminal window, go to your project folder, and
type:

**Windows:**

```bash
.\pocketbase.exe serve
```

**Mac:**

```bash
./pocketbase serve
```

> **Mac says "cannot be opened because it is from an unidentified developer"?**
> Open **System Settings > Privacy & Security**, scroll down, and click
> **Open Anyway** next to the message about pocketbase. Then run the command
> again.

You should see something like:

```
2026/08/16 11:53:18 Server started at http://127.0.0.1:8090
├─ REST API:  http://127.0.0.1:8090/api/
└─ Dashboard: http://127.0.0.1:8090/_/
```

**Leave this terminal window open.** If you close it, the database stops.

### Now make your database account

Your database needs an owner. PocketBase calls this a **superuser**.

> **Read this bit carefully.** You are creating a **brand new account that only
> exists inside PocketBase**. You are not signing in to anything you already
> have.
>
> - The **email** is only used as a username. PocketBase never sends mail to
>   it and never checks that it is real. You could type `dean@local` and it
>   would work exactly the same.
> - The **password is one you invent right now**. It is *not* your email
>   password, *not* your Google password, and *not* any password you already
>   use somewhere else. **Do not reuse a real password here.** Make up a new
>   one.

Open a **second** terminal window, go to the project folder, and type this —
but swap in your own email and your own made-up password:

**Windows:**

```bash
.\pocketbase.exe superuser create you@yourdomain.com MyNewMadeUpPassword123
```

**Mac:**

```bash
./pocketbase superuser create you@yourdomain.com MyNewMadeUpPassword123
```

You should see:

```
Successfully created new superuser "you@yourdomain.com"!
```

> **There is a second way if you prefer clicking.** Look at the terminal where
> PocketBase is running. When no account exists yet, it prints a long link
> containing `#/pbinstall/` followed by a jumble of letters. Copy that whole
> link into your browser and it opens a page where you can type the email and
> password in instead.
>
> Note that just visiting `http://127.0.0.1:8090/_/` on its own is **not**
> enough on current versions of PocketBase — you need either the command above
> or that install link.

### Check it worked

Open your browser and go to:

**http://127.0.0.1:8090/_/**

(The `/_/` at the end matters. Include it.)

Sign in with the email and password you just used. If you get in, it worked.

### Put them in your settings file

```
POCKETBASE_ADMIN_EMAIL=you@yourdomain.com
POCKETBASE_ADMIN_PASSWORD=MyNewMadeUpPassword123
```

They must match the command **exactly**. Save the file.

These two lines are how the app unlocks your database. They are also the only
thing standing between a stranger and your CV, so keep them out of screenshots
and never commit `.env.local`.

> **Typed the password wrong?** Run the same command again with
> `superuser upsert` instead of `superuser create`. That overwrites it.

---

## Step 4 — Build the five tables

Your database needs five tables. PocketBase calls them **collections**.

**One command builds all five for you.** Make sure PocketBase is running, then
in your project folder type:

```bash
npm run setup:pocketbase
```

You should see:

```
  ✓ cv_profile      created (11 fields)
  ✓ cv_experience   created (7 fields)
  ✓ cv_projects     created (7 fields)
  ✓ cv_template     created (2 fields)
  ✓ applications    created (13 fields)

✓ Done — 5 created.

✓ CV design loaded into cv_template.
```

That last line matters: your CV design has been loaded into the database. You
never have to build it, and you can edit it later if you want to.

That is Step 4 finished. Skip ahead to Step 5.

> **Want every field explained, with an example of what to type in each one?**
> See **[COLLECTIONS.md](./COLLECTIONS.md)**.

> **Want to look before it touches anything?** Add `-- --dry-run`:
>
> ```bash
> npm run setup:pocketbase -- --dry-run
> ```
>
> It prints exactly what it would change and writes nothing.

> **Is it safe to run twice?** Yes. It never deletes a collection, never
> deletes or changes a field you already have, and never touches your API
> rules. The most it will ever do is add something that is missing. If you
> already built some tables by hand, run it anyway — it fills in the gaps and
> leaves your data alone.

---

### What it just built

Full details of every collection, every field, and an example of what to type in
each one live in **[COLLECTIONS.md](./COLLECTIONS.md)**. The short version:

| Collection | What it holds | Who fills it in |
| --- | --- | --- |
| `cv_profile` | You: contact details, summary, skills, education, photo | **You**, one row |
| `cv_experience` | Your jobs | **You**, one row per job |
| `cv_projects` | Your projects | **You**, one row per project |
| `cv_template` | The CV design, as HTML | Done for you |
| `applications` | Every CV the app makes | The app |

**Leave the API rules alone.** By default PocketBase locks every collection so
only the owner can read it. That is exactly what you want. Your CV has your
phone number and address in it, and this app talks to the database from the
server side using the login from Step 3.

---

## Step 5 — Type in your CV

> **Shortcut:** if your CV content is already written into
> `scripts/cv-content.mjs`, skip all the typing and run `npm run seed:cv`.
> It fills in your profile, jobs and projects in one go. You still need to
> upload your photo (Step 6) and fix your links.

Now you fill the tables with your real history. This is the part that takes the
longest, and it is the part that decides how good the results are. Take your
time here.

Click a collection in the left sidebar, then click **New record**.

### Fill in `cv_profile` (one record)

- `full_name` — Dean Finlayson
- `headline` — your job title, e.g. AI Automation Engineer
- `email`, `phone`, `location` — your real details
- `master_summary` — a paragraph about what you do and what you are good at.
  Write it long. The AI cuts it down for each job. It cannot add things you
  never told it.
- `links` — this one is JSON, so it needs a special shape. Copy this and change
  the addresses:

```json
{
  "LinkedIn": "https://linkedin.com/in/yourname",
  "Website": "https://levelone.digital",
  "GitHub": "https://github.com/yourname"
}
```

Every part needs `"straight quotes"` around it, and a comma between the lines
but not after the last one. If PocketBase turns the box red, a quote or a comma
is in the wrong place.

- `skills` — all your skills on **one line**, separated by commas:

```
TypeScript, Next.js, React, Node.js, PocketBase, Gemini API, n8n, Tailwind CSS, SQL, Docker
```

That is the whole thing. No quotes, no brackets, no JSON. Spacing does not
matter — `TypeScript,Next.js` and `TypeScript, Next.js` both work.

List 15 to 30 of them. The AI picks out the ones each advert asks for, so a
longer list gives it more to match against. Put your strongest first; where two
skills are equally relevant, the AI tends to follow your order.

> **New lines work too.** If you would rather put one skill per line, do that
> instead. The app accepts either.

- `tools` — the software you use, also on one line with commas:

```
n8n, Make.com, Custom Webhooks, REST APIs, Claude Code, Cursor, Docker, PostgreSQL, PocketBase, Stripe
```

**Skills and tools are different on purpose.** SKILLS are human things like
Problem-Solving, and they print exactly as you write them. TOOLS are software
names, and **this list gets re-ordered for every job** so the ones an advert
asks for come first. Most companies scan CVs for tool names before a person
reads them, so list everything you really use.

- `education` — **one qualification per line**, with three parts split by the
  `|` character:

```
M.Sc. Artificial Intelligence | University of Glasgow | 2018 - 2019
B.Sc. Computer Science | University of Strathclyde | 2014 - 2018
```

The order is **Degree | School | Dates**. Leave out any part you do not have.

To add subjects and grades, start a line with `-` and it attaches to the entry
above it:

```
Boroughmuir High School | Edinburgh
- Maths: Credit 2, Higher B, Advanced Higher A
- Physics: Credit 2, Higher B, Advanced Higher B
```

This is printed on your CV exactly as you type it — the AI never rewrites your
education.

- `photo` — leave this for now. It is Step 6.

### Fill in `cv_experience` (one record per job)

- `company`, `role`, `location` — as they were
- `start_date` — write it how you want it to appear, e.g. `Jan 2023`
- `end_date` — same, or `Present` if you still work there
- `order` — `1` for your newest job, `2` for the one before it, and so on
- `bullets` — JSON again. A list of the things you actually did:

```json
[
  "Built an AI proposal system that cut quoting time from 3 hours to 8 minutes",
  "Automated lead follow-up for 40+ trade clients using n8n and PocketBase",
  "Grew monthly retainer revenue from £0 to £6k in nine months"
]
```

Use square brackets. Put each item in `"quotes"`. Put a comma after each one
except the last.

**Numbers are what make you stand out.** Money saved, hours saved, people
served, percent improved. Put them in.

### Fill in `cv_projects` (one record per project)

- `name`, `role`, `description`, `outcome`, `link`
- `tech` — JSON list, like `["Next.js", "Gemini", "PocketBase"]`

---

## Step 6 — Add your photo

Your CV design has a photo panel down the left-hand side.

1. In the PocketBase admin page, open **cv_profile**
2. Click your one record
3. Find the **photo** field and click **Upload file**
4. Pick your headshot
5. Click **Save**

Tips:

- A **square** picture works best. It gets cropped to a square.
- It prints in **black and white**, to match the design.
- Keep it under 5MB. `.jpg`, `.png` and `.webp` all work.

**No photo? That is fine.** The CV still works — the panel just shows a plain
Level One block instead.

---

## Step 7 — The CV design (nothing to do)

There is no step here. Your CV design was loaded into the `cv_template`
collection back in Step 4.

It is a page of HTML. If you ever want to change a colour, move a section, or
make the photo panel taller, open **cv_template** in the admin page and edit the
`html` field. The app picks up your change on the very next CV.

Two things to know before you edit it:

- **Your edits are safe.** `npm run setup:pocketbase` will never overwrite a
  design that is already there.
- **To start over**, delete the row and run `npm run setup:pocketbase` again.
  The original design comes back.

The design has `{{placeholders}}` where your details get dropped in. Some are a
single value like `{{full_name}}`. Others, like `{{experience_html}}`, are whole
blocks the app builds for you — you can move those around, but do not try to
write inside them.

---

## Step 8 — Start the app

You should now have:

- PocketBase running in one terminal window
- Your `.env.local` filled in
- Your CV typed into the database
- Your photo uploaded

Open a **second** terminal window, go to the project folder, and type:

```bash
npm run dev
```

Wait for it to say `Ready`. Then open your browser at:

**http://localhost:3000**

You should see the Level One logo and "Hi Dean, let's get started".

---

## Step 9 — Use it

1. Find a job advert. Select the whole thing and copy it
2. Paste it into the box
3. Press **Enter**
4. The box turns into a spinning ring with the word "Generating"
5. After 10 to 30 seconds, your cards appear

Each card has a **Copy** button in the corner. Click it, then paste straight
into the job application form.

At the bottom is a button that says **View updated CV**. Click it. A panel
slides in from the left showing your new CV as a **PDF**, exactly as an employer
will see it. There is a **Download PDF** button in the corner of that panel —
that is the file you upload to the job application.

**What the AI changed on the CV.** Five things, every time:

1. **The job title** under your name, matched to the role
2. **The profile paragraph**, rewritten around the advert's keywords
3. **Your skills**, re-ordered so the ones they asked for come first
4. **Your work bullets**, rewritten to lead with what this employer cares about
5. **Your projects**, re-ordered and re-described to match the role

Everything else — your name, contact details, education, photo — stays exactly
as you wrote it. The AI is not allowed to invent employers, dates or numbers.

Every application you generate appears in the sidebar on the left. Click any
one of them to open it again — the text and the CV both come back.

---

## Putting it on a server (Coolify)

Everything above runs the app on your own computer. That works, but the app is
only on while your laptop is on. Putting it on a server means it is always
there, from any device.

You do not have to do this. Skip this section if you are happy running it at
home.

### Why there is an extra step

Your CV is turned into a PDF by **Chrome**. Not a copy of Chrome somewhere on
the internet — a real one, on the same machine as the app.

Your laptop already has Chrome, so it just works. A fresh server does not. It
is empty. So the app would write your whole application, then fail at the very
last moment with "Could not find a Chrome or Chromium".

The fix is a file called **`Dockerfile`**, which is already in the project. A
Dockerfile is a recipe. It tells the server: install Chrome, install the fonts,
install the app, then start it. You do not have to edit it or understand it.
You just have to tell Coolify to use it.

### What you need first

- A server, connected to Coolify.
- PocketBase already running on that server, with **a storage volume mounted at
  `/pb_data`**. This one matters. Without a volume, everything in your database
  is wiped every time you redeploy — your CV, and every application you have
  ever made.
- Your project pushed to GitHub.

### Step A — Make the app in Coolify

1. In Coolify, open your project and click **+ New**, then **Application**.
2. Pick your GitHub repository.
3. Choose the branch you want to deploy.

### Step B — Tell it to use the Dockerfile

This is the important click. In the application's settings:

1. Find **Build Pack**.
2. Change it from **Nixpacks** to **Dockerfile**.

Nixpacks is the default, and it builds a server with no Chrome in it. Choosing
**Dockerfile** is what gets Chrome installed. If your PDFs do not work later,
this is the first thing to check.

Then set **Ports Exposes** to `3000`.

### Step C — Paste in your settings

Go to **Environment Variables** and add these. They are the same ones from your
`.env.local`, just typed in a web page instead of a file.

| Name | What to put |
| --- | --- |
| `NEXT_PUBLIC_POCKETBASE_URL` | The address of your PocketBase, like `https://pb.yoursite.com`. No slash on the end. |
| `POCKETBASE_ADMIN_EMAIL` | The PocketBase account you made in Step 3. |
| `POCKETBASE_ADMIN_PASSWORD` | Its password. Tick **secret** if Coolify offers it. |
| `GEMINI_API_KEY` | Your key from Step 2. Tick **secret** for this one too. |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `CV_REDACT_NAMES` | Client names to keep off your CV. Leave blank if you have none. |

**You do not need `PDF_CHROMIUM_PATH`.** The Dockerfile already sets it. This
catches people out, so to be clear: the setting only says *where* Chrome is. It
cannot install one. Adding it to a server with no Chrome changes the error
message and nothing else.

### Step D — Deploy

Click **Deploy** and watch the log.

The first build is slow — five to ten minutes is normal, because it is
downloading Chrome. Later builds are much faster.

### Step E — Check it actually worked

Do not trust a green tick. Open the app and generate a real application.

- **You get a PDF** — you are finished.
- **"Could not find a Chrome or Chromium"** — the Build Pack is still set to
  Nixpacks. Go back to Step B, change it, and deploy again.
- **"Could not reach PocketBase"** — the address is wrong, or PocketBase is not
  running. Open that address in your browser and see.
- **The page loads but the sidebar is empty** — the app is running fine; your
  database is empty. Type your CV in, or run `npm run seed:cv`.

### One thing to look at afterwards

Open a generated CV and check it is still **one page**. It should be — the
Dockerfile installs the same fonts your laptop uses, and this was tested. But
fonts are what decide where the text stops, so it is worth a look the first
time.

---

## When something goes wrong

The app tries to tell you exactly what is wrong. Here is what the messages mean.

| What you see | What to do |
| --- | --- |
| "Could not reach PocketBase" | Your PocketBase terminal window is closed. Open a terminal, go to the project folder, and run `./pocketbase serve` again. |
| "Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD" | The email or password in `.env.local` does not match the account you made in Step 3. Fix it, then stop the app (Ctrl+C) and run `npm run dev` again. |
| "a collection is missing" | A collection name is spelled differently from Step 4. Check for capital letters and missing underscores. |
| "GEMINI_API_KEY is not set" | You did not paste your key into `.env.local`, or you did not restart the app after pasting it. |
| "Gemini rejected the API key" | The key is wrong or has been deleted. Make a new one at https://aistudio.google.com/apikey. |
| "Gemini is rate limiting this key" | You have made too many requests too fast. Wait a minute. |
| "Could not find a Chrome or Chromium" | The app makes your PDF using Chrome. Install Google Chrome, or set `PDF_CHROMIUM_PATH` in `.env.local` to point at one you have. |
| "Chromium is missing some system libraries" | On Linux only. Run `npx playwright install-deps chromium`. |
| "No record found in the cv_profile collection" | You have not added your details yet. Go back to Step 5. |
| The CV panel says "Could not open the CV" | Click **Download PDF** instead. The file is fine — only the preview failed. |

**A rule that fixes most problems:** every time you change `.env.local`, you
must stop the app and start it again. Press **Ctrl + C** in the terminal, then
type `npm run dev`.

---

## Keeping your data private

Your CV holds your phone number, your email address and where you live. Here is
how that stays yours.

**All four collections are locked by default.** PocketBase calls these settings
**API rules**, and when you leave them alone, nobody can read a collection
without signing in. The app signs in for you using the login from Step 3, and
it does that on the server, where nothing in your browser can see it.

**Do not set the API rules to public on these collections.** There is a setting
that makes a collection readable by anyone with no password at all. It is
useful for public things like a blog. It is a bad idea here: anyone who found
your PocketBase address could read your whole CV, download every application
you have generated, and delete them.

**On your own computer, you are already safe.** When PocketBase says
`Server started at http://127.0.0.1:8090`, that address means "this machine
only". Nothing on the internet can reach it.

**If you ever move PocketBase to a server**, that changes. The address becomes
reachable from anywhere, and your Step 3 password becomes the only thing
protecting it. That is the moment a strong invented password really matters.

**Back up `pb_data`.** That folder sits next to the PocketBase file and holds
everything — your CV, your skills, and every application you have generated.
Copy it to a USB stick or a cloud drive now and then. PocketBase can also do it
for you: in the admin page, click the gear icon, then **Backups**, then
**New backup**.

---

## Optional: signing in without a password

You do not need this. Skip it unless you would rather not have a password
sitting in a file at all.

PocketBase can give you a long-lived **token** instead. A token is a very long
string of letters that works in place of the email and password.

To get one:

1. Open the admin page at **http://127.0.0.1:8090/_/**
2. In the left sidebar, click **Collections**
3. Open the **`_superusers`** collection
4. Click on your own record
5. Click **Impersonate**
6. It asks for a **duration in seconds**. Leave it blank and you get about two
   weeks. Type `31536000` and you get a year
7. Copy the **Impersonate auth token** it shows you

**Be honest with yourself about what this gains you.** That token signs in *as*
you, so it can do everything your password can do. It is not safer in that
sense. The only real gain is that a made-up PocketBase password never has to be
written into a file. Two things to know:

- **It expires.** When the duration runs out, the app stops working until you
  make a new token. The password never expires.
- **To cancel a token, change your PocketBase password.** That switches off
  every token you have ever made.

**This needs a small code change to use.** `lib/pocketbase.ts` currently signs
in with the email and password. Using a token instead means swapping one line
for `pb.authStore.save(token, null)`. That change has not been made, so the
app expects the email and password today.

---

## Every setting, in one place

This is the full list of what goes in `.env.local`.

```bash
# Where your database is
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090

# The database owner login you made in Step 3
POCKETBASE_ADMIN_EMAIL=
POCKETBASE_ADMIN_PASSWORD=

# Your Gemini key from Step 2
GEMINI_API_KEY=

# Which AI model to use
GEMINI_MODEL=gemini-2.5-flash

# Optional. Leave both blank unless you need them.
GEMINI_CV_PROMPT=
PDF_CHROMIUM_PATH=
```

**Five things to fill in.** The last two are optional and have sensible
defaults — see [ENV-VARS.md](./ENV-VARS.md) for what they do.

**For a longer, slower walk through each one — where it comes from, what can go
wrong, and how to check it — see [ENV-VARS.md](./ENV-VARS.md).**

> **A note on the model.** `gemini-2.5-flash` works, but it is a previous
> generation. Newer Flash models write better. Because this is only a setting,
> you can switch without touching any code: open
> https://aistudio.google.com, look at the model dropdown, and put a name from
> that list here. If the name is wrong the app says so plainly.

---

## Why there is no Google Drive step

An earlier version of this plan saved your CV files to Google Drive. That would
have meant setting up a Google Cloud project, creating a service account,
turning on the Drive API, downloading a JSON key file, and sharing a folder
with a robot email address. It is about eight extra screens of clicking, and it
puts your CV on someone else's computer.

You asked to keep the files closer to home, so we did.

**Where your files actually are now:**

- Your **CV design** lives in PocketBase, in the `cv_template` collection
- Your **generated CVs** are stored in PocketBase too, in the `pdf` field of the
  `applications` collection. On disk they sit inside PocketBase's `pb_data`
  folder
- Your **PDFs are made on your own machine**, by the same Chrome engine that
  draws web pages. Nothing is uploaded anywhere to be converted

So there is no Google Cloud console, no service account, and no JSON key file
to look after. The only Google thing left is the Gemini API key, and that is
needed because Gemini is the AI doing the writing.

**And no PDF service either.** A common way to do this is to run a container
called Gotenberg on a server and send your CV to it over the internet. Gotenberg
is really just a headless Chrome with an API bolted on the front, so this app
skips the middle step and drives Chrome directly. Same engine, same result, one
less thing to run and one less place your CV has to travel to.

Backing all of this up is one folder — see **Keeping your data private** above.
