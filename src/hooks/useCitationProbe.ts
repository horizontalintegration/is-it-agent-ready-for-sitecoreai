"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normaliseHost } from "@/lib/citations/classify";
import {
  appendRun,
  probeCacheKey,
  readCachedProbe,
  readOwnHosts,
  readQuestions,
  readRuns,
  setKeyOf,
  siteHostsFor,
  writeCachedProbe,
  writeOwnHosts,
  writeQuestions,
} from "@/lib/citations/storage";
import type { CitationDemo, ProbeEvidence, ProbeRun } from "@/lib/citations/types";
import { localHistoryStore } from "@/lib/history/store";
import { activeLimit, AI_BUSY_MESSAGE, limitMessage, readLimit } from "@/lib/api/limits";

// The AI citations tab's Layer 2 (plan section 8): the question set, the
// probe run and its history for one page. Every probe is one request to
// /api/citation-probe, 4 at a time. A question probed in the last 7 days is
// read from the browser's cache (the server keeps its own cache too), so
// running the same set again costs nothing. Demo mode never fetches.

const CONCURRENCY = 4;
const DEFAULT_COUNTRY = "US";

export type RowState = "loading" | "done" | "error";

export interface UseCitationProbeResult {
  questions: string[] | null;
  country: string | null;
  /** Extra hosts counted as the site's own. */
  ownHosts: string[];
  /** The site's host plus `ownHosts`. */
  siteHosts: string[];
  runs: ProbeRun[];
  /** The latest run, when it is of the current question set. */
  current: ProbeRun | null;
  /** Per question while a run is in progress (and errors after it). */
  rowState: Record<string, { state: RowState; error?: string }>;
  status: "idle" | "suggesting" | "running";
  error: string | null;
  /** After a run: how many answers came from the cache, of how many. */
  lastRun: { cached: number; total: number } | null;
  suggest: () => Promise<void>;
  saveQuestions: (questions: string[], country: string | null) => void;
  saveOwnHosts: (hosts: string[]) => void;
  run: () => Promise<void>;
}

async function postJson<T>(body: Record<string, unknown>): Promise<T> {
  // Over a limit: the rest of the run fails at once, without asking.
  const held = activeLimit("citation-probe");
  if (held) throw new Error(limitMessage(held));
  const res = await fetch("/api/citation-probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const limit = await readLimit("citation-probe", res);
  if (limit) throw new Error(limitMessage(limit));
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok || data.error) throw new Error(errorText(data.error, data.detail, res.status));
  return data;
}

function errorText(code: string | undefined, detail: string | undefined, status: number): string {
  switch (code) {
    case "ai_busy":
      return AI_BUSY_MESSAGE;
    case "page_fetch_failed":
      return "Couldn't read the page to suggest questions.";
    case "blocked_url":
      return "That address can't be checked.";
    case "refused":
      return "Claude declined this request.";
    case "api_key_missing":
    case "api_key_invalid":
      return "The Claude API key is missing or invalid.";
    default:
      return code ? `${code}${detail ? `: ${detail}` : ""}` : `Request failed (${status})`;
  }
}

/**
 * @param pageUrl the page to probe; nothing happens while it's empty
 * @param siteUrl the site's domain, the first of the hosts that count as the site
 * @param demo demo mode's questions and runs: nothing is stored or fetched
 */
export function useCitationProbe(pageUrl: string, siteUrl: string, demo: CitationDemo | null): UseCitationProbeResult {
  const store = localHistoryStore;
  const siteHost = normaliseHost(siteUrl);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [country, setCountry] = useState<string | null>(DEFAULT_COUNTRY);
  const [ownHosts, setOwnHosts] = useState<string[]>([]);
  const [runs, setRuns] = useState<ProbeRun[]>([]);
  const [setKey, setSetKey] = useState("");
  const [rowState, setRowState] = useState<UseCitationProbeResult["rowState"]>({});
  const [status, setStatus] = useState<UseCitationProbeResult["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<UseCitationProbeResult["lastRun"]>(null);
  // Results from a page the user has since left are dropped.
  const pageRef = useRef(pageUrl);

  useEffect(() => {
    pageRef.current = pageUrl;
    setRowState({});
    setError(null);
    setLastRun(null);
    setStatus("idle");
    if (demo) {
      setQuestions(demo.questions);
      setCountry(demo.country);
      setRuns(demo.runs);
      setOwnHosts([]);
      return;
    }
    if (!pageUrl) return;
    const saved = readQuestions(store, pageUrl);
    setQuestions(saved?.questions ?? null);
    setCountry(saved ? saved.country : DEFAULT_COUNTRY);
    setRuns(readRuns(store, pageUrl));
  }, [pageUrl, demo, store]);

  useEffect(() => {
    if (!demo && siteHost) setOwnHosts(readOwnHosts(store, siteHost));
  }, [siteHost, demo, store]);

  useEffect(() => {
    let cancelled = false;
    if (!questions) {
      setSetKey("");
      return;
    }
    setKeyOf(questions, country).then((k) => {
      if (!cancelled) setSetKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [questions, country]);

  const siteHosts = useMemo(() => siteHostsFor(siteUrl, ownHosts), [siteUrl, ownHosts]);
  const latest = runs.at(-1) ?? null;
  const current = latest && demo ? latest : latest && latest.setKey === setKey ? latest : null;

  const suggest = useCallback(async () => {
    setError(null);
    if (demo) {
      setQuestions(demo.questions);
      return;
    }
    if (!pageUrl) return;
    setStatus("suggesting");
    try {
      const data = await postJson<{ questions: string[] }>({ action: "questions", pageUrl });
      if (pageRef.current !== pageUrl) return;
      setQuestions(data.questions);
      writeQuestions(store, pageUrl, { questions: data.questions, country });
    } catch (err) {
      if (pageRef.current === pageUrl) setError(err instanceof Error ? err.message : "Couldn't suggest questions.");
    } finally {
      if (pageRef.current === pageUrl) setStatus("idle");
    }
  }, [demo, pageUrl, country, store]);

  const saveQuestions = useCallback(
    (next: string[], nextCountry: string | null) => {
      setQuestions(next);
      setCountry(nextCountry);
      if (!demo && pageUrl) writeQuestions(store, pageUrl, { questions: next, country: nextCountry });
    },
    [demo, pageUrl, store],
  );

  const saveOwnHosts = useCallback(
    (hosts: string[]) => {
      const clean = [...new Set(hosts.map(normaliseHost).filter((h) => h && h !== siteHost))];
      setOwnHosts(clean);
      if (!demo && siteHost) writeOwnHosts(store, siteHost, clean);
    },
    [demo, siteHost, store],
  );

  const run = useCallback(async () => {
    if (!questions || questions.length === 0 || status !== "idle") return;
    setError(null);
    if (demo) {
      // Sample results only: nothing is asked.
      setLastRun({ cached: questions.length, total: questions.length });
      return;
    }
    const page = pageUrl;
    setStatus("running");
    setRowState(Object.fromEntries(questions.map((q) => [q, { state: "loading" as const }])));
    const evidence: Array<ProbeEvidence | null> = questions.map(() => null);
    let cached = 0;
    let next = 0;

    const probeOne = async (i: number) => {
      const question = questions[i];
      const key = await probeCacheKey(page, question, country);
      const hit = readCachedProbe(store, key);
      if (hit) {
        cached++;
        evidence[i] = hit;
        setRowState((prev) => ({ ...prev, [question]: { state: "done" } }));
        return;
      }
      try {
        const data = await postJson<{ evidence: ProbeEvidence; cached: boolean }>({ action: "run", pageUrl: page, question, country });
        evidence[i] = data.evidence;
        if (data.cached) cached++;
        if (data.evidence.searched) writeCachedProbe(store, key, data.evidence);
        if (pageRef.current === page) setRowState((prev) => ({ ...prev, [question]: { state: "done" } }));
      } catch (err) {
        if (pageRef.current === page) {
          setRowState((prev) => ({ ...prev, [question]: { state: "error", error: err instanceof Error ? err.message : "Probe failed" } }));
        }
      }
    };
    const worker = async () => {
      while (next < questions.length) await probeOne(next++);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, questions.length) }, worker));

    if (pageRef.current !== page) return;
    const done = evidence.filter((e): e is ProbeEvidence => e !== null);
    const key = await setKeyOf(questions, country);
    const prevRun = readRuns(store, page).at(-1);
    // Everything from the cache, and the last run is this set: it's the same run, not a new one.
    const sameRun = cached === done.length && prevRun?.setKey === key && prevRun.evidence.length === done.length;
    if (done.length > 0 && !sameRun) {
      setRuns(appendRun(store, page, { at: new Date().toISOString(), setKey: key, country, evidence: done }));
    }
    setRowState((prev) => Object.fromEntries(Object.entries(prev).filter(([, s]) => s.state === "error")));
    setLastRun({ cached, total: questions.length });
    setStatus("idle");
  }, [questions, country, status, demo, pageUrl, store]);

  return { questions, country, ownHosts, siteHosts, runs, current, rowState, status, error, lastRun, suggest, saveQuestions, saveOwnHosts, run };
}
