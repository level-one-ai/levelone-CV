#!/usr/bin/env python3
"""
The only Python in this project.

Reads a JSON search on stdin, runs python-jobspy, and prints JSON to stdout.
Nothing else: no filtering, no scoring, no database. Every decision about what
a job is worth lives in TypeScript next door, where it can be tested without a
network call.

  echo '{"search_term":"AI Engineer","location":"Edinburgh, Scotland"}' \\
    | python3 scripts/scrape_jobs.py

Output shape, always, even on failure:

  {"jobs": [...], "notes": ["linkedin: rate limited after 12 results"]}

`notes` is how a partial result reports itself. LinkedIn rate limits an
unauthenticated scraper at around ten pages from one IP, so a run that returns
some jobs and a note is the NORMAL case, not an error — and treating it as one
would throw away perfectly good results.
"""
import io
import json
import logging
import sys


def fail(message):
    """Errors leave on stdout in the same shape, so the caller parses one thing."""
    print(json.dumps({"jobs": [], "notes": [message], "error": message}))
    sys.exit(0)


def main():
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        fail(f"could not read the search: {exc}")

    try:
        from jobspy import scrape_jobs
    except ImportError:
        fail(
            "python-jobspy is not installed. Install it with: "
            "pip install --break-system-packages python-jobspy"
        )

    sites = request.get("sites") or ["linkedin", "indeed", "google"]
    search_term = request.get("search_term") or "AI Engineer"
    location = request.get("location") or "Edinburgh, Scotland"
    results_wanted = int(request.get("results_wanted") or 25)
    hours_old = int(request.get("hours_old") or 720)

    jobs = []
    notes = []

    # jobspy swallows a failed request, logs it, and hands back an empty frame.
    # Without this, "the network is blocked" and "nobody is hiring" look
    # identical from the outside — which is a miserable thing to debug on a
    # server. Capture its log records so a site that FAILED can say so.
    captured = io.StringIO()
    handler = logging.StreamHandler(captured)
    handler.setLevel(logging.ERROR)

    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.ERROR)

    # jobspy's per-site loggers are created with propagate=False, so a handler
    # on the root logger never sees them — which is exactly how "LinkedIn is
    # unreachable" came back as "no results". Attach to them by name as well.
    for name in list(logging.root.manager.loggerDict):
        if name.lower().startswith("jobspy"):
            site_logger = logging.getLogger(name)
            site_logger.addHandler(handler)
            site_logger.setLevel(logging.ERROR)

    # One site at a time, on purpose. A single scrape_jobs() call across three
    # sites loses everything when one of them throws, and LinkedIn throwing is
    # the expected case rather than the exceptional one.
    for site in sites:
        try:
            frame = scrape_jobs(
                site_name=[site],
                search_term=search_term,
                location=location,
                results_wanted=results_wanted,
                hours_old=hours_old,
                country_indeed="UK",
                # Without this LinkedIn returns no description at all, and the
                # description is the entire point — it is what gets scored and
                # what the CV is written against. It costs one extra request
                # per job, which is why runs are deliberately small.
                linkedin_fetch_description=(site == "linkedin"),
                description_format="markdown",
            )
        except Exception as exc:  # noqa: BLE001 - any failure is one site's failure
            notes.append(f"{site}: {type(exc).__name__}: {exc}")
            continue

        if frame is None or frame.empty:
            notes.append(f"{site}: {describe_empty(captured, site)}")
            continue

        # NaN is not JSON. pandas fills missing cells with it, and json.dumps
        # emits a bare NaN token that JSON.parse rejects — so every value goes
        # through a string conversion first.
        frame = frame.where(frame.notna(), None)

        for row in frame.to_dict("records"):
            jobs.append({key: clean(value) for key, value in row.items()})

        if len(frame) < results_wanted:
            notes.append(
                f"{site}: returned {len(frame)} of {results_wanted} asked for "
                "(rate limit or genuinely that few matches)"
            )

    print(json.dumps({"jobs": jobs, "notes": notes}))


def describe_empty(captured, site):
    """Says WHY a site returned nothing, when its own log knows."""
    logged = [
        line
        for line in captured.getvalue().splitlines()
        if site.lower() in line.lower()
    ]
    if not logged:
        return "no results"

    detail = logged[-1]
    if "ProxyError" in detail or "Max retries" in detail or "ConnectionError" in detail:
        return "could not be reached (network blocked, or no outbound access)"
    if "429" in detail or "TooManyRequests" in detail:
        return "rate limited before returning anything"
    return f"failed: {detail.strip()[-200:]}"


def clean(value):
    """Everything becomes a string or None. The TypeScript side does the typing."""
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in ("nan", "nat", "none", ""):
        return None
    return text


if __name__ == "__main__":
    main()
