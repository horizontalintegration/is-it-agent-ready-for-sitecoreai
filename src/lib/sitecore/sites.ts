// ─────────────────────────────────────────────────────────────────────────────
// The full-screen app's site picker (plan Phase 14; SPIKE-FINDINGS §11).
//
// SitecoreAI's Apps menu sits outside any site, so the full-screen app gets
// no site.context. It lists the organisation's sites with xmc.sites.listSites,
// which returns each site's public host name and home item, the same data
// retrieveSite gives. The pick is remembered per organisation in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

/** A site the picker can offer, from xmc.sites.listSites. */
export interface SiteOption {
  /** The site ID, the same ID site.context gives the dashboard widget. */
  id: string;
  /** The site's name (displayName is empty on most sites). */
  name: string;
  /** The public origin ("https://host"), or "" when the site has no host name. */
  domain: string;
  /** The home item, for the page-list query; null when the host has none. */
  homePageId: string | null;
}

const PICKED_SITE_PREFIX = "aiDiscovery:fullscreenSite:v1:";

/** "host", "https://host/" or "" → "https://host" or "". */
export function siteOrigin(hostname: string | null | undefined): string {
  const raw = hostname?.trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return "";
  }
}

interface ListedHost {
  targetHostname?: string | null;
  homePageId?: string | null;
}

interface ListedSite {
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  hosts?: ListedHost[] | null;
}

/**
 * The picker's sites from a listSites response body (an array of Site). The
 * first host with a host name wins, as in the dashboard's retrieveSite.
 */
export function siteOptionsFromListing(body: unknown): SiteOption[] {
  if (!Array.isArray(body)) return [];
  return (body as ListedSite[])
    .filter((s) => s?.id)
    .map((s) => {
      const hosts = Array.isArray(s.hosts) ? s.hosts : [];
      const host = hosts.find((h) => h?.targetHostname) ?? hosts[0];
      return {
        id: String(s.id),
        name: s.displayName || s.name || String(s.id),
        domain: siteOrigin(host?.targetHostname),
        homePageId: host?.homePageId || null,
      };
    });
}

/** A site the app can scan: it needs a public host name to fetch its pages. */
export function isScannable(site: SiteOption): boolean {
  return Boolean(site.domain);
}

/**
 * The site the full-screen app opens on: the one picked last time, else the
 * one on the app's default domain (NEXT_PUBLIC_DEFAULT_SITE_DOMAIN), else the
 * first site with a host name. Sites without one are never chosen. Null when
 * no site can be scanned.
 */
export function chooseSite(sites: SiteOption[], rememberedId: string | null, defaultDomain: string | null | undefined): SiteOption | null {
  const scannable = sites.filter(isScannable);
  const remembered = rememberedId ? scannable.find((s) => s.id === rememberedId) : undefined;
  if (remembered) return remembered;
  const origin = siteOrigin(defaultDomain);
  const onDefault = origin ? scannable.find((s) => s.domain === origin) : undefined;
  return onDefault ?? scannable[0] ?? null;
}

/** The site picked last time in this organisation, if any. */
export function readPickedSite(organizationId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PICKED_SITE_PREFIX + organizationId);
  } catch {
    return null;
  }
}

export function writePickedSite(organizationId: string, siteId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PICKED_SITE_PREFIX + organizationId, siteId);
  } catch {
    // storage blocked: the app opens on the default site next time
  }
}
