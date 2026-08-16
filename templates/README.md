# The master CV template

Put your CV here as a Word file called **`master-cv.docx`**.

That is the only file this folder needs. The app reads it, fills in the blanks,
and saves the finished copy into PocketBase. The file you put here is never
changed.

---

## How the blanks work

Anywhere you want the app to write something, you type a **tag**. A tag is a
word inside curly brackets, like this:

```
{full_name}
```

When the app runs, it swaps `{full_name}` for `Dean Finlayson`.

### ⚠️ The one thing that breaks tags

Word sometimes splits a word into hidden pieces while you type — especially if
you pause in the middle, or if autocorrect fires. When that happens the app
cannot see the tag any more and you get a "broken tag" error.

**The fix:** type the whole tag in one go, without stopping. If a tag keeps
failing, delete the entire line and retype it in one smooth pass. Pasting the
tag as **plain text** (Ctrl+Shift+V) also works.

---

## Tags you can use

### Your details (these come from PocketBase)

| Tag | What it becomes |
| --- | --- |
| `{full_name}` | Your name |
| `{headline}` | Your job title line, e.g. "AI Automation Engineer" |
| `{email}` | Your email address |
| `{phone}` | Your phone number |
| `{location}` | Where you live |
| `{links_line}` | All your links on one line, split by `|` |

### About the job you are applying for

| Tag | What it becomes |
| --- | --- |
| `{job_title}` | The job title from the advert |
| `{company}` | The company name from the advert |
| `{date}` | Today's date, e.g. "16 August 2026" |

### The text the AI writes

| Tag | What it becomes |
| --- | --- |
| `{tailored_intro}` | The cover note |
| `{resume_summary}` | Your summary, rewritten for this job |
| `{skills_line}` | Your matched skills on one line |

### Lists

A list needs a **start tag** and an **end tag**. Everything between them is
repeated once per item.

**Your matched skills, one per line:**

```
{#skills_matched}
{.}
{/skills_matched}
```

`{.}` means "the item itself".

**Your work history:**

```
{#tailored_experience}
{role} — {company}
{dates}
{#bullets}
{.}
{/bullets}
{/tailored_experience}
```

**Your projects:**

```
{#projects}
{name} — {role}
{description}
Tech: {tech_line}
Result: {outcome}
{/projects}
```

---

## A short example

Here is what a simple template looks like written out:

```
{full_name}
{headline}
{email}  |  {phone}  |  {location}
{links_line}

PROFILE
{resume_summary}

KEY SKILLS
{skills_line}

EXPERIENCE
{#tailored_experience}
{role}, {company}
{dates}
{#bullets}
• {.}
{/bullets}

{/tailored_experience}

PROJECTS
{#projects}
{name} — {outcome}
{/projects}
```

Style it however you like in Word — fonts, colours, columns, headings. The app
keeps all your formatting and only swaps out the tags.

---

## Check your template before you use it

Run this in a terminal, in the project folder:

```bash
npm run check:template
```

It tells you which tags it found in your file, and warns you about any it does
not recognise. It does not change your file.
