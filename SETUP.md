# Setup guide

This guide sets up your CV and job application generator.

It is written in plain English. Every step is one small action. If you do them
in order, it will work. You do not need to know how to code.

**Time needed:** about 45 minutes the first time.

---

## What you will end up with

A web page on your computer. You paste a job advert into a box. A few seconds
later you get:

- a cover note you can copy
- a summary for your CV
- answers to the screening questions
- a Word CV, rewritten for that exact job

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
Server started at http://127.0.0.1:8090
```

**Leave this terminal window open.** If you close it, the database stops.

Now open your web browser and go to:

**http://127.0.0.1:8090/_/**

(The `/_/` at the end matters. Include it.)

The first time you do this it asks you to make an account. This is your
superuser account — the owner of the database.

- Type your email address
- Make up a strong password. **Write it down somewhere safe.**
- Click **Create and login**

Now put those same two things into your `.env.local` file:

```
POCKETBASE_ADMIN_EMAIL=you@yourdomain.com
POCKETBASE_ADMIN_PASSWORD=the password you just made
```

Save the file.

---

## Step 4 — Build the five tables

Your database needs five tables. PocketBase calls them **collections**. You are
going to make them by hand. It is repetitive but it is not hard.

For every collection you make, the steps are the same:

1. Click **New collection** in the left sidebar
2. Choose **Base** (not Auth, not View)
3. Type the name exactly as written below — lowercase, with underscores
4. Click **New field** once for each field in the table below
5. Pick the **Type** from the dropdown, then type the **Name**
6. Click **Create**

**Spelling matters.** `cv_profile` works. `CV_Profile` does not.

**Leave the API rules alone.** By default PocketBase locks every collection so
only the owner can read it. That is exactly what you want. Your CV has your
phone number and address in it, and this app talks to the database from the
server side using the login from Step 3.

### Collection 1: `cv_profile`

This is you. It holds one row only.

| Field name | Type |
| --- | --- |
| `full_name` | Plain text |
| `headline` | Plain text |
| `email` | Plain text |
| `phone` | Plain text |
| `location` | Plain text |
| `links` | JSON |
| `master_summary` | Plain text |

### Collection 2: `cv_experience`

One row per job you have had.

| Field name | Type |
| --- | --- |
| `company` | Plain text |
| `role` | Plain text |
| `start_date` | Plain text |
| `end_date` | Plain text |
| `location` | Plain text |
| `bullets` | JSON |
| `order` | Number |

### Collection 3: `cv_skills`

One row per skill.

| Field name | Type |
| --- | --- |
| `name` | Plain text |
| `category` | Plain text |
| `proficiency` | Plain text |
| `order` | Number |

### Collection 4: `cv_projects`

One row per project you are proud of.

| Field name | Type |
| --- | --- |
| `name` | Plain text |
| `role` | Plain text |
| `description` | Plain text |
| `tech` | JSON |
| `outcome` | Plain text |
| `link` | Plain text |
| `order` | Number |

### Collection 5: `applications`

You never type in this one. The app fills it in every time you generate an
application.

| Field name | Type |
| --- | --- |
| `job_title` | Plain text |
| `company` | Plain text |
| `job_description` | Plain text |
| `tailored_intro` | Plain text |
| `resume_summary` | Plain text |
| `skills_matched` | JSON |
| `tailored_experience` | JSON |
| `screening_answers` | JSON |
| `docx` | File |
| `created` | Autodate |
| `updated` | Autodate |

Three of these need extra care:

- **`created`** — this is what puts your applications in date order in the
  sidebar. PocketBase usually adds `created` and `updated` for you when you
  make a new collection. Scroll down the field list and check. If they are
  there, leave them alone. If they are not, add `created` yourself: choose
  **Autodate** as the type, name it `created`, and in **Options** tick
  **Create**. Do the same for `updated`, ticking both **Create** and
  **Update**.

- **`job_description`** — click the field, open **Options**, and set
  **Max length** to `30000`. Job adverts are long, and the default limit will
  cut them off.
- **`docx`** — this is where your generated CV file is stored. Click the field
  and open **Options**. Set **Max file size** to at least `5MB`. Leave
  **Max files** at 1.

That is the storage sorted. Your CV documents live in PocketBase, right beside
the text that goes with them.

---

## Step 5 — Type in your CV

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

### Fill in `cv_skills` (one record per skill)

- `name` — e.g. `TypeScript`
- `category` — e.g. `Languages`, `AI`, `Cloud`
- `proficiency` — e.g. `Expert`, `Working knowledge`
- `order` — lower numbers show first

Add 15 to 30 of these. The AI picks the ones each advert asks for.

### Fill in `cv_projects` (one record per project)

- `name`, `role`, `description`, `outcome`, `link`
- `tech` — JSON list, like `["Next.js", "Gemini", "PocketBase"]`

---

## Step 6 — Get your CV out of Google Docs

Your master CV is in Google Docs. The app needs it as a Word file.

1. Open your CV in Google Docs
2. Click **File** in the top menu
3. Hover over **Download**
4. Click **Microsoft Word (.docx)**
5. It saves to your Downloads folder
6. Find that file, and move it into the **`templates`** folder inside this
   project
7. Rename it to exactly **`master-cv.docx`**

The path should end up looking like this:

```
levelone-CV/templates/master-cv.docx
```

That is your template. The app reads it and makes a copy. Your original is
never changed.

---

## Step 7 — Add the blanks to your template

Right now your template is just your old CV. You need to tell the app where to
write the new text.

You do that with **tags** — words in curly brackets.

Open `templates/master-cv.docx` in Microsoft Word (or LibreOffice, or Pages).

Find your summary paragraph. Delete it. In its place, type:

```
{resume_summary}
```

Find your work history section. Delete the job entries. In their place, type:

```
{#tailored_experience}
{role}, {company}
{dates}
{#bullets}
• {.}
{/bullets}

{/tailored_experience}
```

That looks strange, but it is simple:

- `{#tailored_experience}` means **start of the job list**
- `{/tailored_experience}` means **end of the job list**
- Everything between them is repeated once for every job
- `{#bullets}` and `{/bullets}` do the same for the bullet points inside a job
- `{.}` means **this bullet's text**

At the top of your CV, replace your name and contact line with:

```
{full_name}
{headline}
{email}  |  {phone}  |  {location}
```

Style all of it however you like. Bold, colours, fonts, columns — the app keeps
your formatting exactly. It only swaps out the words in curly brackets.

**The full list of tags is in `templates/README.md`.**

> **Warning about Word.** If you type a tag slowly, Word sometimes chops it
> into hidden pieces and the app can no longer see it. If a tag does not work,
> delete the whole line and retype it in one go without pausing.

Save the file. Then check your work — in your terminal, type:

```bash
npm run check:template
```

It lists the tags it found. If something is spelled wrong, it says so.

---

## Step 8 — Start the app

You should now have:

- PocketBase running in one terminal window
- Your `.env.local` filled in with three values
- Your CV typed into the database
- `templates/master-cv.docx` with tags in it

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
slides in from the left with your new CV in it. There is a **Download** button
in the corner of that panel to save the Word file.

Every application you generate appears in the sidebar on the left. Click any
one of them to open it again — the text and the CV both come back.

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
| "No Word template found" | `templates/master-cv.docx` is missing, or the name is spelled differently. Check Step 6. |
| "The Word template has broken tags" | Word split a tag into pieces. Delete that whole line in Word and retype it in one go. |
| "No record found in the cv_profile collection" | You have not added your details yet. Go back to Step 5. |
| The CV panel says "Could not display the CV" | Click **Download it instead**. The file is fine — only the preview failed. |

**A rule that fixes most problems:** every time you change `.env.local`, you
must stop the app and start it again. Press **Ctrl + C** in the terminal, then
type `npm run dev`.

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

# Where your Word template lives
CV_TEMPLATE_PATH=templates/master-cv.docx
```

Five things to fill in. That is all of them.

---

## Why there is no Google Drive step

An earlier version of this plan saved your CV files to Google Drive. That would
have meant setting up a Google Cloud project, creating a service account,
turning on the Drive API, downloading a JSON key file, and sharing a folder
with a robot email address. It is about eight extra screens of clicking, and it
puts your CV on someone else's computer.

You asked to keep the files closer to home, so we did.

**Where your files actually are now:**

- Your **master template** is a file in this project, at
  `templates/master-cv.docx`
- Your **generated CVs** are stored in PocketBase, in the `docx` field of the
  `applications` collection. On disk they sit inside PocketBase's `pb_data`
  folder
- The **split-screen viewer** reads the Word file directly in your browser. No
  upload, no conversion, no third party

So there is no Google Cloud console, no service account, and no JSON key file
to look after. The only Google thing left is the Gemini API key, and that is
needed because Gemini is the AI doing the writing.

---

## Backing up

Everything you type into PocketBase lives in a folder called `pb_data`, next to
the PocketBase file. Copy that folder somewhere safe every so often — a USB
stick or a cloud drive is fine. That one folder is your whole CV history.

PocketBase can also do this for you. In the admin page, click the gear icon,
then **Backups**, then **New backup**.
