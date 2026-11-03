"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { fetchAiResults } from "@/lib/ai/ai-results-cache";
import type { AiResults, ParsedHtml } from "@/lib/rule-engine/types";
import type { MarkdownCheckData } from "@/lib/markdown/types";
import { getOrganizationInfo } from "@/lib/brand/organization";
import { buildPageContext, pageFieldsFromValues, SCORING_FIELD_NAMES } from "@/lib/checks/context";
import { runPageChecks } from "@/lib/checks/engine";
import { summarisePageReport, type PageScoreSummary } from "@/lib/checks/view-model";
import type { PageMatrixRow, RowScanStatus } from "@/types/dashboard";
import { HOST_AUTH_ERROR_MESSAGE, isHostAuthError } from "@/lib/xmc-errors";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Bump the version suffix whenever the scoring logic changes shape (new checks,
// pools, etc.) so cached scores from an older engine don't render stale values.
// v3: shared 80/60 label thresholds, and the AI check reads the page's main text.
// v4: the unified check engine (4 categories, tier pools, gate) — PageScoreSummary.
// v5: the summary keeps each page's issues for "Fix first"; v2 label names.
// v6: P5 and P6 (Markdown for agents), and whether each page serves Markdown.
const CACHE_KEY_PREFIX = "aiDiscovery:scores:v6:";

function cacheKey(siteId: string): string {
  return `${CACHE_KEY_PREFIX}${siteId}`;
}
const CONCURRENCY = 5;
/** The dashboard lists and scores the site's pages in this language. */
export const SITE_LANGUAGE = "en";
const TREE_WALK_DEPTH = 5; // descendants levels fetched per GraphQL call

// Sitecore field names pulled at enumeration time: the fields the checks read
// (SCORING_FIELD_NAMES, shared with the panel so both score the same) plus the
// OG description the llms.txt generator falls back to. Overridable per-tenant
// via env, since field names vary between SXA and custom templates.
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
    // The host refusing authorization isn't a missing site: let it surface.
    if (isHostAuthError(err)) throw err;
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
  sitecoreContextId: string | undefined,
): Promise<RetrieveSiteResult> {
  try {
    const res = await client.query("xmc.sites.retrieveSite", {
      params: {
        path: { siteId },
        ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
      },
    } as Parameters<ClientSDK["query"]>[1]);

    const outer = (res as { data?: unknown })?.data;
    const apiError = (
      outer as { error?: { status?: number; detail?: string; title?: string } }
    )?.error;
    if (apiError) {
      // Every other XM Cloud call would be refused the same way, so don't
      // fall back to the content-tree walk.
      if (isHostAuthError(apiError)) {
        throw new Error("Host authorization refused", { cause: apiError });
      }
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
    if (isHostAuthError(err)) throw err;
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
  robotsMetaTag?: { value?: string | null } | null;
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
// ItemQueryInput types itemId as ID and path as String; a variable declared
// with the other type fails validation ("The specified value type of field
// `itemId` does not match the field type", 2026-11-03).
export function buildSitePagesQuery(depth: number, by: "path" | "itemId"): string {
  // template { name } returns the template's display name (e.g.
  // "Article Detail Page"). isArticleTemplate in src/lib/checks/context.ts
  // compares it (case-insensitive) to mark article pages — this avoids the
  // runtime "template doesn't exist" error caused by resolving
  // template-by-id on items with missing or zero-GUID templates.
  const itemFields = `
    itemId
    name
    displayName
    path
    template { name }
    updated: field(name: "${SCORING_FIELD_NAMES.updated}") { value }
    renderings: field(name: "__Renderings") { value }
    finalRenderings: field(name: "__Final Renderings") { value }
    metaTitle: field(name: "${SCORING_FIELD_NAMES.metaTitle}") { value }
    metaDescription: field(name: "${SCORING_FIELD_NAMES.metaDescription}") { value }
    robotsMetaTag: field(name: "${SCORING_FIELD_NAMES.robotsMetaTag}") { value }
    ogDescription: field(name: "${FIELD_OG_DESCRIPTION}") { value }
  `;
  let inner = "";
  for (let i = 0; i < depth; i++) {
    inner = `children { nodes { ${itemFields} ${inner} } }`;
  }
  const varName = by === "itemId" ? "rootItemId" : "rootPath";
  const varType = by === "itemId" ? "ID!" : "String!";
  return `
    query GetSitePages($${varName}: ${varType}, $language: String!) {
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
  score: PageScoreSummary;
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
  siteContext: {
    id: string;
    domain: string;
    name: string;
    /** Org id (org_…) from application.context — for Pages editor deep-links. */
    organization: string;
    /** Tenant name from application.context resourceAccess — for Pages editor deep-links. */
    tenantName: string;
    /** For writes from the dashboard (Generate for all). */
    sitecoreContextId: string;
  };
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
    organization: "",
    tenantName: "",
    sitecoreContextId: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

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

  // ── Scan a single page: HTML, then AI, then the page checks ──────────────
  const scanOne = useCallback(
    async (row: PageMatrixRow) => {
      updateRow(row.id, { scanStatus: "scanning", scanError: undefined });

      // The live page, and the page requested as an agent and as a browser (P5, P6).
      // A failed Markdown request leaves P5 "not checked", out of the score.
      const [htmlRes, markdownRes] = await Promise.allSettled([
        tryJson<ParsedHtml>(
          fetch(
            `${base}/api/preview-fetch?url=${encodeURIComponent(row.pageUrl)}`,
          ),
        ),
        tryJson<MarkdownCheckData>(fetch(`${base}/api/markdown-check?url=${encodeURIComponent(row.pageUrl)}`)),
      ]);

      const parsedHtml = htmlRes.status === "fulfilled" ? htmlRes.value : null;
      const markdown = markdownRes.status === "fulfilled" ? markdownRes.value : null;
      let ai: AiResults | null = null;

      // Fire AI with the page's main text once HTML is in hand (same body as the panel).
      // Cached by content hash, so re-scans of unchanged pages don't call Claude.
      if (parsedHtml?.mainText) {
        ai = await fetchAiResults(base, parsedHtml.title ?? row.name, parsedHtml.mainText);
      }

      if (!parsedHtml) {
        updateRow(row.id, {
          scanStatus: "error",
          scanError: "Preview fetch failed",
        });
        return;
      }

      // Same context builder as the panel. The dashboard doesn't run PageSpeed,
      // so read.speed is "not checked" here and left out of the score.
      const report = runPageChecks(
        buildPageContext({
          pageUrl: row.pageUrl,
          route: row.route,
          templateName: row.templateName || null,
          fields: row.fields,
          html: parsedHtml,
          ai,
          markdown,
          psi: null,
          organization: getOrganizationInfo({ name: currentSiteNameRef.current, url: null }),
        }),
      );
      const score = summarisePageReport(report);

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
      // 1. application.context → sitecoreContextId, plus organizationId and
      //    tenantName for Pages-editor deep-links. Read first: every XM Cloud
      //    call needs the Context ID of an environment where the app is
      //    installed, including retrieveSite below.
      let sitecoreContextId: string | undefined;
      try {
        interface AppCtxShape {
          type?: string;
          installationId?: string;
          organizationId?: string;
          MarketplaceAppTenantId?: string;
          extensionPoints?: Array<{
            extensionPointId?: string;
            route?: string | null;
            // Dashboard blocks keep one route per widget here; their
            // top-level route is null.
            meta?: Array<{ id?: string; route?: string; title?: string }>;
          }>;
          resourceAccess?: Array<{
            tenantName?: string;
            tenantId?: string;
            context?: { preview?: string; live?: string };
          }>;
          resources?: Array<{
            tenantName?: string;
            tenantId?: string;
            context?: { preview?: string; live?: string };
          }>;
        }
        const appRes = await client.query("application.context");
        // The proxy sometimes double-wraps the envelope (data.data) like
        // retrieveSite does — unwrap defensively so we don't miss org/tenant.
        const outer = (appRes as { data?: unknown })?.data;
        const app: AppCtxShape =
          ((outer as { data?: AppCtxShape })?.data as AppCtxShape) ??
          (outer as AppCtxShape) ??
          {};
        const list = app?.resourceAccess ?? app?.resources ?? [];
        let tenantName = "";
        for (const r of list) {
          if (!tenantName && r?.tenantName) tenantName = r.tenantName;
          if (!sitecoreContextId && r?.context?.preview) {
            sitecoreContextId = r.context.preview;
          } else if (!sitecoreContextId && r?.context?.live) {
            sitecoreContextId = r.context.live;
          }
        }
        const organization = app?.organizationId ?? "";
        // Named fields only: the raw context can hold the editing secret.
        // For the dashboard authorization case (plan section 13, item 1).
        // `type` is the Marketplace app type (custom / public), not the host.
        console.log("[sitePages] application.context →", {
          organization,
          tenantName,
          marketplaceAppType: app?.type,
          installationId: app?.installationId,
          extensionPoints: (app?.extensionPoints ?? []).map((e) => ({
            id: e?.extensionPointId,
            route: e?.route,
            blocks: (e?.meta ?? []).map((m) => ({ id: m?.id, route: m?.route, title: m?.title })),
          })),
          resourceCount: list.length,
          hasContextId: Boolean(sitecoreContextId),
        });
        setSiteContext((prev) => ({ ...prev, organization, tenantName, sitecoreContextId: sitecoreContextId ?? "" }));
      } catch (err) {
        console.warn("[sitePages] application.context query failed:", err);
      }

      // host.state tells which Sitecore host runs the widget: null for the
      // Cloud Portal ("portal"), { environment, language } for SitecoreAI
      // ("xmc:xmapps"). Diagnostic only; only keys and those two fields are logged.
      try {
        const hostRes = await client.query("host.state");
        const state = (hostRes as { data?: unknown })?.data;
        const s = state as { environment?: unknown; language?: unknown } | null | undefined;
        console.log("[sitePages] host.state →", {
          isNull: state === null,
          keys: state && typeof state === "object" ? Object.keys(state) : [],
          environment: s?.environment,
          language: s?.language,
        });
      } catch (err) {
        console.warn("[sitePages] host.state query failed:", err);
      }

      if (!sitecoreContextId) {
        console.warn(
          "[sitePages] no Context ID in application.context (no resource with context.preview or context.live) — XM Cloud calls go out without one and may be refused",
        );
      }

      // 2. Try xmc.sites.retrieveSite — gives us targetHostname (public domain)
      // AND homePageId (the home item ID) in one call. If the Sites scope isn't
      // available (401 M2M error), we fall back to env domain + content-tree walk.
      const siteInfo = await retrieveSiteInfo(client, siteId, sitecoreContextId);
      if (siteInfo.apiError) {
        console.warn(
          "[sitePages] retrieveSite API error — falling back to env domain + content-tree walk:",
          siteInfo.apiError,
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

      setSiteContext((prev) => ({ ...prev, id: siteId, domain, name: siteName }));

      if (!domain) {
        setError(
          "Site domain not configured. Either configure Marketplace M2M for xmc.sites.retrieveSite, or set NEXT_PUBLIC_DEFAULT_SITE_DOMAIN.",
        );
        setPages([]);
        setIsLoading(false);
        return;
      }

      // 3. The site checks' data (robots.txt, the home page, the bot requests)
      // comes from /api/agent-access, fetched by useAgentAccess on the domain.

      // 4. Resolve site Home reference. Three-tier strategy:
      //   a. homePageId from xmc.sites.retrieveSite (preferred — exact match)
      //   b. content-tree walk by siteName (works without Sites M2M scope)
      //   c. NEXT_PUBLIC_SITE_ROOT_PATH env override (manual fallback)
      const language = SITE_LANGUAGE;
      const envOverride = process.env.NEXT_PUBLIC_SITE_ROOT_PATH?.trim();
      let lookupBy: "itemId" | "path" = "itemId";
      let rootRef: string | null = siteInfo.homePageId ?? null;

      if (!rootRef) {
        // Walk the content tree as fallback
        lookupBy = "path";
        rootRef = await discoverSiteHomePath(
          client,
          siteName,
          language,
          sitecoreContextId,
        );
        if (!rootRef && envOverride) {
          rootRef = envOverride;
          console.warn(
            `[sitePages] auto-discovery failed for "${siteName}"; using env override:`,
            rootRef,
          );
        } else if (!rootRef) {
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

      const gqlRes = await client.mutate("xmc.authoring.graphql", {
        params: {
          body: { query, variables },
          ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
        },
      } as Parameters<ClientSDK["mutate"]>[1]);

      const envelope: GqlEnvelope =
        ((gqlRes as { data?: GqlEnvelope })?.data as GqlEnvelope) ??
        (gqlRes as GqlEnvelope);

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
          const fields = pageFieldsFromValues({
            metaTitle: p.metaTitle?.value,
            metaDescription: p.metaDescription?.value,
            robotsMetaTag: p.robotsMetaTag?.value,
            updated: p.updated?.value,
          });
          const metaTitle = fields.metaTitle;
          const metaDescription =
            fields.metaDescription ||
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
            // field(name) is null when the page's template has no such field.
            metaDescriptionField: p.metaDescription ? SCORING_FIELD_NAMES.metaDescription : null,
            language: SITE_LANGUAGE,
            fields,
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

      // 7. Background scan-all: score every un-scanned row at CONCURRENCY.
      // Scores stream into `pages` as each completes, so the Overview hero,
      // category cards, and worst-pages list fill in live with a progress bar.
      const toScan = rows.filter((r) => r.scanStatus === "idle");
      await withConcurrency(toScan, CONCURRENCY, async (row) => {
        await scanOne(row);
      });
    } catch (err) {
      console.error("[sitePages] enumeration failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(isHostAuthError(err) ? HOST_AUTH_ERROR_MESSAGE : `Could not load pages: ${message}`);
      setIsLoading(false);
    }
  }, [client, scanOne]);

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
        setSiteContext({ id: "", domain: "", name: "", organization: "", tenantName: "", sitecoreContextId: "" });
        setIsLoading(false);
        return;
      }

      const changed = newSiteId !== currentSiteIdRef.current;
      currentSiteIdRef.current = newSiteId;
      currentSiteNameRef.current = newSiteName;

      if (changed) {
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
