// ─────────────────────────────────────────────────────────────────────────────
// What /api/agent-access returns: the evidence for the site checks S1–S12,
// fetched once per site. No grading happens in the route: the checks in
// src/lib/checks/site/ grade this data, so the engine stays synchronous and
// the panel, the dashboard and the demo fixture all go through the same code.
// ─────────────────────────────────────────────────────────────────────────────

import type { FooterTrust, ParsedHtml } from "@/lib/rule-engine/types";

/** One HTTP request's outcome. Never thrown: a failed request has `status: null` and an `error`. */
export interface HttpProbe {
  /** The URL requested. */
  url: string;
  /** After redirects. Null when the request failed. */
  finalUrl: string | null;
  status: number | null;
  /** "timeout", "too_large", "fetch_failed", "blocked_url", "deadline" (not started in time), … */
  error: string | null;
  contentType: string | null;
  /** Body size in bytes. 0 when the request failed. */
  bytes: number;
}

/** A page request that may be a firewall's challenge page instead of the real page. */
export interface PageProbe extends HttpProbe {
  /** The body has the markers of a bot challenge (Cloudflare "Just a moment…", captcha walls). */
  challenge: boolean;
}

/** One page (home or a sample), requested as a browser. */
export interface SamplePage {
  /** Path on the site, e.g. "/" or "/about". */
  path: string;
  browser: PageProbe;
}

export interface BotAccess {
  /** The bot's robots.txt token, as in BOTS. */
  name: string;
  /**
   * Why the bot wasn't requested live, if it wasn't:
   * - "token-only": a robots.txt token with no crawler of its own
   * - "robots": robots.txt asks it to stay out, so we don't request as it
   */
  skipped: "token-only" | "robots" | null;
  /** One per page in `pages`, same order. Empty when skipped. */
  results: PageProbe[];
}

export interface SitemapEvidence {
  /** Where the URL came from: robots.txt's Sitemap line, or the default /sitemap.xml. */
  source: "robots" | "default";
  probe: HttpProbe;
  /** Root element: a list of URLs or an index of sitemaps. Null when it isn't sitemap XML. */
  kind: "urlset" | "sitemapindex" | null;
  /** <url> entries (for an index: in the first child sitemap). */
  urlCount: number;
  /** Entries with a <lastmod>, counted like `urlCount`. */
  lastmodCount: number;
  /** For an index: how many sitemaps it lists, and the first one, which was read. */
  childCount: number;
  child: HttpProbe | null;
}

export type TrustPageKind = "about" | "contact" | "privacy";

export interface TrustPageEvidence {
  kind: TrustPageKind;
  /** The link found on the home page (footer first). Null when there's none. */
  href: string | null;
  probe: HttpProbe | null;
  /** Readable text on the page (main content, no header, nav or footer). */
  textChars: number;
}

/** Well-known discovery files (S11 App/API, S12 Commerce). */
export type WellKnownId =
  | "mcp-server-card"
  | "mcp-json"
  | "a2a-agent-card"
  | "a2a-agent-legacy"
  | "agent-skills"
  | "api-catalog"
  | "oauth-protected-resource"
  | "oauth-authorization-server"
  | "ucp"
  | "acp"
  | "openapi";

export interface WellKnownEvidence {
  id: WellKnownId;
  path: string;
  probe: HttpProbe;
  /** The body parsed as a JSON object (not an HTML error page served with 200). */
  json: boolean;
  /** For /openapi.json: an operation carries `x-payment-info` (MPP). */
  paymentInfo: boolean;
}

export interface AgentAccessData {
  /** The origin scanned, after the home page's redirects (e.g. https://www.example.com). */
  siteUrl: string;
  checkedAt: string;
  durationMs: number;
  /** Total requests made, for the logs and the docs. */
  requestCount: number;

  robots: { probe: HttpProbe; text: string | null };

  home: {
    /** The browser request for "/". Same object as pages[0].browser. */
    probe: PageProbe;
    /** Parsed for S7 and the dashboard. Null when the home page couldn't be read. */
    html: ParsedHtml | null;
    /** The raw `Link` response header (S10). */
    linkHeader: string | null;
    /** The page's own script calls the WebMCP API (navigator.modelContext). Inline scripts only. */
    webMcp: boolean;
    footer: FooterTrust | null;
  };

  /** Home first, then up to 2 sample pages linked from it. */
  pages: SamplePage[];
  bots: BotAccess[];

  /** The home page requested with `Accept: text/markdown` (S3). */
  markdown: {
    probe: HttpProbe;
    vary: string | null;
    /** The first 20,000 characters, to tell Markdown from HTML. */
    body: string | null;
  };

  sitemap: SitemapEvidence | null;
  llmsTxt: { probe: HttpProbe; text: string | null };
  trustPages: TrustPageEvidence[];
  /** A path that can't exist (S8). */
  notFound: HttpProbe;
  wellKnown: WellKnownEvidence[];
}
