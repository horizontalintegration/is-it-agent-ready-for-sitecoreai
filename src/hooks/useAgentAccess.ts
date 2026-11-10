"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentAccessData } from "@/lib/agent-access/types";

// The site checks' data (S1–S12) from /api/agent-access: about 50 requests to
// the customer's site, so it's fetched once per domain and kept in
// localStorage for an hour. The panel reads the same entry on every page; the
// dashboard's Scan site calls `refresh`, which skips the cache.
const KEY_PREFIX = "aiDiscovery:agentAccess:v1:";
const TTL_MS = 60 * 60 * 1000;

export type AgentAccessStatus = "idle" | "loading" | "done" | "error";

export interface UseAgentAccessResult {
  data: AgentAccessData | null;
  status: AgentAccessStatus;
  /** Scan again, ignoring the cache. */
  refresh: () => void;
}

const keyFor = (siteUrl: string) => KEY_PREFIX + siteUrl.trim().toLowerCase().replace(/\/+$/, "");

function readCache(siteUrl: string): AgentAccessData | null {
  try {
    const raw = window.localStorage.getItem(keyFor(siteUrl));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { at: number; data: AgentAccessData };
    return Date.now() - entry.at < TTL_MS ? entry.data : null;
  } catch {
    return null;
  }
}

function writeCache(siteUrl: string, data: AgentAccessData) {
  try {
    window.localStorage.setItem(keyFor(siteUrl), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore quota errors: the next load scans again
  }
}

/**
 * @param siteUrl the site's domain or origin; nothing is fetched while it's empty
 * @param demo demo mode's fixture: returned as is, nothing is fetched
 */
export function useAgentAccess(siteUrl: string, demo: AgentAccessData | null): UseAgentAccessResult {
  const [state, setState] = useState<{ data: AgentAccessData | null; status: AgentAccessStatus }>({ data: null, status: "idle" });
  // Bumped by `refresh`: a non-zero value skips the cache.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (demo || !siteUrl) return;
    const cached = nonce === 0 ? readCache(siteUrl) : null;
    if (cached) {
      setState({ data: cached, status: "done" });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ data: prev.data, status: "loading" }));
    fetch(`/api/agent-access?domain=${encodeURIComponent(siteUrl)}`)
      .then((res) => (res.ok ? (res.json() as Promise<AgentAccessData>) : Promise.reject(new Error(`agent-access ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        writeCache(siteUrl, data);
        setState({ data, status: "done" });
      })
      .catch(() => !cancelled && setState({ data: null, status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [siteUrl, demo, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return demo ? { data: demo, status: "done", refresh } : { ...state, refresh };
}
