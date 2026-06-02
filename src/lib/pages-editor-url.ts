// ─────────────────────────────────────────────────────────────────────────────
// XM Cloud Pages editor deep-link builder.
//
// Lets the dashboard widget hand a user off into the Pages editor for a specific
// item, e.g.
//   https://pages.sitecorecloud.io/editor
//     ?tenantName=<tenant>&organization=<org>&sc_itemid=<guid>
//     &sc_lang=en&sc_site=<site>&sc_version=<n>
//
// Every param is sourced from the Marketplace SDK:
//   tenantName   ← application.context → resourceAccess[].tenantName
//   organization ← application.context → organizationId
//   sc_itemid    ← the page's Sitecore itemId (normalised here)
//   sc_lang      ← site language ("en")
//   sc_site      ← site.context → siteInfo.name
//   sc_version   ← optional; omitted → Pages opens the latest version
// ─────────────────────────────────────────────────────────────────────────────

const PAGES_EDITOR_BASE = "https://pages.sitecorecloud.io/editor";

/** GraphQL itemIds may arrive as "{GUID}" or upper-case; Pages wants lower-case, no braces. */
export function normalizeItemId(id: string): string {
  return id.replace(/[{}]/g, "").trim().toLowerCase();
}

export interface PagesEditorParams {
  tenantName: string;
  organization: string;
  itemId: string;
  site: string;
  lang?: string;
  version?: number | string | null;
}

/**
 * Build the Pages editor deep-link. Returns null when a required param is
 * missing (the caller should fall back to opening the public page URL).
 */
export function buildPagesEditorUrl(p: PagesEditorParams): string | null {
  if (!p.tenantName || !p.organization || !p.itemId || !p.site) return null;

  const url = new URL(PAGES_EDITOR_BASE);
  url.searchParams.set("tenantName", p.tenantName);
  url.searchParams.set("organization", p.organization);
  url.searchParams.set("sc_itemid", normalizeItemId(p.itemId));
  url.searchParams.set("sc_lang", p.lang || "en");
  url.searchParams.set("sc_site", p.site);
  if (p.version !== undefined && p.version !== null && p.version !== "") {
    url.searchParams.set("sc_version", String(p.version));
  }
  return url.toString();
}
