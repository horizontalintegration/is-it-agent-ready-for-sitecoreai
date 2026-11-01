// ─────────────────────────────────────────────────────────────────────────────
// Shared JSON-LD parsing for the structured-data checks (P10, S7) and the HTML
// extractor. Pure: no I/O, so it runs on the server and in the browser.
//
// A page can describe the same thing in many shapes. All of these yield an
// Organization node:
//   {"@type": "Organization", …}
//   [{"@type": "Organization", …}, …]
//   {"@graph": [{"@type": "Organization", …}]}
//   {"@type": ["Organization", "LocalBusiness"], …}
//   {"@type": "BankOrCreditUnion", …}                     (a subtype)
//   {"@type": "WebSite", "publisher": {"@id": "#org"}} + {"@id": "#org", …}
// ─────────────────────────────────────────────────────────────────────────────

import { ARTICLE_TYPES, ORGANIZATION_TYPES } from "./schema-org-types";

/** One `<script type="application/ld+json">` block: parsed, or the parse error. */
export type JsonLdScript =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** A typed JSON-LD object found at the top level of a block or in its `@graph`. */
export interface JsonLdNode {
  /** `@type` as a list, with any schema.org prefix removed. Empty when untyped. */
  types: string[];
  id: string | null;
  data: Record<string, unknown>;
}

export function parseJsonLdScript(text: string): JsonLdScript {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** "https://schema.org/Organization" and "schema:Organization" → "Organization". */
function normaliseType(t: string): string {
  return t.trim().replace(/^(https?:\/\/schema\.org\/|schema:)/i, "");
}

export function typesOf(v: unknown): string[] {
  if (!isObject(v)) return [];
  const raw = v["@type"];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list.filter((t): t is string => typeof t === "string").map(normaliseType).filter(Boolean);
}

function toNode(v: Record<string, unknown>): JsonLdNode {
  return {
    types: typesOf(v),
    id: typeof v["@id"] === "string" ? v["@id"] : null,
    data: v,
  };
}

/**
 * The top-level nodes of every block that parsed: each array entry and each
 * `@graph` member becomes its own node. Nested objects (a publisher, an author)
 * are not separate nodes; read them from their parent with `resolve`.
 */
export function collectNodes(scripts: JsonLdScript[]): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (!isObject(v)) return;
    if (Array.isArray(v["@graph"]) || isObject(v["@graph"])) visit(v["@graph"]);
    if ("@type" in v || "@id" in v) out.push(toNode(v));
  };
  for (const s of scripts) if (s.ok) visit(s.value);
  return out;
}

/** The parse errors, in block order. */
export function parseErrors(scripts: JsonLdScript[]): string[] {
  return scripts.flatMap((s) => (s.ok ? [] : [s.error]));
}

/**
 * A property value as a node: inline objects are used as they are, and
 * `{"@id": …}` references are looked up among the page's nodes.
 */
export function resolve(value: unknown, nodes: JsonLdNode[]): JsonLdNode | null {
  if (!isObject(value)) return null;
  const id = typeof value["@id"] === "string" ? value["@id"] : null;
  const keys = Object.keys(value);
  if (id && keys.length === 1) return nodes.find((n) => n.id === id) ?? null;
  return toNode(value);
}

export function hasType(node: JsonLdNode, wanted: ReadonlySet<string> | string): boolean {
  return node.types.some((t) => (typeof wanted === "string" ? t === wanted : wanted.has(t)));
}

export const isOrganization = (node: JsonLdNode) => hasType(node, ORGANIZATION_TYPES);
export const isArticle = (node: JsonLdNode) => hasType(node, ARTICLE_TYPES);

/** Every distinct `@type` on the page, in first-seen order. */
export function typesOnPage(scripts: JsonLdScript[]): string[] {
  return Array.from(new Set(collectNodes(scripts).flatMap((n) => n.types)));
}

/** A non-empty string property, trimmed; null otherwise. */
export function stringProp(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A property as a list (a single value becomes a one-item list). */
export function listProp(data: Record<string, unknown>, key: string): unknown[] {
  const v = data[key];
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
