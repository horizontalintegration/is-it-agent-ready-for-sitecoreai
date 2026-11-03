// ─────────────────────────────────────────────────────────────────────────────
// Found, Cited and "cited instead", computed from a probe's evidence (plan
// section 8, Layer 2, item 3). Runs in the browser and on the server.
//
// "The site" is its host plus any hosts the user marks as its own (dev,
// staging, regional domains); otherwise those show up as competitors
// (SPIKE-FINDINGS §5, item 7). A host matches itself and its subdomains, with
// "www." ignored.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProbeEvidence, ProbeOutcome, ProbeRun } from "./types";

/** Lower-case hostname without "www.", or "" for something that isn't a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** "https://www.Example.com/x" or "example.com" → "example.com". */
export function normaliseHost(input: string): string {
  const s = input.trim();
  if (!s) return "";
  return hostOf(/^https?:\/\//i.test(s) ? s : `https://${s}`);
}

export function matchesHosts(url: string, hosts: readonly string[]): boolean {
  const h = hostOf(url);
  return h !== "" && hosts.some((own) => h === own || h.endsWith(`.${own}`));
}

/** The URL without protocol, "www.", query, hash or trailing slash, for comparing pages. */
function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export function classify(evidence: ProbeEvidence, siteHosts: readonly string[], pageUrl: string): ProbeOutcome {
  const page = pageKey(pageUrl);
  const isPage = (u: string) => page !== "" && pageKey(u) === page;
  const citedInstead = [...new Set(evidence.citedUrls.filter((u) => !matchesHosts(u, siteHosts)).map(hostOf).filter(Boolean))];
  if (!evidence.searched) {
    return { found: null, cited: null, pageFound: false, pageCited: false, citedInstead };
  }
  return {
    found: evidence.resultUrls.some((u) => matchesHosts(u, siteHosts)),
    cited: evidence.citedUrls.some((u) => matchesHosts(u, siteHosts)),
    pageFound: evidence.resultUrls.some(isPage),
    pageCited: evidence.citedUrls.some(isPage),
    citedInstead,
  };
}

export interface ProbeTotals {
  /** Questions that searched: the "of N" in the totals. */
  searched: number;
  notSearched: number;
  cited: number;
  found: number;
  /** Found in the search results, but the answer cited others. */
  foundNotCited: number;
  /** The host cited most often instead of the site, and in how many answers. */
  topInstead: { host: string; count: number } | null;
}

export function probeTotals(outcomes: ProbeOutcome[]): ProbeTotals {
  const searched = outcomes.filter((o) => o.found !== null);
  const counts = new Map<string, number>();
  for (const o of outcomes) for (const h of o.citedInstead) counts.set(h, (counts.get(h) ?? 0) + 1);
  let topInstead: ProbeTotals["topInstead"] = null;
  for (const [host, count] of counts) {
    if (!topInstead || count > topInstead.count) topInstead = { host, count };
  }
  return {
    searched: searched.length,
    notSearched: outcomes.length - searched.length,
    cited: searched.filter((o) => o.cited).length,
    found: searched.filter((o) => o.found).length,
    foundNotCited: searched.filter((o) => o.found && !o.cited).length,
    topInstead,
  };
}

/** "Cited in N of M" for a stored run. */
export function runTotals(run: ProbeRun, siteHosts: readonly string[], pageUrl: string): ProbeTotals {
  return probeTotals(run.evidence.map((e) => classify(e, siteHosts, pageUrl)));
}

/**
 * Change in the cited count since the previous run of the same question set,
 * or null when there's no such run (different questions aren't comparable).
 */
export function citedDelta(runs: ProbeRun[], siteHosts: readonly string[], pageUrl: string): number | null {
  if (runs.length < 2) return null;
  const latest = runs[runs.length - 1];
  const previous = [...runs.slice(0, -1)].reverse().find((r) => r.setKey === latest.setKey);
  if (!previous) return null;
  return runTotals(latest, siteHosts, pageUrl).cited - runTotals(previous, siteHosts, pageUrl).cited;
}
