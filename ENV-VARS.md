# Getting your settings (environment variables)

This guide gets you the settings the app needs to run.

**Four you must fill in. Two are optional.**

It is written in plain English. Every step is one small action. You do not need
to know how to code.

**Time needed:** about 20 minutes.

---

## What is an "environment variable"?

It is just a setting with a name and a value, written on one line:

```
GEMINI_API_KEY=AIzaSyC123abc
```

The name is on the left of the `=`. The value is on the right.

They live in a file called `.env.local`. The app reads that file when it
starts. They are kept in a separate file (instead of in the code) for one
reason: **they are secret**. The code goes on GitHub. This file never does.

---

## The settings, at a glance

| Setting | Where it comes from | Hard? |
| --- | --- | --- |
| `NEXT_PUBLIC_POCKETBASE_URL` | PocketBase tells you when it starts | Easy |
| `POCKETBASE_ADMIN_EMAIL` | You make it up | Easy |
| `POCKETBASE_ADMIN_PASSWORD` | You make it up | Easy |
| `GEMINI_API_KEY` | Google AI Studio website | 5 minutes |
| `GEMINI_MODEL` | You pick one from a list | Easy |
| `GEMINI_CV_PROMPT` | **Optional** — leave blank | None |
| `PDF_CHROMIUM_PATH` | **Optional** — leave blank | None |
| `CV_REDACT_NAMES` | **Optional** — client names to hide | None |

Only **one** of them comes from a website. Two you invent. The rest already
work as they are.

---

## Step 1 — Make the file

Open a terminal and go to the project folder.

> **How do I open a terminal?**
> **Windows:** press the Windows key, type `powershell`, press Enter.
> **Mac:** press Cmd + Space, type `terminal`, press Enter.

The project comes with an example file. Copy it:

**Windows:**

```bash
copy .env.example .env.local
```

**Mac:**

```bash
cp .env.example .env.local
```

Now open `.env.local` in any text editor. Notepad, TextEdit, or VS Code all
work fine.

You will see the settings. Some have values already. Some are blank. You
are going to fill in the blanks.

---

## Step 2 — `NEXT_PUBLIC_POCKETBASE_URL`

**What it is:** the address of your database.

You do not have to invent this. PocketBase prints it on screen when it starts.

If you have not installed PocketBase yet, do that first — it is Step 3 of
`SETUP.md`. Once it is installed, start it:

**Windows:**

```bash
.\pocketbase.exe serve
```

**Mac:**

```bash
./pocketbase serve
```

You will see something like this:

```
2026/08/16 11:53:18 Server started at http://127.0.0.1:8090
├─ REST API:  http://127.0.0.1:8090/api/
└─ Dashboard: http://127.0.0.1:8090/_/
```

The address on the first line is your value. Copy it exactly:

```
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
```

**This is already the default**, so if you see `http://127.0.0.1:8090` in your
file, you are done. Leave it alone.

> **What does 127.0.0.1 mean?** It means "this computer". Nobody else on the
> internet can reach that address. Your database is private by default, which
> is exactly what you want.

**Leave the PocketBase terminal window open.** If you close it, the database
stops.

---

## Step 3 — `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD`

**What they are:** the login the app uses to unlock your database.

> ### Read this before you do anything
>
> You are about to **create a brand new account that only exists inside
> PocketBase**. You are *not* signing in to something you already have.
>
> - The **email is only a username.** PocketBase never sends mail to it and
>   never checks that it is real. You could type `dean@local` and it would work
>   exactly the same.
> - The **password is one you invent right now.** It is **not** your email
>   password. It is **not** your Google password. It is **not** any password
>   you already use anywhere else.
>
> **Do not reuse a real password here.** Make up a new one.

### Create the account

The easiest way is one command. In a terminal, in the project folder, type
this — but put your own email and your own made-up password in:

**Windows:**

```bash
.\pocketbase.exe superuser create dean@levelone.digital MyNewMadeUpPassword123
```

**Mac:**

```bash
./pocketbase superuser create dean@levelone.digital MyNewMadeUpPassword123
```

You should see:

```
Successfully created new superuser "dean@levelone.digital"!
```

That is it. The account exists.

> **Already started PocketBase without doing this?** No problem. Look at the
> terminal where PocketBase is running. It prints a long link that contains
> `#/pbinstall/` followed by a jumble of letters. Copy that whole link into
> your browser and it opens a page where you can create the account by typing
> it in instead. Either way works.
>
> **Made a mistake in the password?** Run the same command again but use
> `superuser upsert` instead of `superuser create`. That overwrites it.

### Put it in the file

```
POCKETBASE_ADMIN_EMAIL=dean@levelone.digital
POCKETBASE_ADMIN_PASSWORD=MyNewMadeUpPassword123
```

Use the **exact** email and password you just typed in the command. If they do
not match, the app cannot open your database.

### Check it worked

Open your browser and go to:

**http://127.0.0.1:8090/_/**

Sign in with those two things. If you get in, they are correct.

---

## Step 4 — `GEMINI_API_KEY`

**What it is:** the key that lets your app talk to Google's AI.

This is the only setting that comes from a website. It is free to get.

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account
3. The first time, it shows you the terms of service. Read them, tick the box,
   and click **Continue**
4. Click the blue **Create API key** button
5. It asks which project to put the key in. If you have never done this before,
   choose **Create API key in new project**
6. Click **Create API key** to confirm
7. A long string appears. It starts with `AIza`
8. Click the **copy** icon next to it

Go to your `.env.local` file and paste it after the `=`:

```
GEMINI_API_KEY=AIzaSyC...the rest of your key
```

No spaces. No quote marks. Just paste it straight after the `=`.

> ### Keep this one secret
>
> Anyone who gets this key can spend money on your Google account. Never paste
> it into a chat, an email, a screenshot, or a public website. If you think it
> has leaked, go back to https://aistudio.google.com/apikey, delete it, and
> make a new one. It takes ten seconds.

> ### Does it cost money?
>
> Google gives you a free allowance that is generous enough for job hunting.
> The Flash models (the fast, cheap ones) have a free tier with a daily limit.
> The Pro models are paid only. If you go past the free allowance, Google asks
> you to add a card — it will not charge you by surprise. You can watch your
> usage at https://aistudio.google.com.

---

## Step 5 — `GEMINI_MODEL`

**What it is:** which AI model does the writing.

This one is not a secret and does not come from a website. It is just a name
you choose. Your file already has one in it:

```
GEMINI_MODEL=gemini-2.5-flash
```

**This works.** If you want to get running, leave it and move on.

### But it is worth changing

`gemini-2.5-flash` is a previous-generation model. It still works and it is
cheap, but Google has released newer and better ones since. Because this is
just a setting, you can switch to a newer one **without changing any code** —
you edit one word in this file.

To see exactly which models your key can use:

1. Go to **https://aistudio.google.com**
2. Look at the model dropdown at the top right of the chat box
3. That list is the truth for your account — newer than any guide

Pick a **Flash** model if you want speed and a free tier. Pick a **Pro** model
if you want the best writing and do not mind paying. Then put its name in:

```
GEMINI_MODEL=the-name-you-picked
```

> **Got the name wrong?** Nothing breaks. The app tells you plainly:
> *"Gemini has no model called X. Change GEMINI_MODEL in .env.local to a model
> your key can use."* Try another name and restart.

---

## Step 6 — `GEMINI_CV_PROMPT` (optional)

**What it is:** the instructions Gemini follows when it rewrites your CV.

**Leave it blank.** The app has a good one built in. This setting only exists so
you can take over the writing style later, without touching any code.

```
GEMINI_CV_PROMPT=
```

### The prompt the app uses

This is what Gemini is told, word for word, every time:

```text
You tailor one specific candidate's CV and job application to one specific advert.

You are rewriting five parts of a CV, and nothing else:
1. CV HEADLINE - the line under their name. Match the advert's job title, but
   never promote them to a seniority they have not actually held.
2. PROFESSIONAL SUMMARY - a short paragraph built around the main skills and
   keywords in the advert, drawn only from what the candidate has really done.
3. CORE SKILLS - their real skills, re-ordered so the ones the advert asks for
   by name come first. Use the advert's own wording where it genuinely matches.
4. WORK EXPERIENCE BULLETS - the same real jobs, with the achievements that
   matter to this employer brought to the front and reworded in their terms.
5. FEATURED PROJECTS - the same real projects, re-ordered and re-described to
   lead with the work closest to this role's goals.

Rules you must never break:
1. Use ONLY the work history, skills and projects given to you. If the advert
   asks for something the candidate has not done, do not claim it - pick the
   closest real experience and describe it honestly.
2. Never invent employers, dates, job titles, qualifications, tools or metrics.
   Every number you write must already appear in the candidate's history.
3. Mirror the advert's vocabulary only where the experience is genuinely there,
   so applicant tracking systems match without the CV becoming a lie.
4. Write in British English, in a confident, plain, human voice. No cliches
   like "passionate", "synergy" or "dynamic team player", and no em dashes.
5. Every bullet shows an outcome, not a duty. Keep real numbers.
6. Keep the CV to one page of A4: at most 4 jobs, at most 4 bullets each, at
   most 4 projects, and at most 10 skills.
```

### If you want to change it

Copy the text above, change what you want, and put it after the `=`.

> **One catch.** A setting has to fit on **one line**. Replace every line break
> with `\n`, like this:
>
> ```
> GEMINI_CV_PROMPT=You tailor a CV.\nRule 1: never invent anything.\nRule 2: British English.
> ```

**You cannot break the output by changing this.** The shape of Gemini's answer
is locked down separately in the code, so a bad prompt can only make the writing
worse, never stop the app working.

---

## Step 7 — `PDF_CHROMIUM_PATH` (optional)

**What it is:** which copy of Chrome turns your CV into a PDF.

**Leave it blank.** The app looks for one itself, in this order:

1. Any Chromium that Playwright has downloaded
2. Google Chrome, in the normal place for your Mac, Windows or Linux machine
3. Chromium
4. Microsoft Edge

Most people already have one of these, so nothing is needed.

```
PDF_CHROMIUM_PATH=
```

### Only if it cannot find one

If you see *"Could not find a Chrome or Chromium"*, you have two choices.

**Point it at a Chrome you already have:**

```
# Mac
PDF_CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Windows
PDF_CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# Linux
PDF_CHROMIUM_PATH=/usr/bin/google-chrome
```

**Or install one, once:**

```bash
npx playwright install --with-deps chromium
```

That downloads about 150MB and then you never think about it again.

> **Why does a CV need a web browser?** Your CV is built as a web page first,
> then printed to PDF. Chrome is what does the printing, which is why the PDF
> looks exactly like the design. It is the same engine as the Gotenberg service
> people usually run in Docker for this — just without the extra service.

---

## Your finished file

When you are done, `.env.local` should look like this, with your own values:

```bash
# Where your database is
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090

# The PocketBase account you created (not your real email login)
POCKETBASE_ADMIN_EMAIL=dean@levelone.digital
POCKETBASE_ADMIN_PASSWORD=MyNewMadeUpPassword123

# Your key from Google AI Studio
GEMINI_API_KEY=AIzaSyC...

# Which AI model writes your applications
GEMINI_MODEL=gemini-2.5-flash

# Optional — leave these blank unless you need them
GEMINI_CV_PROMPT=
PDF_CHROMIUM_PATH=
CV_REDACT_NAMES=
```

Save the file.

---

## Check that it all works

Start the app:

```bash
npm run dev
```

Open **http://localhost:3000** and paste any job advert in.

- **It works** → everything is right. You are done.
- **You get a red message** → find it in the table below.

| Message | What is wrong |
| --- | --- |
| "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set" | One of them is still blank, or you did not restart after filling it in. |
| "Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD" | They are filled in but do not match the account. Test them at http://127.0.0.1:8090/_/ |
| "Could not reach PocketBase" | PocketBase is not running, or the URL is wrong. Start it again. |
| "GEMINI_API_KEY is not set" | It is blank, or you did not restart. |
| "Gemini rejected the API key" | The key is wrong, or you copied only part of it. Copy it again. |
| "Gemini has no model called..." | The `GEMINI_MODEL` name is wrong. See Step 5. |
| "Could not find a Chrome or Chromium" | See Step 7 above. |
| "Chromium is missing some system libraries" | Linux only. Run `npx playwright install-deps chromium`. |

---

## Four mistakes people make

**1. Not restarting.** The app only reads `.env.local` when it starts. If you
change anything in that file, you **must** stop the app and start it again.
Press **Ctrl + C** in the terminal, then type `npm run dev`.

This fixes more problems than anything else on this page.

**2. Adding quote marks.** Write it plain:

```
GEMINI_API_KEY=AIzaSyC123
```

Not like this:

```
GEMINI_API_KEY="AIzaSyC123"
```

**3. Spaces around the `=`.** There should be none:

```
GEMINI_API_KEY=AIzaSyC123        ← right
GEMINI_API_KEY = AIzaSyC123      ← wrong
```

**4. Editing the wrong file.** `.env.example` is the blank template. Your real
one is `.env.local`. If nothing you type seems to make a difference, check
which file is open.

---

## Optional: `CV_REDACT_NAMES`

**What it is:** client names that must never appear on a CV.

If you have worked for clients you are under contract not to name, list them
here, separated by commas:

```
CV_REDACT_NAMES=Grove Group, Trader Brothers, Cekra
```

Any of those names is stripped out of the finished CV and replaced with
"a client". Brackets go too, so `Order Router (Grove Group)` becomes
`Order Router`.

**Why this exists.** The AI is already told never to print a client's name. But
an instruction to an AI is a request, and this is a contract. This setting is
enforced in code after the AI has finished, so it holds no matter what the AI
writes.

**Better still:** do not type the client name into `cv_projects` in the first
place. You cannot leak a name that was never there.

---

## Keeping them safe

- **Never commit `.env.local`.** The project is already set up to ignore it, so
  this should happen by itself. Do not fight it.
- **Never screenshot it.** Keys have been leaked this way plenty of times.
- **If a key leaks, replace it.** Deleting a Gemini key and making a new one
  takes ten seconds. Do it the moment you are unsure.
- **Do not email the file to yourself.** If you need it on another computer,
  type the values in again by hand.
