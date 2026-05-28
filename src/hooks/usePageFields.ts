"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClientSDK,
  ContentFieldsUpdatedData,
} from "@sitecore-marketplace-sdk/client";
import type { AuthoringFields, FaqItem } from "@/lib/rule-engine/types";
import { stripHtml } from "@/lib/rule-engine/helpers";

interface UsePageFieldsResult {
  fields: Partial<AuthoringFields> | null;
  pageUrl: string;
  siteDomain: string;
  editingToken: string;
  isLoading: boolean;
}

type SdkPageInfo = {
  name?: string;
  path?: string;
  url?: string;
  route?: string;
  id?: string;
  language?: string;
  itemId?: string;
  [key: string]: unknown;
};

type SdkSiteInfo = {
  id?: string;
  name?: string;
  targetHostname?: string;
  hosts?: unknown;
  url?: string;
  [key: string]: unknown;
};

type SdkPagesContext = {
  pageInfo?: SdkPageInfo;
  siteInfo?: SdkSiteInfo;
};

type SdkApplicationResource = {
  resourceId?: string;
  tenantId?: string;
  tenantName?: string;
  context?: { live?: string; preview?: string };
  [key: string]: unknown;
};

interface AppContextResponse {
  editingSecret?: string;
  resourceAccess?: SdkApplicationResource[];
  resources?: SdkApplicationResource[];
}

// ────────────────────────────────────────────────────────────────────────────
// Authoring GraphQL — fetch item fields via the SDK's brokered auth
// ────────────────────────────────────────────────────────────────────────────

const AUTHORING_ITEM_FIELDS_QUERY = /* GraphQL */ `
  query GetItemFields($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      name
      fields(ownFields: false) {
        nodes {
          name
          value
        }
      }
    }
  }
`;

interface AuthoringItemFieldNode {
  name?: string;
  value?: string;
}
interface AuthoringEnvelope {
  data?: {
    item?: {
      itemId?: string;
      name?: string;
      fields?: { nodes?: AuthoringItemFieldNode[] };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

async function fetchItemFieldsAuthoring(
  client: ClientSDK,
  itemRef: string,
  language: string,
  sitecoreContextId: string | undefined,
): Promise<Record<string, string> | null> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: {
          query: AUTHORING_ITEM_FIELDS_QUERY,
          variables: { path: itemRef, language },
        },
        ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
      },
    } as Parameters<ClientSDK["mutate"]>[1]);

    console.log(
      `[usePageFields] authoring.graphql ref="${itemRef}" raw:`,
      result,
    );

    const envelope =
      ((result as { data?: AuthoringEnvelope })?.data as AuthoringEnvelope) ??
      (result as AuthoringEnvelope);

    if (envelope?.errors?.length) {
      console.warn(
        "[usePageFields] authoring.graphql returned errors:",
        envelope.errors,
      );
    }

    const nodes = envelope?.data?.item?.fields?.nodes ?? [];
    if (nodes.length === 0) {
      console.warn(
        "[usePageFields] authoring.graphql returned no field nodes — envelope:",
        envelope,
      );
      return null;
    }

    const out: Record<string, string> = {};
    for (const n of nodes) {
      if (n?.name && typeof n.value === "string") out[n.name] = n.value;
    }
    console.log(
      "[usePageFields] authoring fields resolved:",
      Object.keys(out),
    );
    return out;
  } catch (err) {
    console.error("[usePageFields] authoring.graphql threw:", err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AccordionItem / FAQ fetching
// ────────────────────────────────────────────────────────────────────────────

/** Fetch heading + content fields for a single AccordionItem datasource. */
async function fetchAccordionItemFields(
  client: ClientSDK,
  dataSource: string,
  language: string,
  sitecoreContextId: string | undefined,
): Promise<FaqItem | null> {
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: {
          query: AUTHORING_ITEM_FIELDS_QUERY,
          variables: { path: dataSource, language },
        },
        ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
      },
    } as Parameters<ClientSDK["mutate"]>[1]);

    const envelope =
      ((result as { data?: AuthoringEnvelope })?.data as AuthoringEnvelope) ??
      (result as AuthoringEnvelope);

    const nodes = envelope?.data?.item?.fields?.nodes ?? [];
    if (nodes.length === 0) return null;

    const fieldMap: Record<string, string> = {};
    for (const n of nodes) {
      if (n?.name && typeof n.value === "string") {
        fieldMap[n.name.toLowerCase()] = n.value;
      }
    }

    const question = fieldMap["heading"] ?? fieldMap["title"] ?? null;
    const rawAnswer = fieldMap["content"] ?? fieldMap["text"] ?? fieldMap["body"] ?? null;
    if (!question || !rawAnswer) return null;

    return { question, answer: stripHtml(rawAnswer) };
  } catch (err) {
    console.error("[usePageFields] fetchAccordionItemFields threw:", err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractSiteDomain(siteInfo: SdkSiteInfo | undefined): string {
  if (!siteInfo) return "";

  // targetHostname is a direct property on the siteInfo object (no scheme prefix)
  if (typeof siteInfo.targetHostname === "string" && siteInfo.targetHostname) {
    const domain = `https://${siteInfo.targetHostname}`;
    console.log("[domain] resolved from siteInfo.targetHostname:", domain);
    return domain;
  }

  // Fallback: hosts array (older SDK shape)
  const hosts = siteInfo.hosts;
  if (Array.isArray(hosts) && hosts.length > 0) {
    const h0 = hosts[0] as Record<string, unknown>;
    const candidate =
      (typeof h0.targetHostName === "string" && h0.targetHostName) ||
      (typeof h0.hostName === "string" && h0.hostName) ||
      (typeof h0.url === "string" && h0.url) ||
      "";
    if (candidate) {
      const domain = candidate.startsWith("http") ? candidate : `https://${candidate}`;
      console.log("[domain] resolved from hosts[0]:", domain);
      return domain;
    }
  }

  if (typeof siteInfo.url === "string" && siteInfo.url.length > 0) {
    const domain = siteInfo.url.startsWith("http") ? siteInfo.url : `https://${siteInfo.url}`;
    console.log("[domain] resolved from siteInfo.url:", domain);
    return domain;
  }

  console.log("[domain] no domain found in siteInfo");
  return "";
}

function pickContextId(
  app: AppContextResponse | undefined,
): string | undefined {
  const list = app?.resourceAccess ?? app?.resources ?? [];
  for (const r of list) {
    if (r?.context?.preview) return r.context.preview;
    if (r?.context?.live) return r.context.live;
  }
  return undefined;
}

function mapFieldsToAuthoring(
  fieldMap: Record<string, string>,
  pageName: string | undefined,
  faqItems: FaqItem[] = [],
): Partial<AuthoringFields> {
  const get = (name: string): string | null => {
    const v = fieldMap[name];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const robotsMetaTag = (get("robotsMetaTag") ?? "index").toLowerCase();
  const noIndexField = robotsMetaTag.includes("noindex");

  return {
    pageTitle: get("pageTitle") ?? pageName ?? null,
    metaDescription: get("MetaDescription"),
    ogTitle: get("OpenGraphTitle"),
    ogDescription: get("OpenGraphDescription"),
    ogImage: get("OpenGraphImage"),
    author: null,
    publishDate: null,
    lastUpdatedDate: null,
    noIndexField,
    authorProfileLinked: false,
    richTextParagraphs: [],
    richTextFull: "",
    images: [],
    links: [],
    headings: [],
    faqItems,
    hasFaqComponent: faqItems.length > 0,
    hasHowToComponent: false,
  };
}

// Rendering template ID that identifies AccordionItem components in the layout.
const ACCORDION_ITEM_RENDERING_ID = "286d51ef-1a33-4920-9009-569a66a27629";

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function usePageFields(
  client: ClientSDK | null,
  isInitialized: boolean,
): UsePageFieldsResult {
  const [fields, setFields] = useState<Partial<AuthoringFields> | null>(null);
  const [pageUrl, setPageUrl] = useState<string>("");
  const [siteDomain, setSiteDomain] = useState<string>("");
  const [editingToken, setEditingToken] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Refs hold the latest values across async closures.
  const fieldMapRef = useRef<Record<string, string>>({});
  const currentPathRef = useRef<string | undefined>(undefined);
  const currentPageIdRef = useRef<string | undefined>(undefined);
  const currentLanguageRef = useRef<string>("en");
  const currentPageNameRef = useRef<string | undefined>(undefined);
  const contextIdRef = useRef<string | undefined>(undefined);
  const currentSiteRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const faqItemsRef = useRef<FaqItem[]>([]);

  const rebuildFields = useCallback(() => {
    setFields(
      mapFieldsToAuthoring(fieldMapRef.current, currentPageNameRef.current, faqItemsRef.current),
    );
  }, []);

  // Fetch AccordionItem datasource fields and rebuild FAQ items for the current page.
  const refetchFaqItems = useCallback(async () => {
    if (!client) return;
    const pageId = currentPageIdRef.current;
    if (!pageId) return;

    const site = currentSiteRef.current ?? "";
    const language = currentLanguageRef.current;
    console.log(`[faq] refetchFaqItems: pageId=${pageId} site="${site}" lang=${language}`);

    try {
      // client.query extracts { params: u } from the second arg and passes u to the SDK fn.
      const pageRes = await client.query("xmc.pages.retrievePage", {
        params: {
          path: { pageId },
          query: {
            site,
            language,
            ...(contextIdRef.current ? { sitecoreContextId: contextIdRef.current } : {}),
          },
        },
      } as Parameters<ClientSDK["query"]>[1]);

      // Response structure: pageRes.data.data = actual page object (double-wrapped by SDK + hey-api)
      const sdkData = (pageRes as { data?: { data?: { finalLayout?: string | null } } })?.data;
      const page = sdkData?.data;
      console.log("[faq] page keys:", Object.keys(page ?? {}));

      const finalLayout = page?.finalLayout;
      console.log("[faq] finalLayout:", typeof finalLayout, finalLayout ? `(${finalLayout.length} chars)` : finalLayout);

      if (!finalLayout) {
        console.warn("[faq] no finalLayout — aborting");
        faqItemsRef.current = [];
        rebuildFields();
        return;
      }

      // finalLayout is a JSON string: { devices: [{ renderings: [{ id, dataSource, ... }] }] }
      let parsedLayout: { devices?: Array<{ renderings?: Array<{ id?: string; dataSource?: string }> }> };
      try {
        parsedLayout = JSON.parse(finalLayout) as typeof parsedLayout;
      } catch {
        console.warn("[faq] failed to parse finalLayout JSON");
        faqItemsRef.current = [];
        rebuildFields();
        return;
      }

      // Log every rendering id so we can confirm the accordion ID
      const allIds = (parsedLayout.devices ?? []).flatMap(d =>
        (d.renderings ?? []).map(r => r.id ?? "(no id)")
      );
      console.log("[faq] all rendering ids on page:", allIds);
      console.log("[faq] looking for accordion id:", ACCORDION_ITEM_RENDERING_ID);

      // Only collect datasources belonging to AccordionItem renderings (matched by template ID).
      const datasources: string[] = [];
      for (const device of parsedLayout.devices ?? []) {
        for (const rendering of device.renderings ?? []) {
          if (rendering.id?.toLowerCase() !== ACCORDION_ITEM_RENDERING_ID) continue;
          if (!rendering.dataSource) continue;
          const ds = rendering.dataSource.startsWith("local:")
            ? `${currentPathRef.current}${rendering.dataSource.slice("local:".length)}`
            : rendering.dataSource;
          console.log(`[faq] AccordionItem datasource: "${rendering.dataSource}" → "${ds}"`);
          datasources.push(ds);
        }
      }

      console.log(`[faq] found ${datasources.length} AccordionItem rendering(s) on page`);

      if (datasources.length === 0) {
        faqItemsRef.current = [];
        rebuildFields();
        return;
      }

      const results = await Promise.allSettled(
        datasources.map((ds) =>
          fetchAccordionItemFields(client, ds, language, contextIdRef.current)
        )
      );

      const items: FaqItem[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) items.push(r.value);
        else if (r.status === "rejected") console.warn("[faq] datasource fetch rejected:", r.reason);
      }

      console.log(`[faq] resolved ${items.length} AccordionItem FAQ item(s)`);
      faqItemsRef.current = items;
      rebuildFields();
    } catch (err) {
      console.error("[faq] refetchFaqItems threw:", err);
    }
  }, [client, rebuildFields]);

  // Fetch fields for the current page (debounced via an in-flight guard).
  const refetchFields = useCallback(async () => {
    if (!client) return;
    const ref = currentPathRef.current;
    if (!ref) return;

    const language = currentLanguageRef.current;
    const ctxId = contextIdRef.current;

    // If a fetch is already running, wait for it (avoids duplicate calls
    // when both pages.context and fieldsUpdated fire close together).
    if (inFlightRef.current) {
      try {
        await inFlightRef.current;
      } catch {
        // ignore
      }
    }

    const p = fetchItemFieldsAuthoring(client, ref, language, ctxId);
    inFlightRef.current = p;
    try {
      const result = await p;
      if (result) {
        fieldMapRef.current = result;
        rebuildFields();
      }
    } finally {
      if (inFlightRef.current === p) inFlightRef.current = null;
    }
  }, [client, rebuildFields]);

  useEffect(() => {
    if (!client || !isInitialized) return;

    let cancelled = false;
    let unsubscribeFields: (() => void) | undefined;
    let pagesContextSub: { unsubscribe?: () => void } | null = null;

    const applyPagesContext = (payload: unknown) => {
      const ctx =
        (payload as { data?: SdkPagesContext })?.data ??
        (payload as SdkPagesContext);

      const pageInfo = ctx?.pageInfo;
      const siteInfo = ctx?.siteInfo;

      // Track current page metadata
      const newPath =
        typeof pageInfo?.path === "string" ? pageInfo.path : undefined;
      const newLang =
        typeof pageInfo?.language === "string" ? pageInfo.language : "en";
      const newName =
        typeof pageInfo?.name === "string" ? pageInfo.name : undefined;

      const newPageId = typeof pageInfo?.id === "string" ? pageInfo.id : (typeof pageInfo?.itemId === "string" ? pageInfo.itemId : undefined);
      const pageChanged = newPath !== currentPathRef.current;

      currentPathRef.current = newPath;
      currentPageIdRef.current = newPageId;
      currentLanguageRef.current = newLang;
      currentPageNameRef.current = newName;
      currentSiteRef.current =
        (typeof siteInfo?.name === "string" && siteInfo.name) ||
        (typeof siteInfo?.id === "string" && siteInfo.id) ||
        currentSiteRef.current;

      // Build the public web URL: siteInfo.hosts[0].targetHostName wins;
      // fall back to the NEXT_PUBLIC_DEFAULT_SITE_DOMAIN env variable.
      const sdkDomain = extractSiteDomain(siteInfo);
      const fallbackDomain =
        process.env.NEXT_PUBLIC_DEFAULT_SITE_DOMAIN ?? "";
      const resolvedDomain = sdkDomain || fallbackDomain;
      console.log("[domain] sdkDomain:", sdkDomain, "| envFallback:", fallbackDomain, "| resolved:", resolvedDomain);
      const cleanDomain = resolvedDomain.replace(/\/+$/, "");
      const route = typeof pageInfo?.route === "string" ? pageInfo.route : "";
      const routePath = route
        ? route.startsWith("/")
          ? route
          : `/${route}`
        : "";
      const resolvedUrl = cleanDomain ? `${cleanDomain}${routePath}` : "";

      if (!route) {
        console.warn(
          "[usePageFields] pageInfo.route is empty — falling back to domain root for the rendered-HTML fetch. pageInfo:",
          pageInfo,
        );
      }

      if (cancelled) return;
      if (resolvedDomain) setSiteDomain(resolvedDomain);
      if (resolvedUrl) setPageUrl(resolvedUrl);

      if (pageChanged) {
        // Discard fields and FAQ items from the previous page and refetch
        fieldMapRef.current = {};
        faqItemsRef.current = [];
        rebuildFields();
        void refetchFields();
        void refetchFaqItems();
      } else {
        // Same page, just update the name fallback in case it changed
        rebuildFields();
      }
    };

    const onFieldsUpdated = (data: ContentFieldsUpdatedData) => {
      // Notification only — re-fetch from authoring API to get authoritative values.
      console.log(
        "[usePageFields] fieldsUpdated notification → refetching authoring fields",
        data,
      );
      void refetchFields();
    };

    (async () => {
      setIsLoading(true);

      try {
        const appRes = await client.query("application.context");
        const app = appRes?.data as AppContextResponse | undefined;
        if (!cancelled) {
          setEditingToken(app?.editingSecret ?? "");
        }
        contextIdRef.current = pickContextId(app);
        console.log(
          "[usePageFields] sitecoreContextId resolved to:",
          contextIdRef.current,
        );
      } catch (err) {
        console.error("application.context query failed:", err);
      }

      // Subscribe to field-update notifications (refetch trigger only)
      try {
        unsubscribeFields = client.subscribe("pages.content.fieldsUpdated", {
          onData: onFieldsUpdated,
          onError: (err) =>
            console.error("pages.content.fieldsUpdated error:", err),
        });
      } catch (err) {
        console.error("subscribe pages.content.fieldsUpdated failed:", err);
      }

      // pages.context one-shot then subscribe — sets current item and triggers fetch
      try {
        const pagesRes = await client.query("pages.context");
        applyPagesContext(pagesRes);
      } catch (err) {
        console.error("pages.context query failed:", err);
      }

      try {
        const subRes = await client.query("pages.context", {
          subscribe: true,
          onSuccess: (res: unknown) => applyPagesContext(res),
        } as Parameters<ClientSDK["query"]>[1]);
        pagesContextSub = subRes as { unsubscribe?: () => void };
      } catch (err) {
        console.error("pages.context subscription failed:", err);
      }

      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
      try {
        unsubscribeFields?.();
      } catch {
        // ignore
      }
      try {
        pagesContextSub?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, [client, isInitialized, refetchFields, refetchFaqItems, rebuildFields]);

  return useMemo(
    () => ({ fields, pageUrl, siteDomain, editingToken, isLoading }),
    [fields, pageUrl, siteDomain, editingToken, isLoading],
  );
}
