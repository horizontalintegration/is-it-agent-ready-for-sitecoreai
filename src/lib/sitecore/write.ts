import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { normalizeItemId } from "@/lib/pages-editor-url";
import { HOST_AUTH_WRITE_MESSAGE, isHostAuthError } from "@/lib/xmc-errors";

// ─────────────────────────────────────────────────────────────────────────────
// Every write the app makes to Sitecore (Phase 9). The UI shows the request in
// a confirm dialog (before → after) first; nothing here asks. Rules
// (SPIKE-FINDINGS §9.4):
//
// - Page fields go through xmc.pages.updateFields; datasource items (FAQ
//   answers, a component's image field) through authoring GraphQL updateItem.
//   Both write the item's current version in the given language, in place, and
//   never publish.
// - Any GraphQL `errors` entry is a failed write, even with data alongside.
// - The value is read back afterwards; a write that didn't stick has failed.
// - One `[audit]` console line per write, success or not. The UI adds a toast.
// ─────────────────────────────────────────────────────────────────────────────

export type WriteTarget =
  /** A field on the page item. */
  | { via: "updateFields"; pageId: string; language: string; field: string }
  /** A field on any item (a component datasource). */
  | { via: "updateItem"; itemId: string; language: string; field: string };

export interface WriteRequest {
  target: WriteTarget;
  /** What changes, for the dialog, toast and audit line: "Meta description", "Alt text". */
  label: string;
  /** Which item, in words: the page name or the datasource path. */
  itemLabel: string;
  /** The field's raw value now, and the raw value written. */
  before: string;
  after: string;
  /** What the dialog shows when the raw value is markup (an image field's alt, a rich-text answer's text). */
  display?: { before: string; after: string };
  /** A component datasource that other pages may use too (outside the page's own Data folder). */
  shared?: boolean;
}

export type WriteResult =
  | { ok: true; value: string; version: number | null; ms: number }
  | { ok: false; reason: string; ms: number };

type Envelope = { data?: Record<string, unknown> | null; errors?: Array<{ message?: string }> };

/** The GraphQL body from an xmc.authoring.graphql result (the SDK wraps it once more). */
function envelopeOf(result: unknown): Envelope {
  const outer = result as { data?: Envelope } | null | undefined;
  return (outer?.data && ("data" in outer.data || "errors" in outer.data) ? outer.data : (result as Envelope)) ?? {};
}

const errorText = (errors: Envelope["errors"]) => (errors ?? []).map((e) => e?.message ?? "unknown error").join("; ");

async function graphql(client: ClientSDK, contextId: string | undefined, query: string, variables: Record<string, unknown>): Promise<Envelope> {
  const result = await client.mutate("xmc.authoring.graphql", {
    params: {
      body: { query, variables },
      ...(contextId ? { query: { sitecoreContextId: contextId } } : {}),
    },
  } as Parameters<ClientSDK["mutate"]>[1]);
  return envelopeOf(result);
}

const READ_FIELD = /* GraphQL */ `
  query ReadField($id: ID!, $language: String!, $field: String!) {
    item(where: { itemId: $id, language: $language }) { version field(name: $field) { value } }
  }
`;

const UPDATE_ITEM = /* GraphQL */ `
  mutation WriteField($id: ID!, $language: String!, $field: String!, $value: String) {
    updateItem(input: { itemId: $id, language: $language, fields: [{ name: $field, value: $value }] }) {
      item { version field(name: $field) { value } }
    }
  }
`;

interface ItemFieldRead { version?: number; field?: { value?: string } | null }

/** The field's current value and version, for "Before" and the read-back. Throws on errors. */
export async function readField(
  client: ClientSDK,
  contextId: string | undefined,
  itemId: string,
  language: string,
  field: string,
): Promise<{ value: string; version: number | null }> {
  const env = await graphql(client, contextId, READ_FIELD, { id: normalizeItemId(itemId), language, field });
  if (env.errors?.length) throw new Error(errorText(env.errors));
  const item = (env.data?.item ?? null) as ItemFieldRead | null;
  if (!item) throw new Error("item not found");
  return { value: item.field?.value ?? "", version: item.version ?? null };
}

function failure(err: unknown, t0: number): WriteResult {
  const reason = isHostAuthError(err) ? HOST_AUTH_WRITE_MESSAGE : err instanceof Error ? err.message : String(err);
  return { ok: false, reason, ms: Math.round(performance.now() - t0) };
}

/** Sends one confirmed write and reads the value back. Never throws. */
export async function writeField(client: ClientSDK, contextId: string | undefined, req: WriteRequest): Promise<WriteResult> {
  const t0 = performance.now();
  const { target } = req;
  let result: WriteResult;
  try {
    if (target.via === "updateFields") {
      const res = (await client.mutate("xmc.pages.updateFields", {
        params: {
          path: { pageId: normalizeItemId(target.pageId) },
          body: { language: target.language, fields: [{ name: target.field, value: req.after }] },
          ...(contextId ? { query: { sitecoreContextId: contextId } } : {}),
        },
      } as Parameters<ClientSDK["mutate"]>[1])) as { error?: unknown } | null;
      if (res?.error) throw res.error;
      // updateFields answers with the page, not the value: read it back.
      const back = await readField(client, contextId, target.pageId, target.language, target.field);
      if (back.value !== req.after) throw new Error("Sitecore didn't keep the new value.");
      result = { ok: true, value: back.value, version: back.version, ms: Math.round(performance.now() - t0) };
    } else {
      const env = await graphql(client, contextId, UPDATE_ITEM, {
        id: normalizeItemId(target.itemId),
        language: target.language,
        field: target.field,
        value: req.after,
      });
      if (env.errors?.length) throw new Error(errorText(env.errors));
      const item = ((env.data?.updateItem as { item?: ItemFieldRead } | null)?.item ?? null) as ItemFieldRead | null;
      if (!item) throw new Error("Sitecore returned no item.");
      if ((item.field?.value ?? "") !== req.after) throw new Error("Sitecore didn't keep the new value.");
      result = { ok: true, value: item.field?.value ?? "", version: item.version ?? null, ms: Math.round(performance.now() - t0) };
    }
  } catch (err) {
    result = failure(err, t0);
  }
  console.info(auditLine(req, result), { target, before: req.before, after: req.after, result });
  return result;
}

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The one-line audit record of a write. */
export function auditLine(req: WriteRequest, result: WriteResult): string {
  const { target } = req;
  const id = target.via === "updateFields" ? target.pageId : target.itemId;
  const head = `[audit] ${result.ok ? "wrote" : "write failed"}: ${req.label} on ${req.itemLabel} (${normalizeItemId(id)}, field "${target.field}", ${target.language}, ${target.via})`;
  const change = `"${clip(req.before)}" → "${clip(req.after)}"`;
  return result.ok
    ? `${head}: ${change}, version ${result.version ?? "?"}, ${result.ms} ms, not published`
    : `${head}: ${change} — ${result.reason}`;
}

// ── Why Apply is off ─────────────────────────────────────────────────────────

export interface WriteAvailability {
  /** The Marketplace client; null in demo mode and the standalone dashboard. */
  hasClient: boolean;
  demo: boolean;
  /** The configured field name, or null when none is configured (e.g. JSON-LD on BrandX). */
  configuredField: string | null;
  /** The name as the item spells it, or null when its template doesn't have the field. */
  fieldOnItem: string | null;
  /** From item.workflow.canEdit; undefined when not known. */
  canEdit?: boolean;
  /** Words for the item in the reason: "page", "component". */
  itemKind?: string;
}

/**
 * Null when a write can go ahead; otherwise the reason shown next to the
 * disabled Apply. Demo mode has no client but keeps Apply on, so the confirm
 * dialog can be shown; WriteConfirmProvider then writes nothing.
 */
export function writeDisabledReason(a: WriteAvailability): string | null {
  if (!a.hasClient && !a.demo) return "Open this in SitecoreAI to write to the field.";
  if (!a.configuredField) return "No field is set up for this on the site's templates, so copy it instead.";
  if (!a.fieldOnItem) return `This ${a.itemKind ?? "page"}'s template has no "${a.configuredField}" field.`;
  if (a.canEdit === false) return "You can't edit this item (no rights, or it's locked).";
  return null;
}

// ── Field values ────────────────────────────────────────────────────────────

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * An image field's raw value with `alt` set (an `alt` on the field wins over
 * the media item's Alt in the rendered page, SPIKE-FINDINGS §9.4). Null when
 * the value isn't an image field.
 */
export function setImageAlt(fieldValue: string, alt: string): string | null {
  const m = /^\s*<image\b([^>]*?)\s*(\/?)>/i.exec(fieldValue);
  if (!m) return null;
  const attrs = m[1].replace(/\s+alt\s*=\s*"[^"]*"/i, "");
  const tag = `<image${attrs} alt="${escapeXml(alt)}" ${m[2] ? "/" : ""}>`.replace(" >", ">");
  return fieldValue.replace(m[0], tag);
}

/** The alt on an image field's value, or null. */
export function imageFieldAlt(fieldValue: string): string | null {
  const m = /<image\b[^>]*\balt\s*=\s*"([^"]*)"/i.exec(fieldValue);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : null;
}

/** The media item ID an image field points to (lower case, no braces), or null. */
export function imageFieldMediaId(fieldValue: string): string | null {
  const m = /<image\b[^>]*\bmediaid\s*=\s*"\{?([0-9a-f-]{32,36})\}?"/i.exec(fieldValue);
  return m ? normalizeItemId(m[1]) : null;
}

/**
 * A rich-text answer with its text replaced, keeping the editor's wrapper
 * (BrandX: `<div class="ck-content"><p>…</p></div>`). A value with more than
 * one paragraph becomes a single paragraph inside the same wrapper.
 */
export function richTextWithText(before: string, text: string): string {
  const p = `<p>${escapeXml(text).replace(/&quot;/g, '"')}</p>`;
  const wrapper = /^\s*(<div\b[^>]*>)[\s\S]*<\/div>\s*$/i.exec(before);
  return wrapper ? `${wrapper[1]}${p}</div>` : p;
}
