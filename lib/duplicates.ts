import { createHash } from "node:crypto";

import type { DuplicateMatch, DuplicateReason } from "@/lib/types";

/**
 * Works out whether a pasted advert is one you have already applied to.
 *
 * Everything here is a pure function over strings — no PocketBase, no network,
 * no clock — so the matching can be tested directly rather than through a
 * generation run.
 *
 * The check runs BEFORE the Gemini call, so noticing a duplicate costs nothing.
 *
 * The failure mode that would kill this feature is not missing a duplicate. It
 * is crying wolf: two genuinely different roles at the same employer share
 * pages of identical boilerplate about benefits, values and equal
 * opportunities. Flag those and the warning gets ignored, including the time it
 * is right. Every threshold below is set to be quiet rather than eager.
 */

/**
 * A truncated re-paste is the common case — the header, the "apply now"
 * footer, or the benefits block gets left behind — and plain Jaccard punishes
 * that hard, because it counts everything the shorter copy is missing against
 * it. Measured on a real pair: a truncated copy scored 0.75 by Jaccard, which
 * is under any threshold safe enough to use.
 *
 * Containment asks the better question — how much of the SHORTER advert
 * appears in the longer one — and separates the cases cleanly. On the same
 * pair: 0.95 for the truncated copy, 0.59 for a different role at the same
 * employer.
 */
const CONTAINMENT_THRESHOLD = 0.9;

/**
 * Containment alone would flag an advert that is nothing but boilerplate, since
 * that IS wholly contained in any advert from the same company (measured: 1.00).
 * Below this many significant words there is not enough advert to judge, so
 * the stricter Jaccard test is used instead.
 */
const MIN_WORDS_FOR_CONTAINMENT = 40;

/** Fallback for short adverts, where containment cannot be trusted. */
const JACCARD_THRESHOLD = 0.85;

/**
 * Words carrying no signal about WHICH job this is. Kept deliberately short:
 * over-trimming makes two unrelated adverts look alike, which is the failure
 * that matters.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "you", "our", "will", "with", "your", "are", "have",
  "this", "that", "from", "who", "all", "any", "can", "has", "not", "but",
  "they", "their", "them", "its", "his", "her", "was", "were", "been", "being",
  "would", "could", "should", "may", "might", "must", "shall", "into", "onto",
  "about", "over", "under", "than", "then", "when", "where", "what", "which",
  "role", "job", "work", "working", "team", "company", "candidate",
  "experience", "skills", "apply", "application", "please", "well", "also",
  "more", "most", "some", "such", "other", "within", "across", "including",
]);

/**
 * Strips everything that changes between two copies of the same advert but
 * carries no meaning: case, URLs, punctuation, and whitespace of every kind.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A stable fingerprint of the normalised advert, for exact re-pastes. */
export function fingerprint(text: string): string {
  return createHash("sha256").update(normalise(text)).digest("hex");
}

/** The words that actually say which job this is. */
export function significantWords(text: string): Set<string> {
  const words = normalise(text).split(" ");
  const out = new Set<string>();
  for (const word of words) {
    if (word.length < 3) continue;
    if (STOP_WORDS.has(word)) continue;
    out.add(word);
  }
  return out;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  // Iterate the smaller set: the result is the same, the work is not.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const word of small) if (large.has(word)) shared++;
  return shared;
}

/**
 * Jaccard similarity: the share of the two adverts' combined vocabulary that
 * they have in common. Order-insensitive, so a re-paste with its sections
 * moved around still scores high.
 */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = sharedCount(a, b);
  return shared / (a.size + b.size - shared);
}

/**
 * How much of the shorter advert appears in the longer one. Unlike Jaccard
 * this does not penalise a copy for the parts that were trimmed off it.
 */
export function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return sharedCount(a, b) / Math.min(a.size, b.size);
}

/** Is this the same advert, allowing for a trimmed or messier copy? */
function isNearIdentical(a: Set<string>, b: Set<string>): number {
  const smaller = Math.min(a.size, b.size);

  if (smaller >= MIN_WORDS_FOR_CONTAINMENT) {
    const score = containment(a, b);
    return score >= CONTAINMENT_THRESHOLD ? score : 0;
  }

  const score = similarity(a, b);
  return score >= JACCARD_THRESHOLD ? score : 0;
}

/** Is `phrase` present in `text` as a whole phrase, not as a fragment? */
function containsPhrase(normalisedText: string, phrase: string): boolean {
  const needle = normalise(phrase);
  // Two characters is not a company name, it is a coincidence waiting to
  // happen — "AI" would match half the adverts he ever pastes.
  if (needle.length < 3) return false;
  return ` ${normalisedText} `.includes(` ${needle} `);
}

/** What a past application needs to expose for the check to work. */
export interface PastApplication {
  id: string;
  job_title: string;
  company: string;
  created: string;
  job_description: string;
}

/**
 * The best match among past applications, or null.
 *
 * Signals are tried strongest first and the first hit wins, so the message can
 * say something true and specific rather than "this looks a bit similar".
 */
export function findDuplicate(
  jobDescription: string,
  past: PastApplication[]
): DuplicateMatch | null {
  const text = normalise(jobDescription);
  if (!text) return null;

  const mine = fingerprint(jobDescription);
  const myWords = significantWords(jobDescription);

  let best: DuplicateMatch | null = null;

  for (const record of past) {
    const stored = record.job_description ?? "";

    // 1. The same advert, pasted again.
    if (stored && fingerprint(stored) === mine) {
      return match(record, "identical", 1);
    }

    // 2. The same advert from a slightly different copy.
    if (stored) {
      const score = isNearIdentical(myWords, significantWords(stored));
      if (score > 0) {
        if (!best || score > best.score) {
          best = match(record, "near-identical", score);
        }
        continue;
      }
    }

    // 3. The same job found somewhere else, worded differently.
    //
    // BOTH the company and the job title must appear. The company alone is
    // what would make this feature annoying: a second, unrelated vacancy at an
    // employer he has applied to before is not a duplicate.
    const company = (record.company ?? "").trim();
    const title = (record.job_title ?? "").trim();
    if (
      company &&
      title &&
      containsPhrase(text, company) &&
      containsPhrase(text, title)
    ) {
      if (!best) best = match(record, "same-role", 0);
    }
  }

  return best;
}

function match(
  record: PastApplication,
  reason: DuplicateReason,
  score: number
): DuplicateMatch {
  return {
    id: record.id,
    job_title: record.job_title || "Untitled role",
    company: record.company || "",
    created: record.created || "",
    reason,
    score,
  };
}
