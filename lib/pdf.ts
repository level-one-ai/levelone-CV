import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { chromium, type Browser } from "playwright-core";

/**
 * Turns finished HTML into an A4 PDF, using headless Chromium.
 *
 * This is the same engine Gotenberg wraps in a Docker container — Gotenberg is
 * a headless Chromium with an HTTP API in front of it. Driving Chromium
 * directly gives identical output with no container to run, no network hop and
 * no second service to keep alive. The trade is that Chromium has to exist
 * wherever this app runs.
 */

/**
 * Chromium builds Playwright has already downloaded, if any.
 * The folder is named per build (chromium-1194), so the version is discovered
 * rather than pinned — a Playwright upgrade must not break PDF generation.
 */
function playwrightChromiums(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((entry) => entry.startsWith("chromium-"))
      .flatMap((entry) => [
        path.join(root, entry, "chrome-linux", "chrome"),
        path.join(root, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        path.join(root, entry, "chrome-win", "chrome.exe"),
      ]);
  } catch {
    return [];
  }
}

/**
 * Finds a Chromium to print with.
 *
 * Most machines already have Google Chrome or Edge installed, so this looks
 * for one before asking anyone to download 150MB. PDF_CHROMIUM_PATH always
 * wins when it is set.
 */
function executablePath(): string | undefined {
  const explicit = process.env.PDF_CHROMIUM_PATH?.trim();
  if (explicit) return explicit;

  const browsersRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(process.env.HOME ?? "", ".cache", "ms-playwright");

  const candidates = [
    ...playwrightChromiums(browsersRoot),
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function describeLaunchFailure(err: unknown): Error {
  const message = String((err as Error)?.message ?? err);

  if (/Executable doesn't exist|browserType.launch|ENOENT/i.test(message)) {
    return new Error(
      "Could not find a Chrome or Chromium to turn your CV into a PDF.\n" +
        "If you have Google Chrome installed, set PDF_CHROMIUM_PATH in .env.local\n" +
        "to point at it. Otherwise install one once with:\n" +
        "  npx playwright install --with-deps chromium"
    );
  }
  if (/libnss3|libatk|shared librar/i.test(message)) {
    return new Error(
      "Chromium is installed but is missing some system libraries.\n" +
        "Install them with:  npx playwright install-deps chromium\n" +
        `Original error: ${message}`
    );
  }
  return new Error(`Could not render the PDF: ${message}`);
}

export interface RenderedPdf {
  bytes: Buffer;
  /** How many A4 sides the CV actually came to. */
  pages: number;
}

/**
 * Counts pages without a PDF parser. Chromium writes one /Type /Page object
 * per sheet, and /Type /Pages (plural) once for the tree — the negative
 * lookahead is what keeps the tree node out of the count.
 */
function countPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 1;
}

export async function renderPdf(html: string): Promise<RenderedPdf> {
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      executablePath: executablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (err) {
    throw describeLaunchFailure(err);
  }

  try {
    const page = await browser.newPage();

    // The template inlines everything — styles, and the photo as a data URI —
    // so there is nothing to fetch. "load" is enough and cannot hang on a
    // network request that will never come.
    await page.setContent(html, { waitUntil: "load" });

    // Chromium only applies @media print rules when told to emulate print.
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // The template owns its own margins via @page, so Chromium adds none.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const bytes = Buffer.from(pdf);
    return { bytes, pages: countPages(bytes) };
  } finally {
    // Always close, even if page.pdf threw — a leaked Chromium is several
    // hundred MB that never comes back.
    await browser.close().catch(() => {});
  }
}
