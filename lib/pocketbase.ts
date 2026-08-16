import PocketBase from "pocketbase";

export const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "http://127.0.0.1:8090";

export const COLLECTIONS = {
  profile: "cv_profile",
  experience: "cv_experience",
  projects: "cv_projects",
  applications: "applications",
} as const;

/**
 * Server-side PocketBase client, authenticated as the superuser.
 *
 * Unlike the proposal engine — where the `proposals` collection is public —
 * every collection here holds personal data (home address, phone number, work
 * history), so all five keep PocketBase's default locked API rules and are
 * only ever reached from route handlers running on the server. Nothing in
 * `components/` imports this file.
 */
export async function superuserClient(): Promise<PocketBase> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set — see SETUP.md step 3."
    );
  }

  const pb = new PocketBase(POCKETBASE_URL);
  pb.autoCancellation(false);

  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (err) {
    throw new Error(
      `Could not sign in to PocketBase as a superuser. ${describePocketBaseError(err)}`
    );
  }

  return pb;
}

interface PocketBaseErrorShape {
  status?: number;
  message?: string;
  response?: {
    message?: string;
    data?: Record<string, { message?: string }>;
  };
}

/**
 * Turns a PocketBase failure into a sentence that names the real cause — an
 * unreachable host, a missing collection, a rejected field — instead of a
 * generic "could not save". Without this the actual reason only ever reaches
 * the server log while the UI shows nothing useful.
 */
export function describePocketBaseError(err: unknown): string {
  const e = err as PocketBaseErrorShape;
  const status = e?.status ?? 0;

  const fieldErrors = Object.entries(e?.response?.data ?? {})
    .map(([field, detail]) => `${field}: ${detail?.message ?? "invalid"}`)
    .join("; ");

  if (status === 0) {
    return `Could not reach PocketBase at ${POCKETBASE_URL}. Check NEXT_PUBLIC_POCKETBASE_URL and that the server is running.`;
  }
  if (status === 401 || status === 403) {
    return `PocketBase refused the request (${status}). Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD match the superuser account you created.`;
  }
  if (status === 404) {
    return `PocketBase returned 404 — a collection is missing at ${POCKETBASE_URL}. Confirm every collection in SETUP.md step 4 exists and is spelled exactly as listed.`;
  }
  if (status === 400) {
    return `PocketBase rejected the record (400)${fieldErrors ? ` — ${fieldErrors}` : ""}.`;
  }
  return `PocketBase error ${status}${fieldErrors ? ` — ${fieldErrors}` : ""}: ${
    e?.response?.message ?? e?.message ?? "unknown error"
  }`;
}
