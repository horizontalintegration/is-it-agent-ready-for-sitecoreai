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
//   tenantName   ← application.context → resourceAccess[].tenantName, or
//                  host.state → xmCloudTenantInfo.name when that's empty
//                  (the dashboard's host since 2026-11)
//   organization ← application.context → organizationId
//   sc_itemid    ← the page's Sitecore itemId (normalised here)
//   sc_lang      ← site language ("en")
//   sc_site      ← site.context → siteInfo.name
//   sc_version   ← optional; omitted → Pages opens the latest version
// ─────────────────────────────────────────────────────────────────────────────

const PAGES_EDITOR_BASE = "https://pages.sitecorecloud.io/editor";

/**
 * GraphQL itemIds may arrive as "{GUID}", upper-case or without dashes
 * ("c3de83d8…"); Pages uses lower-case, dashed, no braces
 * ("374014ce-7840-4fe8-835e-5a600c20e7b2").
 */
export function normalizeItemId(id: string): string {
  const bare = id.replace(/[{}]/g, "").trim().toLowerCase();
  const hex = bare.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return bare;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
