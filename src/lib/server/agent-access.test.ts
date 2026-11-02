import http from "node:http";
import type { AddressInfo } from "node:net";
import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { botGrid } from "@/lib/agent-access/grid";
import { collectAgentAccess, findTrustLinks, pickSamplePaths, readSitemap } from "./agent-access";
import { createSafeFetch } from "./safe-fetch";

const ALLOW = new Set(["127.0.0.1"]);
const fetcher = createSafeFetch({ allowHosts: ALLOW });

const HOME = `<!doctype html><html lang="en"><head><title>Home</title></head><body>
<header><a href="/">Home</a></header>
<main><h1>Welcome</h1><a href="/insights">Insights</a><a href="/files/brochure.pdf">PDF</a><a href="/services?x=1">Services</a><a href="https://other.example/x">Other</a></main>
<footer><a href="/about-us/leadership-team">Leadership</a><a href="/about-us">About</a><a href="/contact">Contact</a><a href="/privacy-policy">Privacy</a></footer>
</body></html>`;
const page = (text: string) => `<!doctype html><html><body><main><p>${text}</p></main></body></html>`;

describe("collectAgentAccess against a local server", () => {
  let server: http.Server;
  let slow: http.Server;
  let base = "";
  let slowBase = "";
  const userAgents: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const ua = req.headers["user-agent"] ?? "";
      userAgents.push(ua);
      const url = req.url ?? "/";
      const html = (body: string, headers: Record<string, string> = {}) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
        res.end(body);
      };
      if (/ChatGPT-User/.test(ua) && !url.startsWith("/robots")) {
        res.writeHead(403, { "content-type": "text/html" });
        res.end("Forbidden");
      } else if (url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: ${base}/sitemap.xml\n`);
      } else if (url === "/" && /text\/markdown/.test(req.headers.accept ?? "")) {
        res.writeHead(200, { "content-type": "text/markdown", vary: "Accept" });
        res.end("# Home\n\nWelcome.");
      } else if (url === "/") {
        html(HOME, { link: '</llms.txt>; rel="describedby"' });
      } else if (url === "/insights" || url === "/services") {
        html(page(`The ${url} page.`));
      } else if (url === "/about-us" || url === "/contact") {
        html(page("About us and how to reach us."));
      } else if (url === "/privacy-policy") {
        html(page("We respect your privacy. ".repeat(40)));
      } else if (url === "/sitemap.xml") {
        res.writeHead(200, { "content-type": "application/xml" });
        res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc><lastmod>2026-10-01</lastmod></url><url><loc>${base}/insights</loc></url></urlset>`);
      } else if (url === "/.well-known/agent-card.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"name":"Demo agent"}');
      } else if (url === "/.well-known/ucp") {
        html("<html>soft 404</html>"); // 200 HTML is not a discovery file
      } else {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("Not found");
      }
    });
    slow = http.createServer((req, res) => {
      const ua = req.headers["user-agent"] ?? "";
      if (req.url === "/" && !/bot|User/i.test(ua)) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(HOME);
      } else if (req.url === "/robots.txt") {
        res.writeHead(404);
        res.end();
      }
      // everything else hangs
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => slow.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    slowBase = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    slow.closeAllConnections();
    server.close();
    slow.close();
  });

  it("collects the evidence, and the grid finds ChatGPT-User blocked", async () => {
    const data = await collectAgentAccess(base, { fetch: fetcher, allowHosts: ALLOW });

    expect(data.siteUrl).toBe(base);
    expect(data.pages.map((p) => p.path)).toEqual(["/", "/insights", "/services"]);
    expect(data.home.linkHeader).toBe('</llms.txt>; rel="describedby"');
    expect(data.home.html?.title).toBe("Home");
    expect(data.markdown).toMatchObject({ vary: "Accept", body: "# Home\n\nWelcome." });
    expect(data.sitemap).toMatchObject({ source: "robots", kind: "urlset", urlCount: 2, lastmodCount: 1 });
    expect(data.llmsTxt.probe.status).toBe(404);
    expect(data.notFound.status).toBe(404);
    expect(data.trustPages.map((t) => [t.kind, t.probe?.status])).toEqual([["about", 200], ["contact", 200], ["privacy", 200]]);
    expect(data.trustPages[2].textChars).toBeGreaterThan(500);
    expect(data.wellKnown.find((w) => w.id === "a2a-agent-card")?.json).toBe(true);
    expect(data.wellKnown.find((w) => w.id === "ucp")?.json).toBe(false);

    // GPTBot is disallowed by robots.txt, so it's never requested; the robots-only tokens have no crawler.
    expect(data.bots.find((b) => b.name === "GPTBot")).toMatchObject({ skipped: "robots", results: [] });
    expect(data.bots.find((b) => b.name === "Google-Extended")).toMatchObject({ skipped: "token-only" });
    expect(userAgents.some((ua) => /GPTBot/.test(ua))).toBe(false);
    expect(userAgents.some((ua) => /Claude-User/.test(ua))).toBe(true);

    const rows = Object.fromEntries(botGrid(data).map((r) => [r.bot.name, r]));
    expect(rows["ChatGPT-User"]).toMatchObject({ outcome: "blocked", live: "403", failStatus: 403 });
    expect(rows["Claude-User"]).toMatchObject({ outcome: "can-read", live: "200" });
    expect(data.requestCount).toBeGreaterThan(40);
  });

  it("stops at the deadline and reports what didn't finish", async () => {
    const started = Date.now();
    const data = await collectAgentAccess(slowBase, { fetch: fetcher, allowHosts: ALLOW, deadlineMs: 1_200, requestTimeoutMs: 5_000 });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(data.home.probe.status).toBe(200);
    const claude = data.bots.find((b) => b.name === "Claude-User")!;
    expect(claude.results.every((r) => r.status === null && r.error === "deadline")).toBe(true);
  });

  it("rejects a private address before fetching anything", async () => {
    await expect(collectAgentAccess("http://169.254.169.254")).rejects.toMatchObject({ code: "blocked_url" });
  });
});

describe("pure helpers", () => {
  const root = parse(HOME);
  const base = new URL("https://example.com/");

  it("picks internal page links from <main>, skipping files, home and other sites", () => {
    expect(pickSamplePaths(root, base)).toEqual(["/insights", "/services"]);
  });

  it("finds the trust links in the footer", () => {
    expect(findTrustLinks(root, base)).toEqual({
      about: "https://example.com/about-us",
      contact: "https://example.com/contact",
      privacy: "https://example.com/privacy-policy",
    });
  });

  it("reads a sitemap index", () => {
    expect(readSitemap('<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap><sitemap><loc>https://e.com/s2.xml</loc></sitemap></sitemapindex>')).toMatchObject({
      kind: "sitemapindex",
      childLocs: ["https://e.com/s1.xml", "https://e.com/s2.xml"],
    });
    expect(readSitemap("<html></html>").kind).toBeNull();
  });
});
