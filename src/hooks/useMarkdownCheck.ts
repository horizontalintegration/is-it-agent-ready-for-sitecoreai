"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarkdownCheckData } from "@/lib/markdown/types";

// The panel's P5/P6 data: the open page requested as an agent and as a
// browser through /api/markdown-check (two free requests to the site). Fetched
// on page change and on Re-scan, like the live page.

export type MarkdownCheckStatus = "idle" | "loading" | "done" | "error";

export interface UseMarkdownCheckResult {
  data: MarkdownCheckData | null;
  status: MarkdownCheckStatus;
  refresh: () => void;
}

/**
 * @param pageUrl the published page; nothing is fetched while it's empty
 * @param demo demo mode's fixture: returned as is, nothing is fetched
 */
export function useMarkdownCheck(pageUrl: string, demo: MarkdownCheckData | null): UseMarkdownCheckResult {
  const [state, setState] = useState<{ url: string; data: MarkdownCheckData | null; status: MarkdownCheckStatus }>({
    url: "",
    data: null,
    status: "idle",
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (demo || !pageUrl) return;
    let cancelled = false;
    // A new page clears the old result; a Re-scan keeps it until the new one is in.
    setState((prev) => ({ url: pageUrl, data: prev.url === pageUrl ? prev.data : null, status: "loading" }));
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    // excerpt=1: the start of the HTML, for the Agent View's Before view.
    fetch(`${base}/api/markdown-check?url=${encodeURIComponent(pageUrl)}&excerpt=1`)
      .then((res) => (res.ok ? (res.json() as Promise<MarkdownCheckData>) : Promise.reject(new Error(`markdown-check ${res.status}`))))
      .then((data) => !cancelled && setState({ url: pageUrl, data, status: "done" }))
      .catch(() => !cancelled && setState({ url: pageUrl, data: null, status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [pageUrl, demo, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  if (demo) return { data: demo, status: "done", refresh };
  return state.url === pageUrl ? { data: state.data, status: state.status, refresh } : { data: null, status: pageUrl ? "loading" : "idle", refresh };
}
