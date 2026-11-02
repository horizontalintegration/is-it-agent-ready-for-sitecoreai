"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAiResults } from "@/lib/ai/ai-results-cache";
import { normaliseText } from "@/lib/ai/content-key";
import type { DraftStatus } from "@/hooks/usePageHtml";
import type {
  AiResults,
  ParsedHtml,
  PsiResult,
} from "@/lib/rule-engine/types";

interface UseScanInput {
  pageUrl: string;
  editingToken: string;
  pageTitle: string;
  /** The draft's main text (usePageHtml). Null without a draft. */
  draftText: string | null;
  draftStatus: DraftStatus;
}

interface UseScanResult {
  /** The live page (preview-fetch). */
  parsedHtml: ParsedHtml | null;
  psi: PsiResult | null;
  ai: AiResults | null;
  /** The text the AI checks judge: the draft's main text, or the live page's without a draft. */
  bodyText: string;
  /** False while that body is still loading (the draft read, or the live fetch as the fallback). */
  bodyReady: boolean;
  /** True when the body has changed since the AI judged it. Re-run to update. */
  aiStale: boolean;
  /** True while the live page is fetched (auto on URL change or manual Re-scan page). */
  isScanning: boolean;
  /** True while the AI checks run (after a page load, Re-scan, or the row button). */
  isAiScanning: boolean;
  /** True only during an individual PSI-only scan (row-level button). */
  isPsiScanning: boolean;
  lastScannedAt: Date | null;
  error: string | null;
  runScan: () => void;
  runAiScan: () => void;
  runPsiScan: () => void;
}

async function tryJson<T>(p: Promise<Response>): Promise<T | null> {
  try {
    const res = await p;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useScan(input: UseScanInput): UseScanResult {
  const { pageUrl, editingToken, pageTitle, draftText, draftStatus } = input;

  const [parsedHtml, setParsedHtml] = useState<ParsedHtml | null>(null);
  const [psi, setPsi] = useState<PsiResult | null>(null);
  const [ai, setAi] = useState<AiResults | null>(null);
  /** The body text the current AI result judged. */
  const [aiBody, setAiBody] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  /** The live fetch for this page has finished (with or without HTML). */
  const [liveDone, setLiveDone] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [isPsiScanning, setIsPsiScanning] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on page change and Re-scan: the AI runs once on the next ready body.
  const [aiRequest, setAiRequest] = useState(0);
  const aiHandledRef = useRef(0);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Ref so the AI effect always reads the latest title without re-triggering
  // on every authoring field keystroke.
  const pageTitleRef = useRef(pageTitle);
  useEffect(() => { pageTitleRef.current = pageTitle; }, [pageTitle]);
  // Results for a page the author has since left are dropped.
  const pageUrlRef = useRef(pageUrl);
  useEffect(() => { pageUrlRef.current = pageUrl; }, [pageUrl]);

  const fetchHtml = useCallback(() => {
    const tokenParam = editingToken ? `&token=${encodeURIComponent(editingToken)}` : "";
    return tryJson<ParsedHtml>(
      fetch(`${base}/api/preview-fetch?url=${encodeURIComponent(pageUrl)}${tokenParam}`)
    );
  }, [base, pageUrl, editingToken]);

  // With no body text there's nothing to judge, so the call is skipped.
  // Results are cached by content hash, so unchanged text doesn't call Claude again.
  const runAi = useCallback(
    (title: string, body: string, force = false) => {
      if (!body) {
        console.info("[scan] ai-check skipped: no body text");
        return;
      }
      console.info(`[scan] ai-check body: ${body.length} chars —`, body.slice(0, 200));
      const forUrl = pageUrlRef.current;
      setIsAiScanning(true);
      fetchAiResults(base, title, body, { force }).then((result) => {
        if (pageUrlRef.current !== forUrl) return;
        if (result) {
          setAi(result);
          setAiBody(body);
        }
        setLastScannedAt(new Date());
        setIsAiScanning(false);
      });
    },
    [base],
  );

  // Fetch the live page whenever the page URL changes (i.e. the author
  // navigates to a different page in Page Builder), and queue the AI checks.
  // Data is cleared first so rows show "Scanning…" while fetching.
  useEffect(() => {
    if (!pageUrl) return;

    setParsedHtml(null);
    setPsi(null);
    setAi(null);
    setAiBody("");
    setIsScanning(true);
    setLiveDone(false);
    setAiRequest((n) => n + 1);

    let cancelled = false;

    (async () => {
      const html = await fetchHtml();
      if (cancelled) return;
      if (html) setParsedHtml(html);
      setLastScannedAt(new Date());
      setIsScanning(false);
      setLiveDone(true);
    })();

    return () => { cancelled = true; };
  }, [pageUrl, fetchHtml]);

  const bodyText = draftText ?? parsedHtml?.mainText ?? "";
  const bodyReady = draftStatus === "ready" || (draftStatus === "unavailable" && liveDone && !isScanning);

  // The AI checks run once per request, on the first ready body. Later edits
  // don't call Claude again: the result is marked stale until it's re-run.
  useEffect(() => {
    if (!pageUrl || !bodyReady || aiRequest === aiHandledRef.current) return;
    aiHandledRef.current = aiRequest;
    runAi(pageTitleRef.current, bodyText);
  }, [pageUrl, bodyReady, bodyText, aiRequest, runAi]);

  // Manual Re-scan page — re-fetches the live page and re-runs the AI on the
  // next ready body, without clearing current results.
  const runScan = useCallback(() => {
    if (!pageUrl) {
      setError("No page URL available yet.");
      return;
    }
    setError(null);
    setIsScanning(true);
    setAiRequest((n) => n + 1);

    (async () => {
      const html = await fetchHtml();
      if (html) setParsedHtml(html);
      setLastScannedAt(new Date());
      setIsScanning(false);
    })();
  }, [pageUrl, fetchHtml]);

  // Individual scans — only run their specific check. The AI re-run skips the
  // cache, since the author asked for a fresh answer.
  const runAiScan = useCallback(() => {
    if (!pageUrl) return;
    runAi(pageTitle, bodyText, true);
  }, [pageUrl, pageTitle, bodyText, runAi]);

  const runPsiScan = useCallback(() => {
    if (!pageUrl) return;
    setIsPsiScanning(true);
    tryJson<PsiResult>(
      fetch(`${base}/api/psi-check?url=${encodeURIComponent(pageUrl)}`)
    ).then((result) => {
      if (result) setPsi(result);
      setLastScannedAt(new Date());
      setIsPsiScanning(false);
    });
  }, [pageUrl, base]);

  const aiStale = ai !== null && aiBody !== "" && normaliseText(aiBody) !== normaliseText(bodyText);

  return {
    parsedHtml,
    psi,
    ai,
    bodyText,
    bodyReady,
    aiStale,
    isScanning,
    isAiScanning,
    isPsiScanning,
    lastScannedAt,
    error,
    runScan,
    runAiScan,
    runPsiScan,
  };
}
