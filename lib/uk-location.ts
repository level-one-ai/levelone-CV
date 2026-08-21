/**
 * Deciding whether a remote job is actually open to someone in the UK.
 *
 * The searches are already scoped to the UK — LinkedIn by location string,
 * Indeed and Glassdoor by country code — so this is not trying to PROVE a job
 * is British. It is catching the leakage, which is real: "Remote" listings
 * routinely come back from a UK-scoped search advertising a role in Austin or
 * Bangalore, because the board matched on the word rather than the place.
 *
 * So the polarity is deliberate: **keep unless the location clearly names
 * somewhere else.** An allow-list would throw away every advert that says
 * nothing more than "Remote", which is most of them.
 *
 * Pure string functions, no network, so the rules are testable against real
 * location strings rather than through a scrape.
 */

import { mentions } from "@/lib/job-filter";

/**
 * Cities Dean already covers with the local search.
 *
 * A remote run is for widening the net, so a remote job in Edinburgh is not a
 * new option — it is the same option arriving twice.
 */
export const HOME_CITIES = ["edinburgh", "glasgow"];

/** Countries and regions that mean "not the UK", spelled as boards spell them. */
const FOREIGN_PLACES = [
  "united states",
  "usa",
  "u.s.",
  "canada",
  "india",
  "pakistan",
  "germany",
  "france",
  "spain",
  "portugal",
  "italy",
  "netherlands",
  "belgium",
  "poland",
  "romania",
  "ukraine",
  "sweden",
  "norway",
  "denmark",
  "switzerland",
  "australia",
  "new zealand",
  "singapore",
  "japan",
  "china",
  "brazil",
  "mexico",
  "argentina",
  "south africa",
  "nigeria",
  "kenya",
  "egypt",
  "israel",
  "turkey",
  "dubai",
  "abu dhabi",
  "united arab emirates",
  "saudi arabia",
  "qatar",
  "ireland",
  "dublin",
];

/**
 * "Remote anywhere on earth" is not a UK job in any useful sense — it is a
 * global pool, usually paid on another continent's terms and often needing
 * work authorisation Dean does not have.
 */
const GLOBAL_MARKERS = [
  "worldwide",
  "anywhere in the world",
  "global remote",
  "remote - global",
  "latam",
  "apac",
];

/**
 * US state and Canadian province codes, matched only as a trailing ", XX".
 *
 * "Remote, TX" and "London, ON" both come back from UK-scoped searches. Only
 * the trailing form is matched, because two capital letters anywhere in a
 * string is not evidence of anything.
 */
const NORTH_AMERICAN_CODES = new Set([
  // Country codes, which appear in the same trailing position. "US" cannot go
  // in the word list above: `mentions(text, "us")` would match "contact us",
  // "join us" and "us and them", which appear in half of all job adverts.
  // Matched only as a trailing ", US", it is unambiguous.
  "US","IE","DE","FR","ES","IT","NL","BE","PL","SE","NO","DK","CH","PT",
  "IN","PK","AU","NZ","SG","JP","CN","BR","MX","ZA","AE","SA","IL","TR",
  // Note the absence of GB, UK, EN, SC, WA(les) — WA is Washington State,
  // which is why Wales is spelled out in the word list instead.
  "AL","AK","AZ","AR","CA","CO","CT","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK",
]);

/** Is this location somewhere other than the UK? */
export function looksForeign(location: string): boolean {
  const text = (location ?? "").trim();
  if (!text) return false;

  // "Northern Ireland" contains "ireland", and is very much the UK. Take it
  // out of consideration before the country list runs.
  const withoutNi = text.replace(/northern\s+ireland/gi, " ");

  if (FOREIGN_PLACES.some((place) => mentions(withoutNi, place))) return true;
  if (GLOBAL_MARKERS.some((marker) => mentions(text, marker))) return true;

  const trailingCode = text.match(/,\s*([A-Z]{2})\s*$/);
  if (trailingCode && NORTH_AMERICAN_CODES.has(trailingCode[1])) return true;

  return false;
}

/** Is this one of the cities the local search already covers? */
export function isHomeCity(location: string): boolean {
  return HOME_CITIES.some((city) => mentions(location ?? "", city));
}

export interface RemoteVerdict {
  keep: boolean;
  reason: string;
}

/**
 * Should a remote-search result be kept?
 *
 * Two rejections, for two different reasons: somewhere that is not the UK, and
 * somewhere Dean already searches directly.
 */
export function keepRemoteJob(job: {
  location: string;
  isRemote: boolean;
  description: string;
}): RemoteVerdict {
  const location = job.location ?? "";

  if (looksForeign(location)) {
    return { keep: false, reason: `outside the UK (${location})` };
  }

  if (isHomeCity(location)) {
    return { keep: false, reason: `${location} is covered by the local search` };
  }

  // A board's own remote flag is the best signal, but plenty of genuinely
  // remote adverts never set it — so fall back to the advert saying so.
  const saysRemote =
    job.isRemote ||
    mentions(location, "remote") ||
    /\b(fully|100%|entirely)\s+remote\b/i.test(job.description ?? "") ||
    /\bremote[- ]first\b/i.test(job.description ?? "");

  if (!saysRemote) {
    return { keep: false, reason: `not a remote role (${location})` };
  }

  return { keep: true, reason: "" };
}
