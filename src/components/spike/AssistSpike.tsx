"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY — Phase 9 spikes (plan section 10, Phase 9; SPIKE-FINDINGS §9):
//   (a) the authoring mutation that writes a media item's Alt field, and
//       whether the media item is shared by other pages;
//   (b) where author items and the byline field live;
//   (c) how FAQ answers are stored, and whether a JSON-LD field exists.
// Shown only with `?spike=9` or localStorage `iiar-spike` = "9", in the panel
// and the dashboard. "Run spike" (panel) sends read-only queries through
// xmc.authoring.graphql. The free-form box refuses mutations unless "Run
// write…" is used, and the page-field box writes only through "Write with
// updateFields…"; both show the full write in a confirm first. Remove before
// Phase 9 is merged.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";

const STORAGE_KEY = "spike:assist:v1";

const subscribe = () => () => {};
function enabledSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("spike") === "9") return true;
  try {
    return window.localStorage.getItem("iiar-spike") === "9";
  } catch {
    return false;
  }
}

export function useAssistSpikeEnabled(): boolean {
  return useSyncExternalStore(subscribe, enabledSnapshot, () => false);
}

type Json = unknown;

interface GqlOutcome {
  label: string;
  ms: number;
  data?: Json;
  errors?: Json;
  threw?: string;
}

async function gql(
  client: ClientSDK,
  contextId: string | undefined,
  label: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GqlOutcome> {
  const t0 = performance.now();
  try {
    const result = await client.mutate("xmc.authoring.graphql", {
      params: {
        body: { query, variables },
        ...(contextId ? { query: { sitecoreContextId: contextId } } : {}),
      },
    } as Parameters<ClientSDK["mutate"]>[1]);
    const envelope =
      ((result as { data?: { data?: Json; errors?: Json } })?.data as { data?: Json; errors?: Json }) ??
      (result as { data?: Json; errors?: Json });
    return { label, ms: Math.round(performance.now() - t0), data: envelope?.data, errors: envelope?.errors };
  } catch (err) {
    return { label, ms: Math.round(performance.now() - t0), threw: String(err) };
  }
}

// ── Introspection ────────────────────────────────────────────────────────────

const TYPE_REF = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
const TYPE_QUERY = /* GraphQL */ `
  query T($name: String!) {
    __type(name: $name) {
      name
      kind
      fields { name args { name type { ${TYPE_REF} } } type { ${TYPE_REF} } }
      inputFields { name type { ${TYPE_REF} } }
      enumValues { name }
    }
  }
`;

interface TypeRef { kind?: string; name?: string | null; ofType?: TypeRef | null }
interface FieldDesc { name: string; args?: Array<{ name: string; type: TypeRef }>; type?: TypeRef }
interface TypeDesc { name: string; kind: string; fields?: FieldDesc[] | null; inputFields?: FieldDesc[] | null; enumValues?: Array<{ name: string }> | null }

function namedType(t: TypeRef | null | undefined): string | null {
  let cur = t;
  while (cur && !cur.name) cur = cur.ofType;
  return cur?.name ?? null;
}
function typeString(t: TypeRef | null | undefined): string {
  if (!t) return "?";
  if (t.kind === "NON_NULL") return `${typeString(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeString(t.ofType)}]`;
  return t.name ?? "?";
}
const BUILTIN = new Set(["String", "Int", "Float", "Boolean", "ID"]);

/** Walks from the given roots, following argument/input types (and the given output types), up to `cap` types. */
async function describeTypes(
  client: ClientSDK,
  contextId: string | undefined,
  roots: string[],
  followOutputs: Set<string>,
  cap = 40,
): Promise<{ types: Record<string, string[]>; errors: string[] }> {
  const queue = [...roots];
  const seen = new Set<string>();
  const types: Record<string, string[]> = {};
  const errors: string[] = [];
  while (queue.length && seen.size < cap) {
    const name = queue.shift()!;
    if (seen.has(name) || BUILTIN.has(name)) continue;
    seen.add(name);
    const r = await gql(client, contextId, `__type ${name}`, TYPE_QUERY, { name });
    const t = (r.data as { __type?: TypeDesc | null } | undefined)?.__type;
    if (!t) {
      errors.push(`${name}: ${r.threw ?? JSON.stringify(r.errors ?? "not found")}`);
      continue;
    }
    const lines: string[] = [];
    for (const f of t.fields ?? []) {
      const args = (f.args ?? []).map((a) => `${a.name}: ${typeString(a.type)}`).join(", ");
      lines.push(`${f.name}${args ? `(${args})` : ""}: ${typeString(f.type)}`);
      for (const a of f.args ?? []) {
        const n = namedType(a.type);
        if (n && !seen.has(n)) queue.push(n);
      }
      const out = namedType(f.type);
      if (out && followOutputs.has(name) && !seen.has(out)) queue.push(out);
    }
    for (const f of t.inputFields ?? []) {
      lines.push(`${f.name}: ${typeString(f.type)}`);
      const n = namedType(f.type);
      if (n && !seen.has(n)) queue.push(n);
    }
    for (const e of t.enumValues ?? []) lines.push(`= ${e.name}`);
    types[`${t.kind} ${t.name}`] = lines;
  }
  return { types, errors };
}

// ── Item reads ───────────────────────────────────────────────────────────────

// Only shapes the schema confirmed (SPIKE-FINDINGS §9.1–9.2); itemId is an ID.
const ITEM_BODY = `itemId name path template { name } fields(ownFields: false) { nodes { name value } }`;
const ITEM_BY_ID = `query I($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { ${ITEM_BODY} } }`;
const ITEM_BY_PATH = `query I($path: String!, $language: String!) { item(where: { path: $path, language: $language }) { ${ITEM_BODY} } }`;

// Kept separate so a field the schema doesn't have fails alone.
const ITEM_EXTRAS: Array<[string, string]> = [
  ["version + templateId", `query VT($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { version template { templateId } } }`],
  ["workflow", `query W($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { workflow { workflow { displayName } workflowState { displayName final } } } }`],
  ["versions", `query V($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { versions { version } } }`],
  ["std fields", `query S($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { workflowState: field(name: "__Workflow state") { value } updated: field(name: "__Updated") { value } updatedBy: field(name: "__Updated by") { value } } }`],
  ["template fields", `query TF($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { template { name fields { nodes { name type } } } } }`],
  ["parent + siblings", `query P($id: ID!, $language: String!) { item(where: { itemId: $id, language: $language }) { parent { path name template { name } children { nodes { itemId name path template { name } } } } } }`],
];

interface ItemNode {
  itemId?: string;
  name?: string;
  path?: string;
  template?: { name?: string };
  fields?: { nodes?: Array<{ name?: string; value?: string }> };
}

const GUID_RE = /\{?([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})\}?/gi;
const MEDIA_ID_RE = /mediaid="\{?([0-9a-f-]{32,36})\}?"/i;

function trimValue(v: string | undefined, max = 300): string | undefined {
  if (v === undefined) return v;
  return v.length > max ? `${v.slice(0, max)}… (${v.length} chars)` : v;
}

async function readItem(client: ClientSDK, ctx: string | undefined, ref: { id?: string; path?: string }, language: string, extras: boolean) {
  const base = ref.id
    ? await gql(client, ctx, `item ${ref.id}`, ITEM_BY_ID, { id: ref.id, language })
    : await gql(client, ctx, `item ${ref.path}`, ITEM_BY_PATH, { path: ref.path, language });
  const item = (base.data as { item?: ItemNode | null } | undefined)?.item ?? null;
  const out: Record<string, unknown> = {
    ms: base.ms,
    errors: base.errors ?? base.threw,
    item: item && {
      ...item,
      // Standard fields (__*) are left out; "std fields" reads the ones that matter.
      fields: (item.fields?.nodes ?? []).filter((f) => !f.name?.startsWith("__")).map((f) => ({ name: f.name, value: trimValue(f.value) })),
    },
  };
  if (item?.itemId && extras) {
    for (const [label, q] of ITEM_EXTRAS) {
      const r = await gql(client, ctx, label, q, { id: item.itemId, language });
      out[label] = r.errors || r.threw ? { errors: r.errors ?? r.threw } : (r.data as { item?: unknown })?.item;
    }
  }
  return { item, report: out };
}

// ── Searches (best guesses; errors are kept so the schema can be corrected) ──

const SEARCH_GUESSES: Array<[string, string]> = [
  [
    "search: field value contains the GUID",
    `query S($term: String!) { search(query: { searchStatement: { criteria: [{ field: "_content", value: $term, criteriaType: CONTAINS }] }, paging: { pageSize: 20 } }) { totalCount results { itemId name path templateName } } }`,
  ],
  [
    "search: free text",
    `query S($term: String!) { search(query: { searchStatement: { criteria: [{ value: $term }] }, paging: { pageSize: 20 } }) { totalCount results { itemId name path templateName } } }`,
  ],
];

// ── The spike ────────────────────────────────────────────────────────────────

interface SpikeReport {
  label: string;
  capturedAt: string;
  page: Record<string, unknown>;
  sections: Record<string, unknown>;
}

function loadReports(): SpikeReport[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveReports(r: SpikeReport[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    // storage blocked: reports stay in memory and the console
  }
}

interface AssistSpikeProps {
  client: ClientSDK | null;
  /** The panel passes its Context ID; the dashboard leaves it out and the box reads application.context. */
  sitecoreContextId?: string;
  /** The dashboard has no open page, so "Run spike" is hidden there. */
  mode?: "panel" | "dashboard";
}

const FIELD_READ = `query F($id: ID!, $language: String!, $field: String!) { item(where: { itemId: $id, language: $language }) { path version workflow { canEdit canSave } field(name: $field) { value } } }`;

export function AssistSpike({ client, sitecoreContextId: ctxProp, mode = "panel" }: AssistSpikeProps) {
  const [ctxRead, setCtxRead] = useState<string | undefined>(undefined);
  const sitecoreContextId = ctxProp ?? ctxRead;
  useEffect(() => {
    if (!client || ctxProp) return;
    void (async () => {
      try {
        const res = (await client.query("application.context")) as {
          data?: { resourceAccess?: Array<{ context?: { preview?: string; live?: string } }>; resources?: Array<{ context?: { preview?: string; live?: string } }> };
        };
        const list = res?.data?.resourceAccess ?? res?.data?.resources ?? [];
        setCtxRead(list.map((r) => r?.context?.preview ?? r?.context?.live).find(Boolean));
      } catch (err) {
        console.warn("[spike:assist] application.context failed:", err);
      }
    })();
  }, [client, ctxProp]);

  const [pfPageId, setPfPageId] = useState("");
  const [pfLanguage, setPfLanguage] = useState("en");
  const [pfField, setPfField] = useState("");
  const [pfValue, setPfValue] = useState("");
  const [pfOut, setPfOut] = useState("");

  const [reports, setReports] = useState<SpikeReport[]>(loadReports);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [freeQuery, setFreeQuery] = useState("");
  const [freeVars, setFreeVars] = useState("{}");
  const [freeOut, setFreeOut] = useState("");
  const [introspect, setIntrospect] = useState(true);

  const add = (r: SpikeReport) => {
    console.groupCollapsed(`[spike:assist] ${r.label}`);
    console.log(r);
    console.groupEnd();
    setReports((prev) => {
      const next = [...prev, r];
      saveReports(next);
      return next;
    });
  };

  async function run() {
    if (!client) return;
    setBusy(true);
    const sections: Record<string, unknown> = {};
    try {
      setStatus("Reading the page context…");
      const pc = (await client.query("pages.context")) as { data?: { pageInfo?: Record<string, unknown>; siteInfo?: Record<string, unknown> } };
      const pageInfo = pc?.data?.pageInfo ?? {};
      const siteInfo = pc?.data?.siteInfo ?? {};
      const pageId = (pageInfo.id ?? pageInfo.itemId) as string | undefined;
      const language = (pageInfo.language as string) || "en";
      const site = ((siteInfo.name as string) || (siteInfo.id as string)) ?? "";
      const page = { pageId, path: pageInfo.path, route: pageInfo.route, language, site, siteId: siteInfo.id, brandKitId: siteInfo.brandKitId };

      if (introspect) {
        setStatus("Introspecting the schema…");
        const roots = await gql(client, sitecoreContextId, "roots", `{ __schema { queryType { name } mutationType { name } } }`);
        const schema = (roots.data as { __schema?: { queryType?: { name?: string }; mutationType?: { name?: string } } } | undefined)?.__schema;
        const q = schema?.queryType?.name ?? "Query";
        const m = schema?.mutationType?.name ?? "Mutation";
        sections.schemaRoots = schema ?? { errors: roots.errors ?? roots.threw };
        // Mutation and Query fields with their argument/input types; Item's output types one level deep.
        sections.types = await describeTypes(client, sitecoreContextId, [m, q, "Item"], new Set(["Item"]), 45);
      }

      setStatus("Reading the page item…");
      const pageRead = await readItem(client, sitecoreContextId, { id: pageId }, language, true);
      sections.pageItem = pageRead.report;

      // (b) author / byline fields on the page: resolve every GUID they hold.
      const authorFields = (pageRead.item?.fields?.nodes ?? []).filter((f) => /author|byline|writer|contributor|person|people/i.test(f.name ?? ""));
      const authors: Record<string, unknown> = {};
      for (const f of authorFields) {
        const ids = [...(f.value ?? "").matchAll(GUID_RE)].map((mm) => mm[1]).slice(0, 3);
        authors[f.name ?? "?"] = { raw: f.value, resolved: await Promise.all(ids.map(async (id) => (await readItem(client, sitecoreContextId, { id }, language, true)).report)) };
      }
      sections.authorFields = authorFields.length ? authors : "no field whose name looks like author/byline on this page item";

      setStatus("Reading the layout and datasources…");
      const layoutRes = (await client.query("xmc.pages.retrievePage", {
        params: { path: { pageId }, query: { site, language, ...(sitecoreContextId ? { sitecoreContextId } : {}) } },
      } as Parameters<ClientSDK["query"]>[1])) as { data?: { data?: { finalLayout?: string | null } } };
      const finalLayout = layoutRes?.data?.data?.finalLayout ?? null;
      let renderings: Array<{ id?: string; dataSource?: string; placeholder?: string; parameters?: unknown }> = [];
      try {
        const parsed = finalLayout ? (JSON.parse(finalLayout) as { devices?: Array<{ renderings?: typeof renderings }> }) : null;
        renderings = (parsed?.devices ?? []).flatMap((d) => d.renderings ?? []);
      } catch {
        sections.layoutError = "finalLayout didn't parse";
      }
      sections.renderings = renderings.map((r) => ({ id: r.id, dataSource: r.dataSource, placeholder: r.placeholder }));

      const datasources = [...new Set(renderings.map((r) => r.dataSource).filter((d): d is string => Boolean(d)))].slice(0, 30);
      const dsReports: Record<string, unknown> = {};
      const mediaIds = new Map<string, string>(); // media id → "item / field"
      const imageFieldValues: Array<{ item: string; field: string; value: string }> = [];
      for (const ds of datasources) {
        const ref = ds.startsWith("local:") ? { path: `${page.path as string}${ds.slice("local:".length)}` } : /^\{?[0-9a-f-]{32,36}\}?$/i.test(ds) ? { id: ds.replace(/[{}]/g, "") } : { path: ds };
        const { item, report } = await readItem(client, sitecoreContextId, ref, language, false);
        dsReports[ds] = report;
        for (const f of item?.fields?.nodes ?? []) {
          const m = MEDIA_ID_RE.exec(f.value ?? "");
          if (m) {
            mediaIds.set(m[1], `${item?.path} / ${f.name}`);
            imageFieldValues.push({ item: item?.path ?? ds, field: f.name ?? "", value: f.value ?? "" });
          }
        }
      }
      for (const f of pageRead.item?.fields?.nodes ?? []) {
        const m = MEDIA_ID_RE.exec(f.value ?? "");
        if (m) {
          mediaIds.set(m[1], `${pageRead.item?.path} / ${f.name}`);
          imageFieldValues.push({ item: pageRead.item?.path ?? "page", field: f.name ?? "", value: f.value ?? "" });
        }
      }
      sections.datasources = dsReports;
      // (a) whether the image field value itself carries alt (a per-use override).
      sections.imageFieldValues = imageFieldValues;

      setStatus("Reading media items…");
      const media: Record<string, unknown> = {};
      const firstMedia = [...mediaIds.keys()].slice(0, 6);
      for (const id of firstMedia) {
        const { report } = await readItem(client, sitecoreContextId, { id }, language, true);
        const searches: Record<string, unknown> = {};
        for (const [lbl, q] of SEARCH_GUESSES) {
          const r = await gql(client, sitecoreContextId, lbl, q, { term: id.replace(/-/g, "").toLowerCase() });
          searches[lbl] = r.errors || r.threw ? { errors: r.errors ?? r.threw } : r.data;
        }
        media[id] = { usedBy: mediaIds.get(id), ...report, searches };
      }
      sections.media = firstMedia.length ? media : "no image field values with a mediaid on this page or its datasources";

      // (c) any field name that looks like JSON-LD / structured data on the templates seen.
      const allFieldNames = new Set<string>();
      for (const f of pageRead.item?.fields?.nodes ?? []) if (f.name) allFieldNames.add(`page: ${f.name}`);
      for (const [ds, r] of Object.entries(dsReports)) {
        const it = (r as { item?: { template?: { name?: string }; fields?: Array<{ name?: string }> } }).item;
        for (const f of it?.fields ?? []) if (f.name) allFieldNames.add(`${it?.template?.name ?? ds}: ${f.name}`);
      }
      sections.jsonLdLikeFields = [...allFieldNames].filter((n) => /json|schema|structured|ld\b/i.test(n));

      add({ label: label || `${page.path as string}`, capturedAt: new Date().toISOString(), page, sections });
      setStatus("Done.");
    } catch (err) {
      setStatus(`Failed: ${String(err)}`);
      add({ label: `${label || "run"} (failed)`, capturedAt: new Date().toISOString(), page: {}, sections: { ...sections, error: String(err) } });
    } finally {
      setBusy(false);
    }
  }

  async function runFree(write: boolean) {
    if (!client) return;
    const isMutation = /^\s*mutation\b/i.test(freeQuery) || /\bmutation\s*[({]/i.test(freeQuery);
    if (isMutation && !write) {
      setFreeOut("This is a mutation. Use “Run write…” to send it.");
      return;
    }
    let vars: Record<string, unknown> = {};
    try {
      vars = JSON.parse(freeVars || "{}");
    } catch {
      setFreeOut("Variables aren't valid JSON.");
      return;
    }
    if (write && !window.confirm(`Send this write to Sitecore?\n\n${freeQuery}\n\nVariables: ${JSON.stringify(vars)}`)) return;
    setBusy(true);
    const r = await gql(client, sitecoreContextId, write ? "free write" : "free query", freeQuery, vars);
    if (write) console.info("[audit] spike write", { query: freeQuery, variables: vars, result: r });
    setFreeOut(JSON.stringify(r, null, 2));
    add({ label: `${write ? "WRITE" : "query"}: ${freeQuery.slice(0, 60)}`, capturedAt: new Date().toISOString(), page: {}, sections: { query: freeQuery, variables: vars, result: r } });
    setBusy(false);
  }

  // Page field read/write through xmc.pages.updateFields, the call MetaGenerator
  // (and the dashboard's bulk write) uses. Read is authoring GraphQL by item ID.
  async function readPageField() {
    if (!client) return;
    setBusy(true);
    const r = await gql(client, sitecoreContextId, "page field read", FIELD_READ, { id: pfPageId.trim(), language: pfLanguage, field: pfField });
    setPfOut(JSON.stringify(r, null, 2));
    add({ label: `read ${pfField} on ${pfPageId}`, capturedAt: new Date().toISOString(), page: { mode }, sections: { result: r } });
    setBusy(false);
  }

  async function writePageField() {
    if (!client) return;
    const before = await gql(client, sitecoreContextId, "before", FIELD_READ, { id: pfPageId.trim(), language: pfLanguage, field: pfField });
    const beforeValue = (before.data as { item?: { field?: { value?: string } | null } } | undefined)?.item?.field?.value;
    if (!window.confirm(`Write with xmc.pages.updateFields?\n\nPage: ${pfPageId}\nLanguage: ${pfLanguage}\nField: ${pfField}\n\nBefore: ${beforeValue ?? "(couldn't read)"}\nAfter: ${pfValue}`)) return;
    setBusy(true);
    const t0 = performance.now();
    let result: unknown;
    let threw: string | undefined;
    try {
      result = await client.mutate("xmc.pages.updateFields", {
        params: {
          path: { pageId: pfPageId.trim() },
          body: { language: pfLanguage, fields: [{ name: pfField, value: pfValue }] },
          ...(sitecoreContextId ? { query: { sitecoreContextId } } : {}),
        },
      } as Parameters<ClientSDK["mutate"]>[1]);
    } catch (err) {
      threw = String(err);
    }
    const after = await gql(client, sitecoreContextId, "after", FIELD_READ, { id: pfPageId.trim(), language: pfLanguage, field: pfField });
    const out = { mode, ms: Math.round(performance.now() - t0), before: before.data ?? before.errors, result, threw, after: after.data ?? after.errors };
    console.info("[audit] spike updateFields", { pageId: pfPageId, language: pfLanguage, field: pfField, before: beforeValue, after: pfValue, threw });
    setPfOut(JSON.stringify(out, null, 2));
    add({ label: `WRITE updateFields ${pfField} on ${pfPageId} (${mode})`, capturedAt: new Date().toISOString(), page: { mode }, sections: out });
    setBusy(false);
  }

  const json = JSON.stringify(reports, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setStatus(`Copied ${reports.length} reports.`);
    } catch {
      setStatus("Clipboard blocked: select the text below and copy it.");
    }
  };

  return (
    <section className="m-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm" aria-label="Phase 9 spike">
      <h2 className="font-bold">Phase 9 spike (temporary)</h2>
      <p className="mb-2 text-xs">
        {mode === "panel" ? "“Run spike” sends only queries. " : ""}Writes go only through the red buttons, after a confirm. Context ID: {sitecoreContextId ? "yes" : "no"}
      </p>
      {mode === "panel" && <div className="flex flex-wrap items-center gap-2">
        <input className="min-w-0 flex-1 rounded border px-2 py-1" placeholder="Label (e.g. article)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={introspect} onChange={(e) => setIntrospect(e.target.checked)} /> Schema
        </label>
        <button type="button" className="rounded bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-50" disabled={!client || busy} onClick={run}>
          Run spike
        </button>
      </div>}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold">Page field (xmc.pages.updateFields)</summary>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <input className="col-span-2 rounded border px-2 py-1 font-mono text-xs" placeholder="Page item ID" value={pfPageId} onChange={(e) => setPfPageId(e.target.value)} />
          <input className="rounded border px-2 py-1 text-xs" placeholder="Field name" value={pfField} onChange={(e) => setPfField(e.target.value)} />
          <input className="rounded border px-2 py-1 text-xs" placeholder="Language" value={pfLanguage} onChange={(e) => setPfLanguage(e.target.value)} />
          <textarea className="col-span-2 h-14 rounded border p-1 text-xs" placeholder="New value" value={pfValue} onChange={(e) => setPfValue(e.target.value)} />
        </div>
        <div className="mt-1 flex gap-2">
          <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!client || busy || !pfPageId || !pfField} onClick={readPageField}>Read field</button>
          <button type="button" className="rounded border border-red-400 bg-white px-3 py-1 text-red-700 disabled:opacity-50" disabled={!client || busy || !pfPageId || !pfField} onClick={writePageField}>Write with updateFields…</button>
        </div>
        {pfOut && <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-1 text-xs">{pfOut}</pre>}
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold">Free-form query</summary>
        <textarea className="mt-1 h-28 w-full rounded border p-1 font-mono text-xs" placeholder="query { … }" value={freeQuery} onChange={(e) => setFreeQuery(e.target.value)} />
        <textarea className="mt-1 h-12 w-full rounded border p-1 font-mono text-xs" placeholder='{"id": "…"}' value={freeVars} onChange={(e) => setFreeVars(e.target.value)} />
        <div className="flex gap-2">
          <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!client || busy} onClick={() => runFree(false)}>Run query</button>
          <button type="button" className="rounded border border-red-400 bg-white px-3 py-1 text-red-700 disabled:opacity-50" disabled={!client || busy} onClick={() => runFree(true)}>Run write…</button>
        </div>
        {freeOut && <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-1 text-xs">{freeOut}</pre>}
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!reports.length} onClick={copy}>Copy {reports.length} reports</button>
        <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!reports.length} onClick={() => { setReports([]); saveReports([]); }}>Clear</button>
        <span role="status" className="text-xs">{status}</span>
      </div>
      {reports.length > 0 && <textarea readOnly className="mt-2 h-32 w-full rounded border p-1 font-mono text-xs" value={json} />}
    </section>
  );
}
