"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { AiResults, ParsedHtml, RobotsTxt } from "@/lib/rule-engine/types";
import {
  runSiteScore,
  type SiteScoreResult,
} from "@/lib/rule-engine/site-score";
import type { PageMatrixRow, RowScanStatus } from "@/types/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "aiDiscovery:scores:v1:";

function cacheKey(siteId: string): string {
  return `${CACHE_KEY_PREFIX}${siteId}`;
}
const INITIAL_AUTO_SCAN_COUNT = 20;
const CONCURRENCY = 5;
const TREE_WALK_DEPTH = 5; // descendants levels fetched per GraphQL call

// Sitecore field names for the metadata pulled at enumeration time (used by the
// llms.txt generator — independent of the metrics scan). Overridable per-tenant
// via env, since field names vary between SXA and custom templates.
const FIELD_TITLE = process.env.NEXT_PUBLIC_FIELD_TITLE ?? "pageTitle";
const FIELD_META_DESCRIPTION =
  process.env.NEXT_PUBLIC_FIELD_META_DESCRIPTION ?? "MetaDescription";
const FIELD_OG_DESCRIPTION =
  process.env.NEXT_PUBLIC_FIELD_OG_DESCRIPTION ?? "OpenGraphDescription";

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

// ─────────────────────────────────────────────────────────────────────────────
// Site discovery — locate the site's Home item path by walking /sitecore/content
// ─────────────────────────────────────────────────────────────────────────────

interface DiscoveryNode {
  name?: string;
  path?: string;
  children?: { nodes?: DiscoveryNode[] | null } | null;
}

interface DiscoveryEnvelope {
  data?: { item?: DiscoveryNode | null };
  errors?: Array<{ message?: string }>;
}

// 4 levels covers /sitecore/content/Tenant/Collection/Site
const DISCOVER_SITE_QUERY = `
  query DiscoverSite($language: String!) {
    item(where: { path: "/sitecore/content", language: $language }) {
      name path
      children { nodes {
        name path
        children { nodes {
          name path
          children { nodes {
            name path
          }}
        }}
      }}
    }
  }
`;

async function discoverSiteHomePath(
  client: ClientSDK,
  siteName: string,
  language: string,
  sitecoreContextId: string | undefined,
): Promise<string | null> {
  if (!siteName) return null;

  try {
    const res = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query: DISCOVER_SITE_QUERY, variables: { language } },
        ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
      },
    } as Parameters<ClientSDK["mutate"]>[1]);

    const envelope: DiscoveryEnvelope =
      ((res as { data?: DiscoveryEnvelope })?.data as DiscoveryEnvelope) ??
      (res as DiscoveryEnvelope);

    if (envelope?.errors?.length) {
      console.warn(
        "[sitePages] discoverSiteHomePath GraphQL errors:",
        envelope.errors,
      );
      return null;
    }

    const root = envelope?.data?.item;
    if (!root) return null;

    const target = siteName.toLowerCase();
    function findSiteNode(
      node: DiscoveryNode | null | undefined,
    ): DiscoveryNode | null {
      if (!node) return null;
      if ((node.name ?? "").toLowerCase() === target) return node;
      for (const child of node.children?.nodes ?? []) {
        const m = findSiteNode(child);
        if (m) return m;
      }
      return null;
    }

    const siteNode = findSiteNode(root);
    if (!siteNode?.path) return null;
    return `${siteNode.path}/Home`;
  } catch (err) {
    console.warn("[sitePages] discoverSiteHomePath threw:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// xmc.sites.retrieveSite → targetHostname + homePageId (preferred path)
// ─────────────────────────────────────────────────────────────────────────────

interface SdkHost {
  targetHostname?: string | null;
  homePageId?: string | null;
}

interface SdkSite {
  hosts?: SdkHost[] | null;
}

interface RetrieveSiteResult {
  targetHostname: string | null;
  homePageId: string | null;
  /** Populated when the SDK envelope wraps an HTTP error (e.g. 401 M2M). */
  apiError?: { status?: number; detail?: string; title?: string };
}

async function retrieveSiteInfo(
  client: ClientSDK,
  siteId: string,
): Promise<RetrieveSiteResult> {
  try {
    const res = await client.query("xmc.sites.retrieveSite", {
      params: { path: { siteId } },
    } as Parameters<ClientSDK["query"]>[1]);

    const outer = (res as { data?: unknown })?.data;
    const apiError = (
      outer as { error?: { status?: number; detail?: string; title?: string } }
    )?.error;
    if (apiError) {
      return { targetHostname: null, homePageId: null, apiError };
    }

    // Response shape: pageRes.data.data = Site | pageRes.data = Site (proxy varies)
    const site: SdkSite =
      (outer as { data?: SdkSite })?.data ?? (outer as SdkSite) ?? {};
    const hosts = Array.isArray(site.hosts) ? site.hosts : [];
    const primary = hosts.find((h) => h.targetHostname) ?? hosts[0];

    return {
      targetHostname: primary?.targetHostname ?? null,
      homePageId: primary?.homePageId ?? null,
    };
  } catch (err) {
    console.warn("[sitePages] retrieveSiteInfo threw:", err);
    return { targetHostname: null, homePageId: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoring GraphQL — recursive children walk
// ─────────────────────────────────────────────────────────────────────────────

interface GqlItemNode {
  itemId?: string;
  name?: string;
  displayName?: string | null;
  path?: string;
  template?: { name?: string | null } | null;
  updated?: { value?: string | null } | null;
  renderings?: { value?: string | null } | null;
  finalRenderings?: { value?: string | null } | null;
  metaTitle?: { value?: string | null } | null;
  metaDescription?: { value?: string | null } | null;
  ogDescription?: { value?: string | null } | null;
  children?: { nodes?: GqlItemNode[] | null } | null;
}

interface GqlError {
  message?: string;
  path?: Array<string | number>;
  locations?: Array<{ line?: number; column?: number }>;
  extensions?: Record<string, unknown>;
}

interface GqlEnvelope {
  data?: { item?: GqlItemNode | null };
  errors?: GqlError[];
}

// Build a query with N nested children levels. GraphQL doesn't allow recursion,
// so we expand it as a fixed depth tree. Items with __Renderings populated are
// treated as pages; the rest are skipped client-side. The lookup key can be
// either the home item's itemId (preferred — from xmc.sites.retrieveSite) or
// its content tree path (fallback — from the discoverSiteHomePath walk).
function buildSitePagesQuery(depth: number, by: "path" | "itemId"): string {
  // template { name } returns the template's display name (e.g.
  // "Article Detail Page"). We compare against ARTICLE_TEMPLATE_NAME in
  // site-score.ts (case-insensitive) to gate the Article-schema check —
  // this avoids the runtime "template doesn't exist" error caused by
  // resolving template-by-id on items with missing or zero-GUID templates.
  const itemFields = `
    itemId
    name
    displayName
    path
    template { name }
    updated: field(name: "__Updated") { value }
    renderings: field(name: "__Renderings") { value }
    finalRenderings: field(name: "__Final Renderings") { value }
    metaTitle: field(name: "${FIELD_TITLE}") { value }
    metaDescription: field(name: "${FIELD_META_DESCRIPTION}") { value }
    ogDescription: field(name: "${FIELD_OG_DESCRIPTION}") { value }
  `;
  let inner = "";
  for (let i = 0; i < depth; i++) {
    inner = `children { nodes { ${itemFields} ${inner} } }`;
  }
  const varName = by === "itemId" ? "rootItemId" : "rootPath";
  return `
    query GetSitePages($${varName}: String!, $language: String!) {
      item(where: { ${by}: $${varName}, language: $language }) {
        ${itemFields}
        ${inner}
      }
    }
  `;
}

// Flatten the recursive GqlItemNode tree to a list, keeping only items that
// have presentation (i.e., real pages, not content folders).
function flattenPages(root: GqlItemNode | null | undefined): GqlItemNode[] {
  if (!root) return [];
  const out: GqlItemNode[] = [];
  function walk(node: GqlItemNode | null | undefined) {
    // Partial-error responses can nullify an entire node (not just its
    // template) — skip those rather than dereferencing null.
    if (!node) return;
    // A node is a real page when it has presentation in EITHER the shared
    // layout (__Renderings) or the final/versioned layout (__Final Renderings).
    // Some items only populate one of the two, so check both.
    const hasLayout =
      (!!node.renderings?.value && node.renderings.value.trim().length > 0) ||
      (!!node.finalRenderings?.value &&
        node.finalRenderings.value.trim().length > 0);
    if (hasLayout) out.push(node);
    const kids = node.children?.nodes ?? [];
    for (const k of kids) walk(k);
  }
  walk(root);
  return out;
}

// Compute the public-facing route from a Sitecore content tree path.
// "/sitecore/content/Tenant/Site/Home/About Us" → "/About-Us"
// "/sitecore/content/Tenant/Site/Home"          → "/"
function pathToRoute(path: string | undefined): string {
  if (!path) return "/";
  const homeIdx = path.indexOf("/Home/");
  if (homeIdx === -1) {
    return path.endsWith("/Home") ? "/" : "/";
  }
  const rel = path.substring(homeIdx + "/Home/".length);
  // SXA URL convention: spaces → hyphens
  const segments = rel.split("/").map((s) => s.replace(/\s+/g, "-"));
  return "/" + segments.join("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage cache
// ─────────────────────────────────────────────────────────────────────────────

interface CachedScore {
  score: SiteScoreResult;
  updatedAt: string;
  cachedAt: string;
}

function readCache(siteId: string): Record<string, CachedScore> {
  if (typeof window === "undefined" || !siteId) return {};
  try {
    const raw = window.localStorage.getItem(cacheKey(siteId));
    return raw ? (JSON.parse(raw) as Record<string, CachedScore>) : {};
  } catch {
    return {};
  }
}

function writeCacheEntry(siteId: string, pageUrl: string, entry: CachedScore) {
  if (typeof window === "undefined" || !siteId) return;
  try {
    const cur = readCache(siteId);
    cur[pageUrl] = entry;
    window.localStorage.setItem(cacheKey(siteId), JSON.stringify(cur));
  } catch {
    // ignore quota errors
  }
}

function clearCache(siteId: string) {
  if (typeof window === "undefined" || !siteId) return;
  try {
    window.localStorage.removeItem(cacheKey(siteId));
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPageUrl(
  domain: string,
  route: string | null | undefined,
): string {
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
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await task(items[i], i);
      }
    },
  );
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

export function useSitePages(
  client: ClientSDK | null,
  isInitialized: boolean,
): UseSitePagesResult {
  const [pages, setPages] = useState<PageMatrixRow[]>([]);
  const [siteContext, setSiteContext] = useState({
    id: "",
    domain: "",
    name: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Site-wide robots.txt — fetched once per domain, reused for every row's score.
  const robotsRef = useRef<RobotsTxt | null>(null);
  const robotsFetchedDomainRef = useRef<string | null>(null);

  const pagesRef = useRef<PageMatrixRow[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // Track the current site identity across async closures so `scanOne` writes
  // cache entries under the right siteId, and `clearAndRefresh` clears the
  // right bucket. Updated by the site.context subscription below.
  const currentSiteIdRef = useRef<string>("");
  const currentSiteNameRef = useRef<string>("");

  const updateRow = useCallback((id: string, patch: Partial<PageMatrixRow>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // ── Scan a single page: HTML + AI in parallel, then runSiteScore ─────────
  const scanOne = useCallback(
    async (row: PageMatrixRow) => {
      updateRow(row.id, { scanStatus: "scanning", scanError: undefined });

      const [htmlRes, aiRes] = await Promise.allSettled([
        tryJson<ParsedHtml>(
          fetch(
            `${base}/api/preview-fetch?url=${encodeURIComponent(row.pageUrl)}`,
          ),
        ),
        // Skip AI when we don't yet have body text. We'll let preview-fetch settle first
        // and re-call AI separately — but a simpler approach: kick AI off now with the
        // page title only, body text will fold in once HTML lands. Cheaper: fire AI
        // only after HTML returns so we can include real body text.
        Promise.resolve(null as AiResults | null),
      ]);

      const parsedHtml = htmlRes.status === "fulfilled" ? htmlRes.value : null;
      let ai: AiResults | null =
        aiRes.status === "fulfilled" ? aiRes.value : null;

      // Fire AI with real body text once HTML is in hand
      if (parsedHtml && parsedHtml.paragraphs.length > 0) {
        const bodyText = parsedHtml.paragraphs.join("\n\n").slice(0, 4000);
        ai = await tryJson<AiResults>(
          fetch(`${base}/api/ai-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageTitle: parsedHtml.title ?? row.name,
              bodyText,
            }),
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
        isHomePage: row.route === "/" || row.route === "",
        templateName: row.templateName || null,
      });

      const cachedAt = new Date().toISOString();
      writeCacheEntry(currentSiteIdRef.current, row.pageUrl, {
        score,
        updatedAt: row.lastModified,
        cachedAt,
      });

      updateRow(row.id, {
        score,
        scanStatus: "scanned",
        lastScannedAt: cachedAt,
        scanError: undefined,
      });
    },
    [base, updateRow],
  );

  // ── Public actions ───────────────────────────────────────────────────────
  const scanRow = useCallback(
    (id: string) => {
      const row = pagesRef.current.find((p) => p.id === id);
      if (!row || row.scanStatus === "scanning") return;
      void scanOne(row);
    },
    [scanOne],
  );

  const scanAll = useCallback(async () => {
    const targets = pagesRef.current.filter(
      (p) => p.scanStatus !== "scanning" && p.scanStatus !== "scanned",
    );
    if (targets.length === 0) return;
    await withConcurrency(targets, CONCURRENCY, async (row) => {
      await scanOne(row);
    });
  }, [scanOne]);

  // ── Enumerate pages via xmc.authoring.graphql + auto-scan first N ───────
  const enumerateAndScan = useCallback(async () => {
    if (!client) return;

    const siteId = currentSiteIdRef.current;
    const siteName = currentSiteNameRef.current;
    if (!siteId || !siteName) {
      console.warn(
        "[sitePages] enumerateAndScan called before site.context resolved",
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Try xmc.sites.retrieveSite — gives us targetHostname (public domain)
      // AND homePageId (the home item ID) in one call. If the Sites scope isn't
      // available (401 M2M error), we fall back to env domain + content-tree walk.
      const siteInfo = await retrieveSiteInfo(client, siteId);
      if (siteInfo.apiError) {
        console.warn(
          "[sitePages] retrieveSite API error — falling back to env domain + content-tree walk:",
          siteInfo.apiError,
        );
      } else {
        console.log(
          "[sitePages] retrieveSite → targetHostname:",
          siteInfo.targetHostname,
          "homePageId:",
          siteInfo.homePageId,
        );
      }

      // Domain: SDK hostname wins; env is the fallback
      const sdkDomain = siteInfo.targetHostname
        ? siteInfo.targetHostname.startsWith("http")
          ? siteInfo.targetHostname
          : `https://${siteInfo.targetHostname}`
        : "";
      const envDomain = process.env.NEXT_PUBLIC_DEFAULT_SITE_DOMAIN ?? "";
      const envDomainNormalized = envDomain
        ? envDomain.startsWith("http")
          ? envDomain
          : `https://${envDomain}`
        : "";
      const domain = sdkDomain || envDomainNormalized;

      setSiteContext({ id: siteId, domain, name: siteName });

      if (!domain) {
        setError(
          "Site domain not configured. Either configure Marketplace M2M for xmc.sites.retrieveSite, or set NEXT_PUBLIC_DEFAULT_SITE_DOMAIN.",
        );
        setPages([]);
        setIsLoading(false);
        return;
      }

      // 2. application.context → sitecoreContextId for the GraphQL call
      let sitecoreContextId: string | undefined;
      try {
        const appRes = await client.query("application.context");
        const app = (
          appRes as {
            data?: {
              resourceAccess?: Array<{
                context?: { preview?: string; live?: string };
              }>;
              resources?: Array<{
                context?: { preview?: string; live?: string };
              }>;
            };
          }
        )?.data;
        const list = app?.resourceAccess ?? app?.resources ?? [];
        for (const r of list) {
          if (r?.context?.preview) {
            sitecoreContextId = r.context.preview;
            break;
          }
          if (r?.context?.live) {
            sitecoreContextId = r.context.live;
            break;
          }
        }
        console.log("[sitePages] sitecoreContextId:", sitecoreContextId);
      } catch (err) {
        console.warn("[sitePages] application.context query failed:", err);
      }

      // 3. Fetch robots.txt once for this domain
      if (robotsFetchedDomainRef.current !== domain) {
        robotsFetchedDomainRef.current = domain;
        robotsRef.current = await tryJson<RobotsTxt>(
          fetch(
            `${base}/api/robots-check?domain=${encodeURIComponent(domain)}`,
          ),
        );
      }

      // 4. Resolve site Home reference. Three-tier strategy:
      //   a. homePageId from xmc.sites.retrieveSite (preferred — exact match)
      //   b. content-tree walk by siteName (works without Sites M2M scope)
      //   c. NEXT_PUBLIC_SITE_ROOT_PATH env override (manual fallback)
      const language = "en";
      const envOverride = process.env.NEXT_PUBLIC_SITE_ROOT_PATH?.trim();
      let lookupBy: "itemId" | "path" = "itemId";
      let rootRef: string | null = siteInfo.homePageId ?? null;

      if (rootRef) {
        console.log("[sitePages] using homePageId from retrieveSite:", rootRef);
      } else {
        // Walk the content tree as fallback
        lookupBy = "path";
        rootRef = await discoverSiteHomePath(
          client,
          siteName,
          language,
          sitecoreContextId,
        );
        if (rootRef) {
          console.log("[sitePages] auto-discovered rootPath:", rootRef);
        } else if (envOverride) {
          rootRef = envOverride;
          console.warn(
            `[sitePages] auto-discovery failed for "${siteName}"; using env override:`,
            rootRef,
          );
        } else {
          throw new Error(
            `Could not find Home item for site "${siteName}". Configure Marketplace M2M for xmc.sites.retrieveSite, or set NEXT_PUBLIC_SITE_ROOT_PATH explicitly.`,
          );
        }
      }

      // 5. Authoring GraphQL — walk descendants of Home to TREE_WALK_DEPTH levels
      const query = buildSitePagesQuery(TREE_WALK_DEPTH, lookupBy);
      const variables =
        lookupBy === "itemId"
          ? { rootItemId: rootRef, language }
          : { rootPath: rootRef, language };

      console.log("[sitePages] GraphQL query:\n", query);
      console.log("[sitePages] GraphQL variables:", variables);
      console.log("[sitePages] sitecoreContextId:", sitecoreContextId);

      const gqlRes = await client.mutate("xmc.authoring.graphql", {
        params: {
          body: { query, variables },
          ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
        },
      } as Parameters<ClientSDK["mutate"]>[1]);

      const envelope: GqlEnvelope =
        ((gqlRes as { data?: GqlEnvelope })?.data as GqlEnvelope) ??
        (gqlRes as GqlEnvelope);

      // Always log the full envelope. Errors come with a `path` array pointing
      // to the failing field, which is the only way to tell which item in the
      // tree triggered the failure.
      try {
        const fullJson = JSON.stringify(gqlRes, null, 2);
        console.log(
          `[sitePages] authoring.graphql full response (${fullJson.length} chars):`,
          fullJson,
        );
      } catch (stringifyErr) {
        console.log("[sitePages] authoring.graphql (non-serialisable):", gqlRes, stringifyErr);
      }

      // GraphQL field-level errors (e.g. an item whose TemplateID is the
      // zero-GUID "{00000000-...}") come back ALONGSIDE a full partial `data`
      // tree — the offending node simply has `template: null`. These are NOT
      // fatal: the bad item is typically a non-page item (data/settings folder
      // or an item with no version in this language) that flattenPages filters
      // out anyway, and a null template name correctly fails the Article check.
      // Only a missing `data.item` (bad root, auth failure) is fatal.
      const root = envelope?.data?.item ?? null;

      if (envelope?.errors?.length) {
        console.warn(
          `[sitePages] GraphQL returned ${envelope.errors.length} non-fatal error(s) (proceeding with partial data):`,
        );
        envelope.errors.forEach((e, i) => {
          console.warn(`  error[${i}] message:`, e.message);
          console.warn(`  error[${i}] path:`, e.path);

          // Navigate the partial tree to identify the offending item. Path
          // looks like ["item","children","nodes",3,"children","nodes",1,"template"]
          if (e.path) {
            let cursor: unknown = envelope.data;
            let offending: { itemId?: string; name?: string; path?: string } | null =
              null;
            for (const segment of e.path) {
              if (cursor && typeof cursor === "object") {
                cursor = (cursor as Record<string | number, unknown>)[segment];
                if (cursor && typeof cursor === "object" && "itemId" in cursor) {
                  const item = cursor as GqlItemNode;
                  offending = {
                    itemId: item.itemId,
                    name: item.name,
                    path: item.path,
                  };
                }
              } else {
                break;
              }
            }
            if (offending) {
              console.warn(`  error[${i}] offending item:`, offending);
            }
          }
        });
      }

      if (!root) {
        const detail = envelope?.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join("; ");
        throw new Error(
          detail
            ? `GraphQL errors with no usable data: ${detail}`
            : `No item found at ${lookupBy}=${rootRef}. Verify the site's Home item exists.`,
        );
      }

      const pageNodes = flattenPages(root);
      console.log(`[sitePages] flattened ${pageNodes.length} pages from tree`);

      // 6. Sort by updated desc, build rows with cache lookup (per-site)
      const cache = readCache(siteId);
      const rows: PageMatrixRow[] = pageNodes
        .map<PageMatrixRow>((p) => {
          const route = pathToRoute(p.path);
          const pageUrl = buildPageUrl(domain, route);
          const lastModified = p.updated?.value ?? "";
          const cached = cache[pageUrl];
          const fromCache =
            cached && cached.updatedAt === lastModified ? cached : null;
          const metaTitle = p.metaTitle?.value?.trim() || null;
          const metaDescription =
            p.metaDescription?.value?.trim() ||
            p.ogDescription?.value?.trim() ||
            null;
          return {
            id: p.itemId ?? pageUrl,
            name: p.displayName || p.name || "(untitled)",
            route,
            pageUrl,
            templateName: p.template?.name ?? "",
            lastModified,
            metaTitle,
            metaDescription,
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

      // 7. Auto-scan the first N un-scanned rows
      const toScan = rows
        .filter((r) => r.scanStatus === "idle")
        .slice(0, INITIAL_AUTO_SCAN_COUNT);
      await withConcurrency(toScan, CONCURRENCY, async (row) => {
        await scanOne(row);
      });
    } catch (err) {
      console.error("[sitePages] enumeration failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not load pages: ${message}`);
      setIsLoading(false);
    }
  }, [client, base, scanOne]);

  // ── site.context subscription ────────────────────────────────────────────
  // Pages app updates site.context when the user switches sites in the
  // dashboard; subscribing means we auto-re-enumerate without a manual reload.
  useEffect(() => {
    if (!client || !isInitialized) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const applySiteContext = (payload: unknown) => {
      if (cancelled) return;
      const ctx =
        (payload as { data?: SiteContextShape })?.data ??
        (payload as SiteContextShape) ??
        {};
      const info = ctx.siteInfo;
      const newSiteId = info?.siteId ?? "";
      const newSiteName = info?.name ?? "";

      if (!newSiteId) {
        setError("Could not load site context.");
        setPages([]);
        setSiteContext({ id: "", domain: "", name: "" });
        setIsLoading(false);
        return;
      }

      const changed = newSiteId !== currentSiteIdRef.current;
      currentSiteIdRef.current = newSiteId;
      currentSiteNameRef.current = newSiteName;

      if (changed) {
        console.log(
          `[sitePages] site changed → siteId=${newSiteId} name=${newSiteName}`,
        );
        // Wipe rows from the previous site immediately to avoid showing stale
        // entries while the new site enumerates.
        setPages([]);
        void enumerateAndScan();
      }
    };

    (async () => {
      try {
        const initial = await client.query("site.context");
        applySiteContext(initial);
      } catch (err) {
        console.error("[sitePages] initial site.context query failed:", err);
        if (!cancelled) {
          setError("Could not load site context.");
          setIsLoading(false);
        }
      }

      try {
        const subRes = await client.query("site.context", {
          subscribe: true,
          onSuccess: (res: unknown) => applySiteContext(res),
        } as Parameters<ClientSDK["query"]>[1]);
        unsubscribe = (subRes as { unsubscribe?: () => void })?.unsubscribe;
      } catch (err) {
        console.warn("[sitePages] site.context subscription failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
    };
  }, [client, isInitialized, enumerateAndScan]);

  const refresh = useCallback(() => {
    void enumerateAndScan();
  }, [enumerateAndScan]);

  const clearAndRefresh = useCallback(() => {
    clearCache(currentSiteIdRef.current);
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
    [
      pages,
      siteContext,
      isLoading,
      error,
      scanningCount,
      refresh,
      scanRow,
      scanAll,
      clearAndRefresh,
    ],
  );
}

// Backwards-compat — old name kept for any importer not yet updated
export type RowScanStatusType = RowScanStatus;
