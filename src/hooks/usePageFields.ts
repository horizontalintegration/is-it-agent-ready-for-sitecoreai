"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { AuthoringFields, FaqItem } from "@/lib/rule-engine/types";
import { stripHtml } from "@/lib/rule-engine/helpers";
import { pageFieldsFromFieldMap } from "@/lib/checks/context";
import type { PageFields } from "@/lib/checks/types";
import { FIELD_MAP, resolveFieldName } from "@/lib/sitecore/field-map";

/**
 * Everything an Apply needs to write a page field via `xmc.pages.updateFields`
 * (src/lib/sitecore/write.ts). `fieldNames` maps each field the app writes to
 * its name on the current page item — null when the page's template doesn't
 * define it, or none is configured. (updateFields matches fields by name.)
 */
export interface PageWriteContext {
  pageId: string | null;
  /** Content path of the page item, e.g. /sitecore/content/…/Home/About. */
  pagePath: string | null;
  pageName: string | null;
  language: string;
  sitecoreContextId: string | undefined;
  fieldNames: {
    pageTitle: string | null;
    metaDescription: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    author: string | null;
    jsonLd: string | null;
  };
}

/** One FAQ question and answer, with the datasource item it's stored in (plan section 13, item 4). */
export interface FaqSource {
  itemId: string;
  path: string;
  question: string;
  /** The answer field's raw rich text. */
  answerHtml: string;
  /** The answer as plain text. */
  answer: string;
  /** The answer field's name on the item. */
  answerField: string;
}

interface UsePageFieldsResult {
  fields: Partial<AuthoringFields> | null;
  /** The fields the checks read, by the same names the dashboard reads. Null until loaded. */
  scoringFields: PageFields | null;
  pageUrl: string;
  /** Public route of the open page ("/" for the home page). */
  route: string;
  /** Sitecore template display name, e.g. "Article Detail Page". */
  templateName: string | null;
  siteDomain: string;
  /** The site's display name (or its name), for the Organization fallback. */
  siteName: string;
  editingToken: string;
  isLoading: boolean;
  writeContext: PageWriteContext;
  /** Goes up on every `pages.content.fieldsUpdated`, so the draft HTML can be re-read. */
  contentVersion: number;
  /** The page's FAQ pairs with their datasource items (AccordionItem renderings). */
  faqSources: FaqSource[];
  /** Every datasource the page's own layout references, resolved to a path or an item ID. */
  datasources: string[];
  /** The page item's raw field values, by field name as the item spells it (image fields, author, …). */
  fieldValues: Record<string, string>;
  /** Reads the page's fields and FAQ datasources again (after a write). */
  refetch: () => void;
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
  displayName?: string;
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
      path
      template { name }
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
      path?: string;
      template?: { name?: string | null } | null;
      fields?: { nodes?: AuthoringItemFieldNode[] };
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

interface FieldFetchResult {
  /** Lower-cased field name → value */
  values: Record<string, string>;
  /** Lower-cased field name → original field name, used for write-back via updateFields (which matches by name). */
  names: Record<string, string>;
  templateName: string | null;
}

async function fetchItemFieldsAuthoring(
  client: ClientSDK,
  itemRef: string,
  language: string,
  sitecoreContextId: string | undefined,
): Promise<FieldFetchResult | null> {
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

    // Key by lower-cased field name so lookups are case-insensitive — Sitecore
    // field-name casing varies by template (the FAQ fetcher below does the same).
    // `names` records the field's original name (and its existence on the page)
    // for write-back, since updateFields matches fields by name.
    const values: Record<string, string> = {};
    const names: Record<string, string> = {};
    for (const n of nodes) {
      if (!n?.name) continue;
      const key = n.name.toLowerCase();
      names[key] = n.name;
      if (typeof n.value === "string") values[key] = n.value;
    }
    return { values, names, templateName: envelope?.data?.item?.template?.name ?? null };
  } catch (err) {
    console.error("[usePageFields] authoring.graphql threw:", err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AccordionItem / FAQ fetching
// ────────────────────────────────────────────────────────────────────────────

/** Fetch the question and answer fields of a single AccordionItem datasource. */
async function fetchAccordionItemFields(
  client: ClientSDK,
  dataSource: string,
  language: string,
  sitecoreContextId: string | undefined,
): Promise<FaqSource | null> {
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
    const names: Record<string, string> = {};
    for (const n of nodes) {
      if (n?.name && typeof n.value === "string") {
        fieldMap[n.name.toLowerCase()] = n.value;
        names[n.name.toLowerCase()] = n.name;
      }
    }

    // The configured field names first (FIELD_MAP), then the common ones.
    const pick = (candidates: string[]) => candidates.map((c) => c.toLowerCase()).find((c) => fieldMap[c] !== undefined) ?? null;
    const questionKey = pick([FIELD_MAP.faqQuestion, "heading", "title"]);
    const answerKey = pick([FIELD_MAP.faqAnswer, "content", "text", "body"]);
    const item = envelope?.data?.item;
    if (!questionKey || !answerKey || !item?.itemId) return null;
    const question = fieldMap[questionKey];
    const answerHtml = fieldMap[answerKey];
    if (!question || !answerHtml) return null;

    return {
      itemId: item.itemId,
      path: item.path ?? dataSource,
      question,
      answerHtml,
      answer: stripHtml(answerHtml),
      answerField: names[answerKey],
    };
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
    return `https://${siteInfo.targetHostname}`;
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
      return candidate.startsWith("http") ? candidate : `https://${candidate}`;
    }
  }

  if (typeof siteInfo.url === "string" && siteInfo.url.length > 0) {
    return siteInfo.url.startsWith("http") ? siteInfo.url : `https://${siteInfo.url}`;
  }

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
    const v = fieldMap[name.toLowerCase()];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const robotsMetaTag = (get("robotsMetaTag") ?? "index").toLowerCase();
  const noIndexField = robotsMetaTag.includes("noindex");

  return {
    pageTitle: get(FIELD_MAP.metaTitle) ?? pageName ?? null,
    metaDescription: get(FIELD_MAP.metaDescription),
    ogTitle: get(FIELD_MAP.ogTitle),
    ogDescription: get(FIELD_MAP.ogDescription),
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

const NO_FIELD_NAMES: PageWriteContext["fieldNames"] = {
  pageTitle: null,
  metaDescription: null,
  ogTitle: null,
  ogDescription: null,
  author: null,
  jsonLd: null,
};

function buildFieldNames(
  nameMap: Record<string, string>,
): PageWriteContext["fieldNames"] {
  // nameMap is keyed by lower-cased field name → original name (see fetchItemFieldsAuthoring).
  // A null entry means the field isn't present on the page's template (field names: FIELD_MAP).
  return {
    pageTitle: resolveFieldName(nameMap, FIELD_MAP.metaTitle),
    metaDescription: resolveFieldName(nameMap, FIELD_MAP.metaDescription),
    ogTitle: resolveFieldName(nameMap, FIELD_MAP.ogTitle),
    ogDescription: resolveFieldName(nameMap, FIELD_MAP.ogDescription),
    author: resolveFieldName(nameMap, FIELD_MAP.author),
    jsonLd: resolveFieldName(nameMap, FIELD_MAP.jsonLd),
  };
}

/** A layout datasource as a path or item ID: `local:/Data/Faq1` resolves under the page. */
function resolveDatasource(dataSource: string, pagePath: string | undefined): string {
  return dataSource.startsWith("local:") ? `${pagePath ?? ""}${dataSource.slice("local:".length)}` : dataSource;
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function usePageFields(
  client: ClientSDK | null,
  isInitialized: boolean,
): UsePageFieldsResult {
  const [fields, setFields] = useState<Partial<AuthoringFields> | null>(null);
  const [scoringFields, setScoringFields] = useState<PageFields | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [route, setRoute] = useState<string>("");
  const [pageUrl, setPageUrl] = useState<string>("");
  const [siteDomain, setSiteDomain] = useState<string>("");
  const [siteName, setSiteName] = useState<string>("");
  const [editingToken, setEditingToken] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [contentVersion, setContentVersion] = useState(0);
  const [writeContext, setWriteContext] = useState<PageWriteContext>({
    pageId: null,
    pagePath: null,
    pageName: null,
    language: "en",
    sitecoreContextId: undefined,
    fieldNames: NO_FIELD_NAMES,
  });
  const [faqSources, setFaqSources] = useState<FaqSource[]>([]);
  const [datasources, setDatasources] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Refs hold the latest values across async closures.
  const fieldMapRef = useRef<Record<string, string>>({});
  const fieldNameMapRef = useRef<Record<string, string>>({});
  const currentPathRef = useRef<string | undefined>(undefined);
  const currentPageIdRef = useRef<string | undefined>(undefined);
  const currentLanguageRef = useRef<string>("en");
  const currentPageNameRef = useRef<string | undefined>(undefined);
  const contextIdRef = useRef<string | undefined>(undefined);
  const currentSiteRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const faqItemsRef = useRef<FaqSource[]>([]);
  const datasourcesRef = useRef<string[]>([]);
  const templateNameRef = useRef<string | null>(null);

  const rebuildFields = useCallback(() => {
    const faqItems: FaqItem[] = faqItemsRef.current.map((f) => ({ question: f.question, answer: f.answer }));
    setFields(
      mapFieldsToAuthoring(fieldMapRef.current, currentPageNameRef.current, faqItems),
    );
    setFaqSources(faqItemsRef.current);
    setDatasources(datasourcesRef.current);
    setFieldValues(
      Object.fromEntries(Object.entries(fieldNameMapRef.current).map(([key, name]) => [name, fieldMapRef.current[key] ?? ""])),
    );
    // Null while the page's fields are loading, so the checks wait for them.
    setScoringFields(
      Object.keys(fieldMapRef.current).length > 0 ? pageFieldsFromFieldMap(fieldMapRef.current) : null,
    );
    setTemplateName(templateNameRef.current);
    setWriteContext({
      pageId: currentPageIdRef.current ?? null,
      pagePath: currentPathRef.current ?? null,
      pageName: currentPageNameRef.current ?? null,
      language: currentLanguageRef.current,
      sitecoreContextId: contextIdRef.current,
      fieldNames: buildFieldNames(fieldNameMapRef.current),
    });
  }, []);

  // Fetch AccordionItem datasource fields and rebuild FAQ items for the current page.
  const refetchFaqItems = useCallback(async () => {
    if (!client) return;
    const pageId = currentPageIdRef.current;
    if (!pageId) return;

    const site = currentSiteRef.current ?? "";
    const language = currentLanguageRef.current;

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

      const finalLayout = page?.finalLayout;

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

      // Every datasource (AI Assist reads their image fields on demand); the
      // AccordionItem ones (matched by rendering ID) are the FAQ pairs.
      const datasources: string[] = [];
      const accordion: string[] = [];
      for (const device of parsedLayout.devices ?? []) {
        for (const rendering of device.renderings ?? []) {
          if (!rendering.dataSource) continue;
          const ds = resolveDatasource(rendering.dataSource, currentPathRef.current);
          if (!datasources.includes(ds)) datasources.push(ds);
          if (rendering.id?.toLowerCase() === ACCORDION_ITEM_RENDERING_ID) accordion.push(ds);
        }
      }
      datasourcesRef.current = datasources;

      if (accordion.length === 0) {
        faqItemsRef.current = [];
        rebuildFields();
        return;
      }

      const results = await Promise.allSettled(
        accordion.map((ds) =>
          fetchAccordionItemFields(client, ds, language, contextIdRef.current)
        )
      );

      const items: FaqSource[] = [];
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) items.push(r.value);
        else if (r.status === "rejected") console.warn("[faq] datasource fetch rejected:", r.reason);
      }

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
        fieldMapRef.current = result.values;
        fieldNameMapRef.current = result.names;
        templateNameRef.current = result.templateName;
        rebuildFields();
      }
    } finally {
      if (inFlightRef.current === p) inFlightRef.current = null;
    }
  }, [client, rebuildFields]);

  // After a write: the page's fields and FAQ answers as Sitecore now has them.
  const refetch = useCallback(() => {
    void refetchFields();
    void refetchFaqItems();
  }, [refetchFields, refetchFaqItems]);

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

      const resolvedSiteName =
        (typeof siteInfo?.displayName === "string" && siteInfo.displayName) ||
        (typeof siteInfo?.name === "string" && siteInfo.name) ||
        "";

      if (cancelled) return;
      if (resolvedDomain) setSiteDomain(resolvedDomain);
      if (resolvedSiteName) setSiteName(resolvedSiteName);
      if (resolvedUrl) setPageUrl(resolvedUrl);
      setRoute(routePath || "/");

      if (pageChanged) {
        // Discard fields and FAQ items from the previous page and refetch
        fieldMapRef.current = {};
        fieldNameMapRef.current = {};
        faqItemsRef.current = [];
        datasourcesRef.current = [];
        templateNameRef.current = null;
        rebuildFields();
        void refetchFields();
        void refetchFaqItems();
      } else {
        // Same page, just update the name fallback in case it changed
        rebuildFields();
      }
    };

    const onFieldsUpdated = () => {
      // Notification only — re-fetch from authoring API to get authoritative values.
      void refetchFields();
      setContentVersion((v) => v + 1);
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
    () => ({ fields, scoringFields, pageUrl, route, templateName, siteDomain, siteName, editingToken, isLoading, writeContext, contentVersion, faqSources, datasources, fieldValues, refetch }),
    [fields, scoringFields, pageUrl, route, templateName, siteDomain, siteName, editingToken, isLoading, writeContext, contentVersion, faqSources, datasources, fieldValues, refetch],
  );
}
