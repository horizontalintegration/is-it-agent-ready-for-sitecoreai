// ─────────────────────────────────────────────────────────────────────────────
// The Sitecore field names the app reads and writes, in one place. Field names
// vary between SXA and custom templates, so each can be set per tenant with a
// NEXT_PUBLIC_FIELD_* variable (referenced literally so Next.js inlines them in
// the browser). Defaults are BrandX's (SPIKE-FINDINGS §9).
//
// A write only goes to a field that exists on the item's template; when it
// doesn't (or isn't configured), Apply is off with a reason.
// ─────────────────────────────────────────────────────────────────────────────

const env = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export const FIELD_MAP = {
  // Page fields (xmc.pages.updateFields)
  metaTitle: env(process.env.NEXT_PUBLIC_FIELD_TITLE) ?? "pageTitle",
  metaDescription: env(process.env.NEXT_PUBLIC_FIELD_META_DESCRIPTION) ?? "MetaDescription",
  ogTitle: env(process.env.NEXT_PUBLIC_FIELD_OG_TITLE) ?? "OpenGraphTitle",
  ogDescription: env(process.env.NEXT_PUBLIC_FIELD_OG_DESCRIPTION) ?? "OpenGraphDescription",
  /** Single-line text with the author's name (BrandX's Article Detail Page). */
  author: env(process.env.NEXT_PUBLIC_FIELD_AUTHOR) ?? "authorName",
  /** A field that holds the page's JSON-LD. None by default: BrandX has none, so JSON-LD is copy-only. */
  jsonLd: env(process.env.NEXT_PUBLIC_FIELD_JSON_LD),
  // FAQ datasource fields (authoring updateItem)
  faqQuestion: env(process.env.NEXT_PUBLIC_FIELD_FAQ_QUESTION) ?? "heading",
  faqAnswer: env(process.env.NEXT_PUBLIC_FIELD_FAQ_ANSWER) ?? "content",
  // Read only
  robotsMetaTag: "robotsMetaTag",
  updated: "__Updated",
} as const;

export type FieldKey = keyof typeof FIELD_MAP;

/**
 * The field's name as the item spells it, or null when the item's template
 * doesn't have it. `names` maps lower-cased field name → original name, as
 * read from authoring GraphQL (lookups are case-insensitive; writes match by
 * name).
 */
export function resolveFieldName(names: Record<string, string>, configured: string | null): string | null {
  if (!configured) return null;
  return names[configured.toLowerCase()] ?? null;
}
