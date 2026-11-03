"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BotRow } from "@/lib/agent-access/grid";
import { citedDelta, normaliseHost } from "@/lib/citations/classify";
import { readOwnHosts, readRuns, RUN_EVENT, siteHostsFor } from "@/lib/citations/storage";
import { localHistoryStore } from "@/lib/history/store";
import {
  accessSnapshot,
  pushSnapshot,
  scanSnapshot,
  whatChanged,
  type AccessSnapshot,
  type CitationChange,
  type ScanSnapshot,
  type WhatChanged,
  type WhatChangedInput,
} from "@/lib/history/what-changed";
import type { PageMatrixRow } from "@/types/dashboard";

// "What changed since last scan" (plan section 6.4). Snapshots go to
// localStorage (plan section 12, decision 2): the pages' scores when a site
// scan finishes, and the agents' results when a new agent-access scan comes
// in. The last two of each are compared, plus the pages' citation probe runs.

const SCANS_PREFIX = "aiDiscovery:scanSnapshots:v1:";
const ACCESS_PREFIX = "aiDiscovery:accessSnapshots:v1:";

export interface UseWhatChangedInput {
  siteId: string;
  siteUrl: string;
  pages: PageMatrixRow[];
  siteScore: number | null;
  scanningCount: number;
  /** botGrid of the current agent-access scan, and its checkedAt. */
  botRows: BotRow[] | null;
  accessCheckedAt: string | null;
  /** Demo mode's snapshots and citation changes: nothing is stored. */
  demo?: WhatChangedInput;
}

export function useWhatChanged({ siteId, siteUrl, pages, siteScore, scanningCount, botRows, accessCheckedAt, demo }: UseWhatChangedInput): WhatChanged {
  const store = localHistoryStore;
  const [scans, setScans] = useState<ScanSnapshot[]>([]);
  const [access, setAccess] = useState<AccessSnapshot[]>([]);
  const [runVersion, setRunVersion] = useState(0);
  const wasScanning = useRef(false);
  const accessKey = ACCESS_PREFIX + siteUrl.trim().toLowerCase().replace(/\/+$/, "");

  useEffect(() => {
    if (demo || !siteId) return;
    setScans(store.read<ScanSnapshot[]>(SCANS_PREFIX + siteId) ?? []);
  }, [siteId, demo, store]);

  // A snapshot when a scan of the site finishes (pages were scanning, and now none are).
  useEffect(() => {
    if (demo || !siteId) return;
    if (scanningCount > 0) {
      wasScanning.current = true;
      return;
    }
    if (!wasScanning.current) return;
    wasScanning.current = false;
    const next = pushSnapshot(store.read<ScanSnapshot[]>(SCANS_PREFIX + siteId) ?? [], scanSnapshot(pages, siteScore, new Date().toISOString()));
    store.write(SCANS_PREFIX + siteId, next);
    setScans(next);
  }, [siteId, scanningCount, pages, siteScore, demo, store]);

  // A snapshot per agent-access scan; reading the same scan from the cache adds none.
  useEffect(() => {
    if (demo || !siteUrl) return;
    const stored = store.read<AccessSnapshot[]>(accessKey) ?? [];
    if (!botRows || !accessCheckedAt) {
      setAccess(stored);
      return;
    }
    const next = pushSnapshot(stored, accessSnapshot(botRows, accessCheckedAt));
    if (next !== stored) store.write(accessKey, next);
    setAccess(next);
  }, [siteUrl, accessKey, botRows, accessCheckedAt, demo, store]);

  useEffect(() => {
    const bump = () => setRunVersion((v) => v + 1);
    window.addEventListener(RUN_EVENT, bump);
    return () => window.removeEventListener(RUN_EVENT, bump);
  }, []);

  const citations = useMemo<CitationChange[]>(() => {
    if (demo || typeof window === "undefined" || !siteUrl) return [];
    void runVersion;
    const hosts = siteHostsFor(siteUrl, readOwnHosts(store, normaliseHost(siteUrl)));
    // Only runs since the last scan snapshot was taken: older changes aren't news.
    const since = scans.length >= 2 ? Date.parse(scans[scans.length - 2].at) : 0;
    const changes: CitationChange[] = [];
    for (const p of pages) {
      const runs = readRuns(store, p.pageUrl);
      const delta = citedDelta(runs, hosts, p.pageUrl);
      const at = runs.at(-1)?.at ?? "";
      if (delta !== null && delta !== 0 && Date.parse(at) > since) changes.push({ route: p.route, delta, at });
    }
    return changes;
  }, [demo, siteUrl, pages, scans, runVersion, store]);

  return useMemo(() => (demo ? whatChanged(demo) : whatChanged({ scans, access, citations })), [demo, scans, access, citations]);
}
