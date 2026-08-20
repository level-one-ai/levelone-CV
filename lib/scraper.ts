import { spawn } from "node:child_process";
import path from "node:path";

/**
 * The boundary between this Node app and the one Python script it uses.
 *
 * python-jobspy is the mature scraper for LinkedIn, Indeed and Google, and it
 * is Python. A TypeScript port exists but is a few dozen commits old and says
 * itself that most of its backends do not work yet, which is not something to
 * hang a job search on. So: a subprocess, a JSON contract, and every decision
 * about what a job is WORTH kept on this side where it can be tested.
 */

export interface ScrapeRequest {
  searchTerm: string;
  location: string;
  sites?: string[];
  resultsWanted?: number;
  /** Only jobs posted within this many hours. 720 = 30 days. */
  hoursOld?: number;
}

/** One job, as this app understands it, whichever site it came from. */
export interface ScrapedJob {
  externalId: string;
  source: string;
  jobUrl: string;
  title: string;
  company: string;
  location: string;
  description: string;
  datePosted: string;
  jobType: string;
  isRemote: boolean;
  salaryText: string;
  jobLevel: string;
  jobFunction: string;
  companyIndustry: string;
  companyUrl: string;
  companyNumEmployees: string;
}

export interface ScrapeResult {
  jobs: ScrapedJob[];
  /**
   * What went wrong, or partly wrong, in words. A rate-limited LinkedIn belongs
   * here rather than in an exception: some jobs plus a note is a useful run.
   */
  notes: string[];
}

/**
 * How long the scraper gets before it is killed.
 *
 * Generous, because `linkedin_fetch_description` makes one HTTP request per
 * job, so 25 jobs is 25 sequential fetches. Not unlimited, because a hung
 * subprocess would otherwise hold the request open until the platform kills it.
 */
const TIMEOUT_MS = 180_000;

export function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "scrape_jobs.py");
}

/** Which python to run. Overridable for containers that name it differently. */
function pythonBin(): string {
  return process.env.PYTHON_BIN?.trim() || "python3";
}

export async function scrapeJobs(request: ScrapeRequest): Promise<ScrapeResult> {
  const payload = JSON.stringify({
    search_term: request.searchTerm,
    location: request.location,
    sites: request.sites,
    results_wanted: request.resultsWanted,
    hours_old: request.hoursOld,
  });

  const raw = await runPython(payload);

  let parsed: { jobs?: unknown[]; notes?: unknown[]; error?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A Python traceback, a pip warning, anything that is not our JSON. Show
    // the first line rather than a parse error nobody can act on.
    const firstLine = raw.trim().split("\n")[0] ?? "";
    throw new Error(
      `The job scraper returned something unreadable. ${
        firstLine ? `It said: ${firstLine}` : "It returned nothing at all."
      }`
    );
  }

  if (parsed.error) throw new Error(parsed.error);

  return {
    jobs: (parsed.jobs ?? []).map(toScrapedJob).filter((job) => job.jobUrl),
    notes: (parsed.notes ?? []).map(String),
  };
}

function runPython(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [scriptPath()], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `The job search took longer than ${TIMEOUT_MS / 1000} seconds and was stopped. ` +
            "Try a smaller number of results, or one site at a time."
        )
      );
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(
              `Could not run "${pythonBin()}". Python is needed for job searching — ` +
                "it is in the Docker image, but a local machine may need it installed. " +
                "Set PYTHON_BIN if yours is somewhere unusual."
            )
          : err
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // The script is written to exit 0 and report failures in its JSON, so a
      // non-zero code means it died before it could — a crash, or a kill.
      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            `The job scraper stopped unexpectedly (exit ${code}). ${
              stderr.trim().split("\n").pop() ?? ""
            }`
          )
        );
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

/** jobspy's column names into ours, tolerating anything missing. */
function toScrapedJob(row: unknown): ScrapedJob {
  const r = (row ?? {}) as Record<string, unknown>;
  const text = (key: string): string => {
    const value = r[key];
    return value === null || value === undefined ? "" : String(value).trim();
  };

  const salary = [text("min_amount"), text("max_amount")]
    .filter(Boolean)
    .join(" - ");

  return {
    externalId: text("id"),
    source: text("site"),
    // job_url_direct points at the employer's own site when the board knows
    // it, which is a better link to hand someone than the aggregator's.
    jobUrl: text("job_url_direct") || text("job_url"),
    title: text("title"),
    company: text("company"),
    location: text("location"),
    description: text("description"),
    datePosted: text("date_posted"),
    jobType: text("job_type"),
    isRemote: text("is_remote").toLowerCase() === "true",
    salaryText: salary
      ? `${salary} ${text("currency")} ${text("interval")}`.trim()
      : "",
    jobLevel: text("job_level"),
    jobFunction: text("job_function"),
    companyIndustry: text("company_industry"),
    companyUrl: text("company_url_direct") || text("company_url"),
    companyNumEmployees: text("company_num_employees"),
  };
}
