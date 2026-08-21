import type PocketBase from "pocketbase";

import { findDuplicate, type PastApplication } from "@/lib/duplicates";
import type { StoredJob } from "@/lib/jobs";
import { COLLECTIONS } from "@/lib/pocketbase";
import type { DuplicateMatch } from "@/lib/types";

/**
 * "You have applied to this before."
 *
 * Server-only, and in its own file for a reason that is not obvious: the
 * matcher in `lib/duplicates.ts` hashes with `node:crypto`, and `lib/jobs.ts`
 * is imported by the job board, which is a client component. Putting this in
 * `lib/jobs.ts` pulled a Node built-in into the browser bundle and broke the
 * build. Here, only server code ever touches it.
 *
 * Worked out when the list is read rather than stored, so it is never stale and
 * needs no PocketBase field: apply to something today and every matching job
 * says so immediately.
 */

/**
 * Everything already applied to, for the "you have been here before" check.
 *
 * One read for the whole list rather than one per job, and only the four fields
 * the matcher looks at — the descriptions alone are 30KB each, and pulling the
 * generated CVs back as well would make loading the board slower than searching.
 */
export async function pastApplications(pb: PocketBase): Promise<PastApplication[]> {
  try {
    const records = await pb.collection(COLLECTIONS.applications).getList(1, 200, {
      sort: "-created",
      fields: "id,job_title,company,created,job_description",
    });
    return records.items as unknown as PastApplication[];
  } catch {
    // No applications collection yet, or it could not be read. A missing
    // warning is a far smaller problem than a job board that will not load.
    return [];
  }
}

/**
 * Has he applied to this job already?
 *
 * `findDuplicate` was written for the paste flow, where the whole advert is the
 * only thing there is. A scraped job knows more: the company and the title are
 * their own fields, and the "same role, worded differently" test needs both to
 * appear in the text. So they are put back in front of the description before
 * the check runs — otherwise a job advert that never repeats its own employer's
 * name could never match, which is most of them.
 */
export function alreadyApplied(
  job: Pick<StoredJob, "title" | "company" | "description">,
  past: PastApplication[]
): DuplicateMatch | null {
  if (!job.description && !job.title) return null;
  return findDuplicate(`${job.title}\n${job.company}\n${job.description}`, past);
}


/** Fills in `duplicate` on a list of jobs, with one read for the whole list. */
export async function withDuplicates(
  pb: PocketBase,
  jobs: StoredJob[]
): Promise<StoredJob[]> {
  if (!jobs.length) return jobs;

  const past = await pastApplications(pb);
  if (!past.length) return jobs;

  return jobs.map((job) => ({ ...job, duplicate: alreadyApplied(job, past) }));
}
