"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type {
  AiResults,
  ParsedHtml,
  RobotsTxt,
} from "@/lib/rule-engine/types";
import { runSiteScore, type SiteScoreResult } from "@/lib/rule-engine/site-score";
import type { PageMatrixRow, RowScanStatus } from "@/types/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = "aiDiscovery:scores:v1";
const INITIAL_AUTO_SCAN_COUNT = 20;
const CONCURRENCY = 5;
const PAGE_SEARCH_PAGESIZE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// SDK response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface SiteContextShape {
  siteInfo?: {
    siteId?: string;
    name?: string;
    displayName?: string;
  };
}

interface SdkHost {
  id?: string | null;
  name?: string | null;
  hostnames?: Array<string> | null;
  targetHostname?: string | null;
  homePageId?: string | null;
}

interface SdkPage {
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  route?: string | null;
  templateId?: string | null;
  updatedAt?: string | null;
  language?: string | null;
}

interface SdkPagesSearchResult {
  totalCount?: number;
  results?: Array<SdkPage> | null;
  // some envelopes include a continuation token; treat as optional
  continuationToken?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage cache
// ─────────────────────────────────────────────────────────────────────────────

interface CachedScore {
  score: SiteScoreResult;
  updatedAt: string;
  cachedAt: string;
}

function readCache(): Record<string, CachedScore> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CachedScore>) : {};
  } catch {
    return {};
  }
}

function writeCacheEntry(pageUrl: string, entry: CachedScore) {
  if (typeof window === "undefined") return;
  try {
    const cur = readCache();
    cur[pageUrl] = entry;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cur));
  } catch {
    // ignore quota errors
  }
}

function clearCache() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPageUrl(domain: string, route: string | null | undefined): string {
  const clean = domain.replace(/\/+$/, "");
  if (!route) return clean;
  return route.startsWith("/") ? `${clean}${route}` : `${clean}/${route}`;
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

/** Run async tasks with a hard concurrency limit. Resolves once all done. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await task(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSitePagesResult {
  pages: PageMatrixRow[];
  siteContext: { id: string; domain: string; name: string };
  isLoading: boolean;
  error: string | null;
  /** Number of pages currently in `scanning` state (for header progress). */
  scanningCount: number;
  /** Auto-scan first N pages (re-runs enumeration + first-N). */
  refresh: () => void;
  /** Scan a single row by id. */
  scanRow: (id: string) => void;
  /** Scan every row that's not yet scanned. */
  scanAll: () => void;
  /** Drop the localStorage cache and refresh. */
  clearAndRefresh: () => void;
}

export function useSitePages(client: ClientSDK | null, isInitialized: boolean): UseSitePagesResult {
  const [pages, setPages] = useState<PageMatrixRow[]>([]);
  const [siteContext, setSiteContext] = useState({ id: "", domain: "", name: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Site-wide robots.txt — fetched once per domain, reused for every row's score.
  const robotsRef = useRef<RobotsTxt | null>(null);
  const robotsFetchedDomainRef = useRef<string | null>(null);

  const pagesRef = useRef<PageMatrixRow[]>([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const updateRow = useCallback((id: string, patch: Partial<PageMatrixRow>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // ── Scan a single page: HTML + AI in parallel, then runSiteScore ─────────
  const scanOne = useCallback(async (row: PageMatrixRow) => {
    updateRow(row.id, { scanStatus: "scanning", scanError: undefined });

    const [htmlRes, aiRes] = await Promise.allSettled([
      tryJson<ParsedHtml>(fetch(`${base}/api/preview-fetch?url=${encodeURIComponent(row.pageUrl)}`)),
      // Skip AI when we don't yet have body text. We'll let preview-fetch settle first
      // and re-call AI separately — but a simpler approach: kick AI off now with the
      // page title only, body text will fold in once HTML lands. Cheaper: fire AI
      // only after HTML returns so we can include real body text.
      Promise.resolve(null as AiResults | null),
    ]);

    const parsedHtml = htmlRes.status === "fulfilled" ? htmlRes.value : null;
    let ai: AiResults | null = aiRes.status === "fulfilled" ? aiRes.value : null;

    // Fire AI with real body text once HTML is in hand
    if (parsedHtml && parsedHtml.paragraphs.length > 0) {
      const bodyText = parsedHtml.paragraphs.join("\n\n").slice(0, 4000);
      ai = await tryJson<AiResults>(
        fetch(`${base}/api/ai-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageTitle: parsedHtml.title ?? row.name, bodyText }),
        }),
      );
    }

    if (!parsedHtml) {
      updateRow(row.id, {
        scanStatus: "error",
        scanError: "Preview fetch failed",
      });
      return;
    }

    const score = runSiteScore({
      parsedHtml,
      robotsTxt: robotsRef.current,
      ai,
      updatedAt: row.lastModified,
      pageUrl: row.pageUrl,
    });

    const cachedAt = new Date().toISOString();
    writeCacheEntry(row.pageUrl, { score, updatedAt: row.lastModified, cachedAt });

    updateRow(row.id, {
      score,
      scanStatus: "scanned",
      lastScannedAt: cachedAt,
      scanError: undefined,
    });
  }, [base, updateRow]);

  // ── Public actions ───────────────────────────────────────────────────────
  const scanRow = useCallback((id: string) => {
    const row = pagesRef.current.find((p) => p.id === id);
    if (!row || row.scanStatus === "scanning") return;
    void scanOne(row);
  }, [scanOne]);

  const scanAll = useCallback(async () => {
    const targets = pagesRef.current.filter((p) => p.scanStatus !== "scanning" && p.scanStatus !== "scanned");
    if (targets.length === 0) return;
    await withConcurrency(targets, CONCURRENCY, async (row) => { await scanOne(row); });
  }, [scanOne]);

  // ── Enumerate pages via SDK + auto-scan first N ──────────────────────────
  const enumerateAndScan = useCallback(async () => {
    if (!client) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. site.context → siteId, name
      console.log("[sitePages] step 1: querying site.context");
      const siteRes = await client.query("site.context");
      try {
        console.log("[sitePages] site.context JSON:", JSON.stringify(siteRes, null, 2));
      } catch {
        console.log("[sitePages] site.context (proxy):", siteRes);
      }
      const siteCtx = ((siteRes as { data?: SiteContextShape })?.data) ?? {};
      const siteInfo = siteCtx.siteInfo;
      const siteId = siteInfo?.siteId ?? "";
      const siteName = siteInfo?.name ?? "";
      console.log("[sitePages] siteId:", siteId, "name:", siteName);

      if (!siteId) {
        setError("Could not load site context.");
        setPages([]);
        setSiteContext({ id: "", domain: "", name: "" });
        setIsLoading(false);
        return;
      }

      // 2. listHosts(siteId) → targetHostname + homePageId
      console.log("[sitePages] step 2: querying xmc.sites.listHosts for siteId=", siteId);
      const hostsRes = await client.query("xmc.sites.listHosts", {
        params: { path: { siteId } },
      } as Parameters<ClientSDK["query"]>[1]);
      try {
        console.log("[sitePages] listHosts JSON:", JSON.stringify(hostsRes, null, 2));
      } catch {
        console.log("[sitePages] listHosts (proxy):", hostsRes);
      }

      // listHosts response shape: pageRes.data.data = Host[]
      const hostsList =
        ((hostsRes as { data?: { data?: SdkHost[] } })?.data?.data)
        ?? ((hostsRes as { data?: SdkHost[] })?.data)
        ?? [];
      console.log("[sitePages] hostsList length:", hostsList.length, "list:", hostsList);

      const primaryHost = hostsList.find((h) => h.targetHostname) ?? hostsList[0];
      const rawHost = primaryHost?.targetHostname ?? "";
      const domain = rawHost
        ? rawHost.startsWith("http") ? rawHost : `https://${rawHost}`
        : "";
      const homePageId = primaryHost?.homePageId ?? "";
      console.log("[sitePages] primaryHost:", primaryHost, "domain:", domain, "homePageId:", homePageId);

      setSiteContext({ id: siteId, domain, name: siteName });

      if (!domain || !homePageId) {
        setError("Could not resolve site domain or home page from listHosts.");
        setPages([]);
        setIsLoading(false);
        return;
      }

      // 3. Fetch robots.txt once for this domain (cached for the session)
      if (robotsFetchedDomainRef.current !== domain) {
        robotsFetchedDomainRef.current = domain;
        robotsRef.current = await tryJson<RobotsTxt>(
          fetch(`${base}/api/robots-check?domain=${encodeURIComponent(domain)}`),
        );
      }

      // 4. Paginate xmc.pages.search under the home page until exhausted
      console.log("[sitePages] step 4: querying xmc.pages.search rootIds=", [homePageId]);
      const collected: SdkPage[] = [];
      let pageNumber = 1;
      const language = "en"; // site.context doesn't expose language; default to en
      for (let i = 0; i < 50; i++) {
        const searchRes = await client.query("xmc.pages.search", {
          params: {
            query: {
              rootIds: [homePageId],
              filter: "Pages",
              language,
              pageSize: PAGE_SEARCH_PAGESIZE,
              pageNumber,
            },
          },
        } as Parameters<ClientSDK["query"]>[1]);

        if (i === 0) {
          try {
            console.log("[sitePages] pages.search page 1 JSON:", JSON.stringify(searchRes, null, 2).slice(0, 3000));
          } catch {
            console.log("[sitePages] pages.search page 1 (proxy):", searchRes);
          }
        }

        const payload =
          ((searchRes as { data?: { data?: SdkPagesSearchResult } })?.data?.data)
          ?? ((searchRes as { data?: SdkPagesSearchResult })?.data)
          ?? {};
        const results = payload.results ?? [];
        console.log(`[sitePages] pages.search page ${pageNumber} → ${results.length} results (totalCount=${payload.totalCount})`);
        if (results.length === 0) break;
        collected.push(...results);
        if (results.length < PAGE_SEARCH_PAGESIZE) break;
        pageNumber++;
      }
      console.log("[sitePages] collected total:", collected.length);

      // 5. Sort by updatedAt desc, build rows with cache lookup
      const cache = readCache();
      const rows: PageMatrixRow[] = collected
        .map<PageMatrixRow>((p) => {
          const pageUrl = buildPageUrl(domain, p.route);
          const lastModified = p.updatedAt ?? "";
          const cached = cache[pageUrl];
          const fromCache = cached && cached.updatedAt === lastModified ? cached : null;
          return {
            id: p.id ?? pageUrl,
            name: p.displayName || p.name || "(untitled)",
            route: p.route ?? "",
            pageUrl,
            templateId: p.templateId ?? "",
            lastModified,
            score: fromCache ? fromCache.score : null,
            scanStatus: fromCache ? "scanned" : "idle",
            lastScannedAt: fromCache ? fromCache.cachedAt : undefined,
          };
        })
        .sort((a, b) => {
          const at = a.lastModified ? Date.parse(a.lastModified) : 0;
          const bt = b.lastModified ? Date.parse(b.lastModified) : 0;
          return bt - at;
        });

      setPages(rows);
      pagesRef.current = rows;
      setIsLoading(false);

      // 6. Auto-scan the first N un-scanned rows
      const toScan = rows.filter((r) => r.scanStatus === "idle").slice(0, INITIAL_AUTO_SCAN_COUNT);
      await withConcurrency(toScan, CONCURRENCY, async (row) => { await scanOne(row); });
    } catch (err) {
      console.error("[sitePages] enumeration failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not load pages from the SDK: ${message}`);
      setIsLoading(false);
    }
  }, [client, base, scanOne]);

  useEffect(() => {
    if (!client || !isInitialized) return;
    void enumerateAndScan();
  }, [client, isInitialized, enumerateAndScan]);

  const refresh = useCallback(() => {
    void enumerateAndScan();
  }, [enumerateAndScan]);

  const clearAndRefresh = useCallback(() => {
    clearCache();
    void enumerateAndScan();
  }, [enumerateAndScan]);

  const scanningCount = useMemo(
    () => pages.filter((p) => p.scanStatus === "scanning").length,
    [pages],
  );

  return useMemo(
    () => ({
      pages,
      siteContext,
      isLoading,
      error,
      scanningCount,
      refresh,
      scanRow,
      scanAll,
      clearAndRefresh,
    }),
    [pages, siteContext, isLoading, error, scanningCount, refresh, scanRow, scanAll, clearAndRefresh],
  );
}

// Backwards-compat — old name kept for any importer not yet updated
export type RowScanStatusType = RowScanStatus;
