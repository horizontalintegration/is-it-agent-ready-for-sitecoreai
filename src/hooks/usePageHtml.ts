"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The Page Builder draft (plan section 7). `client.getPageHTML()` returns the
// canvas as a string, unsaved edits included, in about 30–50 ms
// (SPIKE-FINDINGS §3). It's a snapshot, so it's read again after every field
// update (debounced) and on page change. Every capture is sanitised before
// it's parsed, so no check sees raw editor output.
//
// Right after a page opens, Page Builder may not serve getPageHTML yet, so a
// page's first read is retried. When it still isn't available (the call
// rejects or returns nothing), the status is "unavailable" and the panel
// scores the live page, as before.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { sanitiseDraftHtml } from "@/lib/html/sanitise-draft";
import type { DraftHtml } from "@/lib/checks/types";

/** Wait after a page change or field update before reading the canvas. */
const DEBOUNCE_MS = 1500;
/** Waits before each retry while a page has no draft yet: about 15 s in all. */
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/**
 * - `idle`: not read yet (no page, or demo mode).
 * - `loading`: a read is pending, running or being retried.
 * - `ready`: `draft` holds the latest capture.
 * - `unavailable`: getPageHTML failed for this page; the body checks use live.
 */
export type DraftStatus = "idle" | "loading" | "ready" | "unavailable";

interface UsePageHtmlInput {
  client: ClientSDK | null;
  /** Identifies the open page (id and language). Empty when there's none. */
  pageKey: string;
  /** From usePageFields; each change re-reads the draft. */
  contentVersion: number;
  /** False in demo mode: the fixture holds the draft. */
  enabled: boolean;
}

interface UsePageHtmlResult {
  draft: DraftHtml | null;
  status: DraftStatus;
  capturedAt: Date | null;
  /** Read the draft now (Re-scan page). */
  refresh: () => void;
}

type ReadResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

interface RetryOptions {
  /** Wait before each retry; no retries when empty. */
  delays: number[];
  /** False once a newer read has started: stop and return null. */
  isCurrent: () => boolean;
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `read` until it succeeds or the delays run out. Returns null when a
 * newer read took over, so a stale result never sets state.
 */
export async function readWithRetry<T>(read: () => Promise<T>, options: RetryOptions): Promise<ReadResult<T> | null> {
  const { delays, isCurrent, onRetry, sleep = wait } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await read();
      return isCurrent() ? { ok: true, value } : null;
    } catch (error) {
      if (!isCurrent()) return null;
      const delay = delays[attempt];
      if (delay === undefined) return { ok: false, error };
      onRetry?.(attempt + 1, delay, error);
      await sleep(delay);
      if (!isCurrent()) return null;
    }
  }
}

export function usePageHtml({ client, pageKey, contentVersion, enabled }: UsePageHtmlInput): UsePageHtmlResult {
  const [draft, setDraft] = useState<DraftHtml | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);

  // Only the latest read may set state, so a slow read can't overwrite a newer one.
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDraftRef = useRef(false);

  const capture = useCallback(async () => {
    if (!client || !enabled || !pageKey) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++requestRef.current;
    setStatus("loading");

    const result = await readWithRetry(
      async () => {
        const raw = await client.getPageHTML();
        if (typeof raw !== "string" || !raw.trim()) throw new Error("getPageHTML returned no HTML");
        return raw;
      },
      {
        // Without a draft yet, the canvas may still be loading: Page Builder
        // answers "[CANVAS BUG] Service implementation is not provided" until
        // it has (seen on 2026-11-02). The status stays "loading" meanwhile,
        // so the rows and the AI checks wait for the draft.
        delays: hasDraftRef.current ? [] : RETRY_DELAYS_MS,
        isCurrent: () => id === requestRef.current,
        onRetry: (attempt, delay, err) =>
          console.info(`[draft] getPageHTML not ready (attempt ${attempt}); trying again in ${delay / 1000} s:`, err),
      },
    );
    if (!result) return; // a newer read took over

    if (result.ok) {
      const raw = result.value;
      const clean = sanitiseDraftHtml(raw);
      const html = extractParsedHtml(clean.html);
      console.info(
        `[draft] getPageHTML: ${raw.length} chars, ${html.mainText.length} chars of main text; removed`,
        clean.removed,
        clean.emptyStates.length > 0 ? `empty states: ${clean.emptyStates.join(" | ")}` : "",
      );
      hasDraftRef.current = true;
      setDraft({ html, source: clean.html, emptyStates: clean.emptyStates });
      setCapturedAt(new Date());
      setStatus("ready");
    } else if (hasDraftRef.current) {
      // Keep a draft this page already has: one failed refresh shouldn't swap
      // the body checks to live mid-edit.
      console.warn("[draft] getPageHTML refresh failed; keeping the previous capture:", result.error);
      setStatus("ready");
    } else {
      console.warn("[draft] getPageHTML unavailable; the body checks use the live page:", result.error);
      setStatus("unavailable");
    }
  }, [client, enabled, pageKey]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void capture(), DEBOUNCE_MS);
  }, [capture]);

  // Page change: drop the previous page's draft and read the new one once the
  // canvas has had time to load it.
  useEffect(() => {
    requestRef.current++;
    hasDraftRef.current = false;
    setDraft(null);
    setCapturedAt(null);
    if (!client || !enabled || !pageKey) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    schedule();
  }, [client, enabled, pageKey, schedule]);

  // Field updates: read again, debounced so a burst of updates is one read.
  const lastVersionRef = useRef(contentVersion);
  useEffect(() => {
    if (contentVersion === lastVersionRef.current) return;
    lastVersionRef.current = contentVersion;
    schedule();
  }, [contentVersion, schedule]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const refresh = useCallback(() => void capture(), [capture]);

  return { draft, status, capturedAt, refresh };
}
