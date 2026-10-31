"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiResults,
  ParsedHtml,
  PsiResult,
  RobotsTxt,
} from "@/lib/rule-engine/types";

interface UseScanInput {
  pageUrl: string;
  siteDomain: string;
  editingToken: string;
  pageTitle: string;
}

interface UseScanResult {
  parsedHtml: ParsedHtml | null;
  robotsTxt: RobotsTxt | null;
  psi: PsiResult | null;
  ai: AiResults | null;
  /** True during a full scan (auto on URL change or manual Re-scan page). */
  isScanning: boolean;
  /** True only during an individual AI-only scan (row-level button). */
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
  const { pageUrl, siteDomain, editingToken, pageTitle } = input;

  const [parsedHtml, setParsedHtml] = useState<ParsedHtml | null>(null);
  const [robotsTxt, setRobotsTxt] = useState<RobotsTxt | null>(null);
  const [psi, setPsi] = useState<PsiResult | null>(null);
  const [ai, setAi] = useState<AiResults | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [isPsiScanning, setIsPsiScanning] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Ref so the auto-scan effect always reads the latest title without
  // re-triggering on every authoring field keystroke.
  const pageTitleRef = useRef(pageTitle);
  useEffect(() => { pageTitleRef.current = pageTitle; }, [pageTitle]);

  const fetchHtml = useCallback(() => {
    const tokenParam = editingToken ? `&token=${encodeURIComponent(editingToken)}` : "";
    return tryJson<ParsedHtml>(
      fetch(`${base}/api/preview-fetch?url=${encodeURIComponent(pageUrl)}${tokenParam}`)
    );
  }, [base, pageUrl, editingToken]);

  // The AI checks read the page's main text from preview-fetch, so they run
  // after it. With no main text there's nothing to judge, so the call is skipped.
  const fetchAi = useCallback(
    (title: string, html: ParsedHtml | null): Promise<AiResults | null> => {
      const bodyText = html?.mainText ?? "";
      if (!bodyText) {
        console.info("[scan] ai-check skipped: preview-fetch returned no main text");
        return Promise.resolve(null);
      }
      console.info(
        `[scan] ai-check body: ${bodyText.length} chars of main text —`,
        bodyText.slice(0, 200),
      );
      return tryJson<AiResults>(
        fetch(`${base}/api/ai-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageTitle: title, bodyText }),
        })
      );
    },
    [base],
  );

  // Robots.txt is site-wide — fetch once per domain.
  const robotsFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!siteDomain || robotsFetchedRef.current === siteDomain) return;
    robotsFetchedRef.current = siteDomain;
    tryJson<RobotsTxt>(
      fetch(`${base}/api/robots-check?domain=${encodeURIComponent(siteDomain)}`)
    ).then((data) => { if (data) setRobotsTxt(data); });
  }, [siteDomain, base]);

  // Auto-scan all page-level checks whenever the page URL changes (i.e. the
  // author navigates to a different page in Page Builder).
  // Data is cleared first so rows show "Scanning…" while fetching.
  useEffect(() => {
    if (!pageUrl) return;

    setParsedHtml(null);
    setPsi(null);
    setAi(null);
    setIsScanning(true);

    let cancelled = false;

    (async () => {
      const html = await fetchHtml();
      if (cancelled) return;
      if (html) setParsedHtml(html);
      const aiResult = await fetchAi(pageTitleRef.current, html);
      if (cancelled) return;
      if (aiResult) setAi(aiResult);
      setLastScannedAt(new Date());
      setIsScanning(false);
    })();

    return () => { cancelled = true; };
  }, [pageUrl, fetchHtml, fetchAi]);

  // Manual Re-scan page — reruns all page-level checks without clearing
  // current results, so scores remain visible while refreshing.
  const runScan = useCallback(() => {
    if (!pageUrl) {
      setError("No page URL available yet.");
      return;
    }
    setError(null);
    setIsScanning(true);

    (async () => {
      const html = await fetchHtml();
      if (html) setParsedHtml(html);
      const aiResult = await fetchAi(pageTitle, html);
      if (aiResult) setAi(aiResult);
      setLastScannedAt(new Date());
      setIsScanning(false);
    })();
  }, [pageUrl, pageTitle, fetchHtml, fetchAi]);

  // Individual scans — only run their specific check.
  const runAiScan = useCallback(() => {
    if (!pageUrl) return;
    setIsAiScanning(true);
    fetchAi(pageTitle, parsedHtml).then((result) => {
      if (result) setAi(result);
      setLastScannedAt(new Date());
      setIsAiScanning(false);
    });
  }, [pageUrl, pageTitle, parsedHtml, fetchAi]);

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

  return {
    parsedHtml,
    robotsTxt,
    psi,
    ai,
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
