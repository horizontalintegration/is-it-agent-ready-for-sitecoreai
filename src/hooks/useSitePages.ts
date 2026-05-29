"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { quickScore } from "@/lib/rule-engine/quick-score";
import type { PageMatrixRow, PageSummaryFields } from "@/types/dashboard";

interface UseSitePagesResult {
  pages: PageMatrixRow[];
  siteContext: { id: string; domain: string; name: string };
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

interface SiteContextResponse {
  id?: string;
  targetHostname?: string;
  hostName?: string;
  name?: string;
}

interface SiteScanResponse {
  siteId: string;
  pages: Array<{
    id: string;
    name: string;
    path: string;
    templateId: string;
    lastModified: string;
    fields: PageSummaryFields;
  }>;
  fetchedAt: string;
  warning?: string;
}

function fieldsToAuthoring(fields: PageSummaryFields) {
  const parseDate = (s: string | null) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  return {
    pageTitle: fields.pageTitle,
    metaDescription: fields.metaDescription,
    author: fields.author,
    publishDate: parseDate(fields.publishDate),
    lastUpdatedDate: parseDate(fields.lastUpdatedDate),
    noIndexField: fields.noIndex,
    images: fields.images,
    links: fields.links,
    headings: fields.headings.map((h) => ({
      level: Math.min(6, Math.max(1, h.level)) as 1 | 2 | 3 | 4 | 5 | 6,
      text: h.text,
      componentName: h.componentName,
    })),
    faqItems: fields.faqItems,
    hasFaqComponent: fields.hasFaqComponent,
    hasHowToComponent: fields.hasHowToComponent,
    richTextParagraphs: fields.richTextParagraphs,
  };
}

export function useSitePages(client: ClientSDK | null, isInitialized: boolean): UseSitePagesResult {
  const [pages, setPages] = useState<PageMatrixRow[]>([]);
  const [siteContext, setSiteContext] = useState({ id: "", domain: "", name: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const fetchPages = useCallback(
    async (siteId: string) => {
      try {
        const res = await fetch(`${base}/api/site-scan?siteId=${encodeURIComponent(siteId)}`);
        if (!res.ok) {
          setError("Could not load pages. Check site context.");
          setPages([]);
          return;
        }
        const data: SiteScanResponse = await res.json();
        const rows = data.pages.map((p) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          templateId: p.templateId,
          lastModified: p.lastModified,
          score: quickScore(fieldsToAuthoring(p.fields)),
          fields: p.fields,
        }));
        rows.sort((a, b) => a.score.total - b.score.total);
        setPages(rows);
        setError(null);
      } catch {
        setError("Invalid response from site scan API.");
        setPages([]);
      }
    },
    [base]
  );

  useEffect(() => {
    if (!client || !isInitialized) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const siteRes = await client.query("site.context");
        console.log("[useSitePages] site.context raw response:", siteRes);
        console.log("[useSitePages] site.context response keys:", Object.keys(siteRes ?? {}));
        const siteResData = (siteRes as { data?: unknown })?.data;
        console.log("[useSitePages] site.context .data:", siteResData);
        console.log("[useSitePages] site.context .data keys:", Object.keys(siteResData ?? {}));
        const ctx = (siteResData as SiteContextResponse | undefined) ?? {};
        console.log("[useSitePages] ctx.id:", ctx.id, "ctx.name:", ctx.name, "ctx.targetHostname:", ctx.targetHostname);
        if (cancelled) return;
        const rawHost = ctx.targetHostname ?? ctx.hostName ?? "";
        const domain = rawHost
          ? rawHost.startsWith("http") ? rawHost : `https://${rawHost}`
          : "";
        const next = {
          id: ctx.id ?? "",
          domain,
          name: ctx.name ?? "",
        };
        setSiteContext(next);
        if (next.id) {
          await fetchPages(next.id);
        } else {
          setError("Missing site ID in site.context.");
          setPages([]);
        }
      } catch (err) {
        console.error("site.context query failed:", err);
        if (!cancelled) setError("Could not load site context.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, isInitialized, fetchPages]);

  const refresh = useCallback(() => {
    if (!siteContext.id) return;
    setIsLoading(true);
    fetchPages(siteContext.id).finally(() => setIsLoading(false));
  }, [siteContext.id, fetchPages]);

  return useMemo(
    () => ({ pages, siteContext, isLoading, error, refresh }),
    [pages, siteContext, isLoading, error, refresh]
  );
}
