"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The Page Builder draft (plan section 7). `client.getPageHTML()` returns the
// canvas as a string, unsaved edits included, in about 30–50 ms
// (SPIKE-FINDINGS §3). It's a snapshot, so it's read again after every field
// update (debounced) and on page change. Every capture is sanitised before
// it's parsed, so no check sees raw editor output.
//
// When getPageHTML isn't available (the call rejects or returns nothing), the
// status is "unavailable" and the panel scores the live page, as before.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { sanitiseDraftHtml } from "@/lib/html/sanitise-draft";
import type { DraftHtml } from "@/lib/checks/types";

/** Wait after a page change or field update before reading the canvas. */
const DEBOUNCE_MS = 1500;

/**
 * - `idle`: not read yet (no page, or demo mode).
 * - `loading`: a read is pending or running.
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
    try {
      const raw = await client.getPageHTML();
      if (id !== requestRef.current) return;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("getPageHTML returned no HTML");
      const clean = sanitiseDraftHtml(raw);
      const html = extractParsedHtml(clean.html);
      console.info(
        `[draft] getPageHTML: ${raw.length} chars, ${html.mainText.length} chars of main text; removed`,
        clean.removed,
        clean.emptyStates.length > 0 ? `empty states: ${clean.emptyStates.join(" | ")}` : "",
      );
      hasDraftRef.current = true;
      setDraft({ html, emptyStates: clean.emptyStates });
      setCapturedAt(new Date());
      setStatus("ready");
    } catch (err) {
      if (id !== requestRef.current) return;
      // Keep a draft this page already has: one failed refresh shouldn't swap
      // the body checks to live mid-edit.
      if (hasDraftRef.current) {
        console.warn("[draft] getPageHTML refresh failed; keeping the previous capture:", err);
        setStatus("ready");
        return;
      }
      console.warn("[draft] getPageHTML unavailable; the body checks use the live page:", err);
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
