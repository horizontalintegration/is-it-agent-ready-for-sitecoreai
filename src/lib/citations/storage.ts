// ─────────────────────────────────────────────────────────────────────────────
// What the AI citations tab keeps in the browser (plan section 12, decision 2:
// localStorage only). Through HistoryStore, so it can move to shared storage.
//   questions  the edited question set and country, per page
//   hosts      extra hosts the user counts as the site's own, per site
//   probe      one question's evidence, reused for 7 days
//   runs       the last 10 runs per page, for the trend and "What changed"
// ─────────────────────────────────────────────────────────────────────────────

import { contentKey } from "@/lib/ai/content-key";
import type { HistoryStore } from "@/lib/history/store";
import { normaliseHost } from "./classify";
import { PROBE_CACHE_MS, type ProbeEvidence, type ProbeRun } from "./types";

const QUESTIONS_PREFIX = "aiDiscovery:citationQuestions:v1:";
const HOSTS_PREFIX = "aiDiscovery:citationHosts:v1:";
const PROBE_PREFIX = "aiDiscovery:citationProbe:v1:";
const RUNS_PREFIX = "aiDiscovery:citationRuns:v1:";

export const RUNS_MAX = 10;

/** Fired on window when a run is stored, so the Overview's "What changed" can re-read. */
export const RUN_EVENT = "aiDiscovery:citationRun";

export interface SavedQuestions {
  questions: string[];
  country: string | null;
}

export const readQuestions = (store: HistoryStore, pageUrl: string) => store.read<SavedQuestions>(QUESTIONS_PREFIX + pageUrl);
export const writeQuestions = (store: HistoryStore, pageUrl: string, saved: SavedQuestions) => store.write(QUESTIONS_PREFIX + pageUrl, saved);

export const readOwnHosts = (store: HistoryStore, siteHost: string) => store.read<string[]>(HOSTS_PREFIX + siteHost) ?? [];
export const writeOwnHosts = (store: HistoryStore, siteHost: string, hosts: string[]) => store.write(HOSTS_PREFIX + siteHost, hosts);

/** The site's host plus the extra hosts, normalised and without duplicates. */
export function siteHostsFor(siteUrl: string, extra: string[]): string[] {
  return [...new Set([normaliseHost(siteUrl), ...extra.map(normaliseHost)].filter(Boolean))];
}

export const readRuns = (store: HistoryStore, pageUrl: string) => store.read<ProbeRun[]>(RUNS_PREFIX + pageUrl) ?? [];

export function appendRun(store: HistoryStore, pageUrl: string, run: ProbeRun): ProbeRun[] {
  const runs = [...readRuns(store, pageUrl), run].slice(-RUNS_MAX);
  store.write(RUNS_PREFIX + pageUrl, runs);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUN_EVENT));
  return runs;
}

/** Identifies a question set and country, so only runs of the same set are compared. */
export const setKeyOf = (questions: string[], country: string | null) => contentKey(["citation-set", country ?? "", ...questions]);

export const probeCacheKey = async (pageUrl: string, question: string, country: string | null) =>
  PROBE_PREFIX + (await contentKey(["citation-probe", pageUrl, question, country ?? ""]));

/** A cached probe younger than 7 days; an expired one is removed. */
export function readCachedProbe(store: HistoryStore, key: string, now = Date.now()): ProbeEvidence | null {
  const hit = store.read<{ at: number; evidence: ProbeEvidence }>(key);
  if (!hit) return null;
  if (now - hit.at >= PROBE_CACHE_MS) {
    store.remove(key);
    return null;
  }
  return hit.evidence;
}

/** `at` is when the probe ran, so a result the server had cached expires on the same day here. */
export function writeCachedProbe(store: HistoryStore, key: string, evidence: ProbeEvidence): void {
  const ran = Date.parse(evidence.ranAt);
  store.write(key, { at: Number.isFinite(ran) ? ran : Date.now(), evidence });
}
