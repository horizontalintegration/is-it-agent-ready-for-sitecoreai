"use client";

import { useEffect, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { imageFieldsOf, isSharedDatasource, type ImageField } from "@/lib/assist/images";
import { FIELD_MAP } from "@/lib/sitecore/field-map";

// ─────────────────────────────────────────────────────────────────────────────
// What the AI Assist tab reads from Sitecore when it's opened (not on every
// page change): the image fields on the page item and its datasources, with
// their media paths, and the author names used on the page's sibling articles.
// One aliased GraphQL request per step. Demo mode passes its fixture instead.
// ─────────────────────────────────────────────────────────────────────────────

type Envelope = { data?: Record<string, unknown> | null; errors?: Array<{ message?: string }> };

async function graphql(client: ClientSDK, contextId: string | undefined, query: string): Promise<Envelope> {
  const result = await client.mutate("xmc.authoring.graphql", {
    params: { body: { query, variables: {} }, ...(contextId ? { query: { sitecoreContextId: contextId } } : {}) },
  } as Parameters<ClientSDK["mutate"]>[1]);
  const outer = result as { data?: Envelope };
  return (outer?.data && ("data" in outer.data || "errors" in outer.data) ? outer.data : (result as Envelope)) ?? {};
}

const GUID = /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i;
const lit = (s: string) => JSON.stringify(s);

/** An aliased item lookup by ID (`ID` literal) or path. */
function itemWhere(ref: string, language: string): string {
  return GUID.test(ref) ? `itemId: ${lit(ref.replace(/[{}]/g, ""))}, language: ${lit(language)}` : `path: ${lit(ref)}, language: ${lit(language)}`;
}

type Status = "idle" | "loading" | "ready" | "error";

interface ItemNode {
  itemId?: string;
  path?: string;
  fields?: { nodes?: Array<{ name?: string; value?: string } | null> };
}

export function useImageFields(opts: {
  client: ClientSDK | null;
  contextId: string | undefined;
  enabled: boolean;
  pageId: string | null;
  pagePath: string | null;
  language: string;
  pageFieldValues: Record<string, string>;
  datasources: string[];
  demo: ImageField[] | null;
}): { status: Status; fields: ImageField[] } {
  const { client, contextId, enabled, pageId, pagePath, language, pageFieldValues, datasources, demo } = opts;
  const [state, setState] = useState<{ key: string; status: Status; fields: ImageField[] }>({ key: "", status: "idle", fields: [] });
  const key = `${pageId}|${language}|${datasources.join(",")}|${Object.values(pageFieldValues).filter((v) => v.includes("<image")).join("|")}`;

  useEffect(() => {
    if (demo || !enabled || !client || !pageId || state.key === key) return;
    let cancelled = false;
    setState({ key, status: "loading", fields: [] });
    void (async () => {
      try {
        const found = imageFieldsOf(pageFieldValues, "page", { itemId: pageId, itemPath: pagePath ?? "", shared: false });
        const refs = datasources.slice(0, 40);
        if (refs.length > 0) {
          const q = `query { ${refs
            .map((r, i) => `d${i}: item(where: { ${itemWhere(r, language)} }) { itemId path fields(ownFields: false, excludeStandardFields: true) { nodes { name value } } }`)
            .join("\n")} }`;
          const env = await graphql(client, contextId, q);
          // A datasource that can't be read is skipped (reads tolerate partial data; writes don't).
          for (let i = 0; i < refs.length; i++) {
            const item = env.data?.[`d${i}`] as ItemNode | null | undefined;
            if (!item?.itemId) continue;
            const values = Object.fromEntries((item.fields?.nodes ?? []).filter((n) => n?.name).map((n) => [n!.name!, n!.value ?? ""]));
            const path = item.path ?? refs[i];
            found.push(...imageFieldsOf(values, "item", { itemId: item.itemId, itemPath: path, shared: isSharedDatasource(path, pagePath) }));
          }
        }
        const mediaIds = [...new Set(found.map((f) => f.mediaId))].slice(0, 40);
        const paths: Record<string, string> = {};
        if (mediaIds.length > 0) {
          const q = `query { ${mediaIds.map((id, i) => `m${i}: mediaItem(where: { mediaItemId: ${lit(id)}, language: ${lit(language)} }) { mediaPath }`).join("\n")} }`;
          const env = await graphql(client, contextId, q);
          mediaIds.forEach((id, i) => {
            const m = env.data?.[`m${i}`] as { mediaPath?: string } | null | undefined;
            if (m?.mediaPath) paths[id] = m.mediaPath;
          });
        }
        if (!cancelled) setState({ key, status: "ready", fields: found.map((f) => ({ ...f, mediaPath: paths[f.mediaId] ?? null })) });
      } catch (err) {
        console.warn("[assist] image fields couldn't be read:", err);
        if (!cancelled) setState({ key, status: "error", fields: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
    // pageFieldValues and datasources are captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, enabled, client, contextId, pageId, key]);

  if (demo) return { status: "ready", fields: demo };
  return { status: state.status, fields: state.fields };
}

/** The author names in use on the page's sibling items (BrandX keeps authors as text on each article). */
export function useAuthorNames(opts: {
  client: ClientSDK | null;
  contextId: string | undefined;
  enabled: boolean;
  pagePath: string | null;
  language: string;
  demo: string[] | null;
}): { status: Status; names: string[] } {
  const { client, contextId, enabled, pagePath, language, demo } = opts;
  const [state, setState] = useState<{ key: string; status: Status; names: string[] }>({ key: "", status: "idle", names: [] });
  const parent = pagePath ? pagePath.slice(0, pagePath.lastIndexOf("/")) : "";
  const key = `${parent}|${language}`;

  useEffect(() => {
    if (demo || !enabled || !client || !parent || state.key === key) return;
    let cancelled = false;
    setState({ key, status: "loading", names: [] });
    void (async () => {
      try {
        const q = `query { parent: item(where: { path: ${lit(parent)}, language: ${lit(language)} }) { children(first: 100) { nodes { author: field(name: ${lit(FIELD_MAP.author)}) { value } } } } }`;
        const env = await graphql(client, contextId, q);
        const nodes = ((env.data?.parent as { children?: { nodes?: Array<{ author?: { value?: string } | null } | null> } } | null)?.children?.nodes ?? []);
        const names = [...new Set(nodes.map((n) => n?.author?.value?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
        if (!cancelled) setState({ key, status: "ready", names });
      } catch (err) {
        console.warn("[assist] author names couldn't be read:", err);
        if (!cancelled) setState({ key, status: "error", names: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, enabled, client, contextId, key]);

  if (demo) return { status: "ready", names: demo };
  return { status: state.status, names: state.names };
}
