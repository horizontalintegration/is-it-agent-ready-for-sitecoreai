"use client";

import { useEffect, useRef, useState } from "react";

// Score history for "▲ N since last scan" and the dashboard's trend line
// (plan section 6.2, item 8). localStorage only (plan section 12, decision 2);
// Phase 8 decides on shared storage for "What changed".

const PAGE_PREFIX = "aiDiscovery:pageScore:v1:";
const SITE_PREFIX = "aiDiscovery:siteHistory:v1:";
const SITE_HISTORY_MAX = 8;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors and blocked storage
  }
}

/**
 * The panel's change since the previous scan of this page. Each time a scan
 * settles, the score from the scan before becomes the baseline and the new score
 * is stored. Draft edits after that show against the baseline without a re-scan.
 *
 * @param pageKey   page id + language; empty while unknown
 * @param settled   false while the page, its draft or an on-demand check is loading
 * @param demoBaseline fixed baseline for demo mode (nothing is stored)
 */
export function useScanDelta(pageKey: string, score: number | null, settled: boolean, demoBaseline?: number): number | null {
  const [baseline, setBaseline] = useState<number | null>(null);
  const recorded = useRef("");
  const scanSeq = useRef(0);

  // Each new scan (settled → not settled) gets its own number.
  useEffect(() => {
    if (!settled) scanSeq.current += 1;
  }, [settled]);

  useEffect(() => {
    if (demoBaseline !== undefined || !pageKey || !settled || score === null) return;
    const token = `${pageKey}#${scanSeq.current}`;
    if (recorded.current === token) return;
    if (!recorded.current.startsWith(`${pageKey}#`)) setBaseline(null);
    recorded.current = token;
    const stored = read<{ score: number }>(PAGE_PREFIX + pageKey);
    setBaseline(stored ? stored.score : null);
    write(PAGE_PREFIX + pageKey, { score, at: new Date().toISOString() });
  }, [pageKey, score, settled, demoBaseline]);

  if (score === null) return null;
  if (demoBaseline !== undefined) return score - demoBaseline;
  return baseline === null ? null : score - baseline;
}

export interface SiteSnapshot {
  at: string;
  score: number;
}

/**
 * The dashboard's last 8 site scores. A snapshot is added when a scan of the
 * site finishes (pages were scanning, and now none are), not on every load.
 */
export function useSiteHistory(
  siteId: string,
  score: number | null,
  scanningCount: number,
  demoHistory?: SiteSnapshot[],
): SiteSnapshot[] {
  const [history, setHistory] = useState<SiteSnapshot[]>([]);
  const wasScanning = useRef(false);

  useEffect(() => {
    if (demoHistory || !siteId) return;
    setHistory(read<SiteSnapshot[]>(SITE_PREFIX + siteId) ?? []);
  }, [siteId, demoHistory]);

  useEffect(() => {
    if (demoHistory || !siteId) return;
    if (scanningCount > 0) {
      wasScanning.current = true;
      return;
    }
    if (!wasScanning.current || score === null) return;
    wasScanning.current = false;
    const next = [...(read<SiteSnapshot[]>(SITE_PREFIX + siteId) ?? []), { at: new Date().toISOString(), score }].slice(-SITE_HISTORY_MAX);
    write(SITE_PREFIX + siteId, next);
    setHistory(next);
  }, [siteId, score, scanningCount, demoHistory]);

  return demoHistory ?? history;
}
