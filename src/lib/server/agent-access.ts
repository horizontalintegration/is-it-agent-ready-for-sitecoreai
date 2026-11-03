// ─────────────────────────────────────────────────────────────────────────────
// Collects the evidence for the site checks S1–S12 (plan section 5.2) for
// /api/agent-access. Every request goes through safeFetch (SSRF protection).
//
// Budget (a real scan must finish in under 20 s):
//   - at most CONCURRENCY requests at a time, so the site's firewall doesn't
//     see a burst (which could itself cause 403s and false results);
//   - REQUEST_TIMEOUT_MS per request, and one DEADLINE_MS for the whole scan:
//     whatever hasn't finished by then is reported as "deadline";
//   - a priority queue: robots.txt and the home page first, then the bot
//     requests (S1, the slowest part), then everything else.
//
// Order: round 1 starts robots.txt, the home page, and every request that
// needs neither. Once robots.txt and the home page are in, round 2 starts the
// sample pages, the bot × page requests, the sitemap and the trust pages.
// About 50 requests for a content site.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { BOTS, BROWSER_USER_AGENT } from "@/lib/agent-access/bots";
import { isAllowed, parseRobots, siteSitemap, type ParsedRobots } from "@/lib/agent-access/robots";
import type {
  AgentAccessData,
  BotAccess,
  HttpProbe,
  PageProbe,
  SamplePage,
  SitemapEvidence,
  TrustPageEvidence,
  TrustPageKind,
  WellKnownEvidence,
} from "@/lib/agent-access/types";
import { WELL_KNOWN_PATHS } from "@/lib/agent-access/well-known";
import { MARKDOWN_ACCEPT } from "@/lib/checks/markdown-negotiation";
import { extractFooterTrust, extractParsedHtml } from "@/lib/html/extract-html";
import { safeFetch as appSafeFetch, SafeFetchError, validateUrl } from "./safe-fetch";

export const CONCURRENCY = 6;
export const REQUEST_TIMEOUT_MS = 6_000;
export const DEADLINE_MS = 17_000;
const SAMPLE_PAGES = 2;

// Bot challenge pages (Cloudflare, Akamai, PerimeterX, DataDome, generic captcha walls).
const CHALLENGE_RE =
  /cf-chl|challenge-platform|just a moment\.\.\.|attention required!|px-captcha|captcha-delivery|<title>[^<]*(access denied|captcha|are you a robot)/i;

const NON_PAGE_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|docx?|xlsx?|pptx?|mp[34]|xml|txt|json|css|js)$/i;

const TRUST_PATTERNS: Record<TrustPageKind, RegExp> = {
  about: /\/about/,
  contact: /\/contact/,
  privacy: /privacy/,
};

type Fetcher = typeof appSafeFetch;

export interface CollectOptions {
  fetch?: Fetcher;
  concurrency?: number;
  requestTimeoutMs?: number;
  deadlineMs?: number;
  /** Hosts that skip the address check (tests; SAFE_FETCH_ALLOW_HOSTS otherwise). */
  allowHosts?: ReadonlySet<string>;
}

/** "example.com", "https://example.com/x" → "https://example.com". Throws SafeFetchError on a bad or private URL. */
export function siteOrigin(domain: string, allowHosts?: ReadonlySet<string>): string {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  return validateUrl(raw, allowHosts).origin;
}

// ── Priority queue ────────────────────────────────────────────────────────────

function createScheduler(max: number) {
  let active = 0;
  let seq = 0;
  const queue: Array<{ priority: number; seq: number; start: () => void }> = [];
  const pump = () => {
    while (active < max && queue.length > 0) {
      queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      active++;
      queue.shift()!.start();
    }
  };
  return function schedule<T>(priority: number, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        priority,
        seq: seq++,
        start: () => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        },
      });
      pump();
    });
  };
}

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

/** Up to `max` internal page paths linked from the home page, links in <main> first. */
export function pickSamplePaths(root: HTMLElement, base: URL, max = SAMPLE_PAGES): string[] {
  const out: string[] = [];
  const scopes = [root.querySelector("main"), root].filter((s): s is HTMLElement => s !== null);
  for (const scope of scopes) {
    for (const a of scope.querySelectorAll("a[href]")) {
      let u: URL;
      try {
        u = new URL(a.getAttribute("href") ?? "", base);
      } catch {
        continue;
      }
      const path = u.pathname;
      if (u.origin !== base.origin || path === "/" || path === base.pathname || NON_PAGE_EXT.test(path)) continue;
      if (out.includes(path)) continue;
      out.push(path);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * The about, contact and privacy links on the home page: footer links first,
 * and the shortest path within each (so "/about-us" beats "/about-us/leadership-team").
 */
export function findTrustLinks(root: HTMLElement, base: URL): Record<TrustPageKind, string | null> {
  const found: Record<TrustPageKind, string | null> = { about: null, contact: null, privacy: null };
  const scopes = [root.querySelector("footer"), root].filter((s): s is HTMLElement => s !== null);
  for (const scope of scopes) {
    const urls = scope.querySelectorAll("a[href]").flatMap((a) => {
      try {
        const u = new URL(a.getAttribute("href") ?? "", base);
        return u.protocol === "http:" || u.protocol === "https:" ? [u] : [];
      } catch {
        return [];
      }
    });
    for (const kind of Object.keys(found) as TrustPageKind[]) {
      if (found[kind]) continue;
      const matches = urls.filter((u) => TRUST_PATTERNS[kind].test(u.pathname.toLowerCase()));
      matches.sort((a, b) => a.pathname.length - b.pathname.length);
      if (matches[0]) found[kind] = matches[0].href;
    }
  }
  return found;
}

/** Root element and entry counts of a sitemap. */
export function readSitemap(xml: string): { kind: SitemapEvidence["kind"]; urlCount: number; lastmodCount: number; childLocs: string[] } {
  const kind = /<(?:\w+:)?urlset[\s>]/.test(xml) ? "urlset" : /<(?:\w+:)?sitemapindex[\s>]/.test(xml) ? "sitemapindex" : null;
  if (kind === "sitemapindex") {
    const childLocs = [...xml.matchAll(/<sitemap[\s>][\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    return { kind, urlCount: 0, lastmodCount: 0, childLocs };
  }
  return {
    kind,
    urlCount: (xml.match(/<url[\s>]/g) ?? []).length,
    lastmodCount: (xml.match(/<lastmod>/g) ?? []).length,
    childLocs: [],
  };
}

function isJsonObject(text: string | null, contentType: string | null): boolean {
  if (!text || /html/i.test(contentType ?? "")) return false;
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null;
  } catch {
    return false;
  }
}

// ── Collector ─────────────────────────────────────────────────────────────────

export async function collectAgentAccess(domain: string, options: CollectOptions = {}): Promise<AgentAccessData> {
  const fetcher = options.fetch ?? appSafeFetch;
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(options.deadlineMs ?? DEADLINE_MS);
  const schedule = createScheduler(options.concurrency ?? CONCURRENCY);
  const started = Date.now();
  let requestCount = 0;

  const origin = siteOrigin(domain, options.allowHosts);

  /** One GET. Never throws. `text` is kept only when asked for. */
  const request = (
    priority: number,
    url: string,
    opts: { userAgent?: string; accept?: string; maxBytes?: number; keepText?: boolean } = {},
  ) =>
    schedule(priority, async (): Promise<{ probe: HttpProbe; text: string | null; headers: Headers | null }> => {
      const failed = (error: string) => ({
        probe: { url, finalUrl: null, status: null, error, contentType: null, bytes: 0 },
        text: null,
        headers: null,
      });
      if (deadline.aborted) return failed("deadline");
      requestCount++;
      try {
        const res = await fetcher(url, {
          publicHeaders: {
            "user-agent": opts.userAgent ?? BROWSER_USER_AGENT,
            accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
          },
          timeoutMs,
          maxBytes: opts.maxBytes,
          signal: deadline,
        });
        const buf = new Uint8Array(await res.arrayBuffer());
        return {
          probe: {
            url,
            finalUrl: res.url || url,
            status: res.status,
            error: null,
            contentType: res.headers.get("content-type"),
            bytes: buf.byteLength,
          },
          text: opts.keepText === false ? null : new TextDecoder().decode(buf),
          headers: res.headers,
        };
      } catch (err) {
        if (deadline.aborted) return failed("deadline");
        return failed(err instanceof SafeFetchError ? err.code : "fetch_failed");
      }
    });

  /** A page request, checked for a challenge page. */
  const pageRequest = async (priority: number, url: string, userAgent?: string): Promise<PageProbe> => {
    const { probe, text } = await request(priority, url, { userAgent });
    return { ...probe, challenge: text ? CHALLENGE_RE.test(text.slice(0, 30_000)) : false };
  };

  // ── Round 1 ──
  const robotsP = request(0, `${origin}/robots.txt`, { maxBytes: 500 * 1024 });
  const homeP = request(0, `${origin}/`);
  const markdownP = request(2, `${origin}/`, { accept: MARKDOWN_ACCEPT });
  const llmsP = request(2, `${origin}/llms.txt`, { maxBytes: 1024 * 1024 });
  const notFoundP = request(2, `${origin}/agent-ready-check-${randomBytes(6).toString("hex")}`, { keepText: false });
  const wellKnownP = Promise.all(
    WELL_KNOWN_PATHS.map(async ({ id, path }): Promise<WellKnownEvidence> => {
      const { probe, text } = await request(2, `${origin}${path}`, { accept: "application/json, */*;q=0.5", maxBytes: 512 * 1024 });
      const ok = probe.status === 200;
      return {
        id,
        path,
        probe,
        json: ok && isJsonObject(text, probe.contentType),
        paymentInfo: ok && id === "openapi" && (text ?? "").includes('"x-payment-info"'),
      };
    }),
  );

  const [robots, home] = await Promise.all([robotsP, homeP]);

  const parsedRobots: ParsedRobots | null = robots.probe.status === 200 && robots.text ? parseRobots(robots.text) : null;
  const homeUrl = new URL(home.probe.finalUrl ?? `${origin}/`);
  const siteUrl = homeUrl.origin;
  const homeIsHtml = home.probe.status !== null && home.probe.status < 300 && /html/i.test(home.probe.contentType ?? "") && home.text !== null;
  const homeRoot = homeIsHtml ? parse(home.text!) : null;
  const homeProbe: PageProbe = { ...home.probe, challenge: home.text ? CHALLENGE_RE.test(home.text.slice(0, 30_000)) : false };

  // ── Round 2 ──
  const samplePaths = homeRoot ? pickSamplePaths(homeRoot, homeUrl) : [];
  const samplesP = Promise.all(
    samplePaths.map(async (path): Promise<SamplePage> => ({ path, browser: await pageRequest(1, `${siteUrl}${path}`) })),
  );
  const paths = ["/", ...samplePaths];

  const botsP = Promise.all(
    BOTS.map(async (bot): Promise<BotAccess> => {
      if (!bot.userAgent) return { name: bot.name, skipped: "token-only", results: [] };
      if (parsedRobots && !isAllowed(parsedRobots, bot.name, "/")) return { name: bot.name, skipped: "robots", results: [] };
      const results = await Promise.all(paths.map((path) => pageRequest(1, `${siteUrl}${path}`, bot.userAgent!)));
      return { name: bot.name, skipped: null, results };
    }),
  );

  const sitemapP = (async (): Promise<SitemapEvidence> => {
    const fromRobots = parsedRobots ? siteSitemap(parsedRobots, siteUrl) : null;
    const url = fromRobots ?? `${siteUrl}/sitemap.xml`;
    const { probe, text } = await request(2, url, { accept: "application/xml, text/xml, */*;q=0.5", maxBytes: 10 * 1024 * 1024 });
    const evidence: SitemapEvidence = {
      source: fromRobots ? "robots" : "default",
      probe,
      kind: null,
      urlCount: 0,
      lastmodCount: 0,
      childCount: 0,
      child: null,
    };
    if (probe.status !== 200 || !text) return evidence;
    const read = readSitemap(text);
    evidence.kind = read.kind;
    evidence.urlCount = read.urlCount;
    evidence.lastmodCount = read.lastmodCount;
    if (read.kind === "sitemapindex") {
      evidence.childCount = read.childLocs.length;
      if (read.childLocs[0]) {
        const child = await request(2, read.childLocs[0], { accept: "application/xml, text/xml, */*;q=0.5", maxBytes: 10 * 1024 * 1024 });
        evidence.child = child.probe;
        if (child.probe.status === 200 && child.text) {
          const c = readSitemap(child.text);
          evidence.urlCount = c.urlCount;
          evidence.lastmodCount = c.lastmodCount;
        }
      }
    }
    return evidence;
  })();

  const trustLinks = homeRoot ? findTrustLinks(homeRoot, homeUrl) : { about: null, contact: null, privacy: null };
  const trustP = Promise.all(
    (Object.keys(trustLinks) as TrustPageKind[]).map(async (kind): Promise<TrustPageEvidence> => {
      const href = trustLinks[kind];
      if (!href) return { kind, href: null, probe: null, textChars: 0 };
      const { probe, text } = await request(2, href);
      const isHtml = probe.status === 200 && /html/i.test(probe.contentType ?? "") && text !== null;
      return { kind, href, probe, textChars: isHtml ? extractParsedHtml(text!).mainText.length : 0 };
    }),
  );

  const [samples, bots, sitemap, trustPages, markdown, llms, notFound, wellKnown] = await Promise.all([
    samplesP,
    botsP,
    sitemapP,
    trustP,
    markdownP,
    llmsP,
    notFoundP,
    wellKnownP,
  ]);

  return {
    siteUrl,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    requestCount,
    robots: { probe: robots.probe, text: robots.probe.status === 200 ? robots.text : null },
    home: {
      probe: homeProbe,
      html: homeIsHtml ? extractParsedHtml(home.text!) : null,
      linkHeader: home.headers?.get("link") ?? null,
      webMcp: homeIsHtml && /navigator\.modelContext/.test(home.text!),
      footer: homeIsHtml ? extractFooterTrust(home.text!) : null,
    },
    pages: [{ path: "/", browser: homeProbe }, ...samples],
    bots,
    markdown: {
      probe: markdown.probe,
      vary: markdown.headers?.get("vary") ?? null,
      body: markdown.text ? markdown.text.slice(0, 20_000) : null,
    },
    sitemap,
    llmsTxt: { probe: llms.probe, text: llms.probe.status === 200 && llms.text ? llms.text.slice(0, 100_000) : null },
    trustPages,
    notFound: notFound.probe,
    wellKnown,
  };
}
