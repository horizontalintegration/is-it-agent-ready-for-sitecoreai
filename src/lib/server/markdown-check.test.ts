import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectMarkdownCheck } from "./markdown-check";
import { createSafeFetch } from "./safe-fetch";

const ALLOW = new Set(["127.0.0.1"]);
const fetcher = createSafeFetch({ allowHosts: ALLOW });

const PAGE = `<!doctype html><html lang="en"><head><title>Pricing | BrandX</title><meta name="description" content="Plans and prices.">
<script>window.__DATA__=${JSON.stringify({ padding: "x".repeat(4000) })}</script></head><body>
<header><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
<main><h1>Pricing</h1><p>Every plan includes support.</p></main>
<footer><a href="/privacy">Privacy</a></footer></body></html>`;
const MARKDOWN = "---\ntitle: Pricing\n---\n\n# Pricing\n\nEvery plan includes support.\n";

describe("collectMarkdownCheck against a local server", () => {
  let server: http.Server;
  let base = "";
  const accepts: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const accept = req.headers.accept ?? "";
      accepts.push(accept);
      const url = req.url ?? "/";
      if (url === "/missing") {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("<p>Not found</p>");
      } else if (url === "/served" && accept.includes("text/markdown")) {
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", vary: "Accept" });
        res.end(MARKDOWN);
      } else {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("requests the page as an agent and as a browser", async () => {
    accepts.length = 0;
    await collectMarkdownCheck(`${base}/served`, { fetch: fetcher, allowHosts: ALLOW });
    expect(accepts.sort()).toEqual(["text/html", "text/markdown, text/html;q=0.5"]);
  });

  it("keeps a served Markdown body and makes no preview", async () => {
    const data = await collectMarkdownCheck(`${base}/served`, { fetch: fetcher, allowHosts: ALLOW });
    expect(data.markdown).toMatchObject({ status: 200, vary: "Accept", body: MARKDOWN, truncated: false, tokens: Math.ceil(MARKDOWN.length / 4) });
    expect(data.markdown.contentType).toContain("text/markdown");
    expect(data.html).toMatchObject({ status: 200, bytes: PAGE.length });
    expect(data.preview).toBeNull();
  });

  it("converts the published HTML when the page doesn't serve Markdown", async () => {
    const data = await collectMarkdownCheck(`${base}/pricing`, { fetch: fetcher, allowHosts: ALLOW });
    expect(data.markdown.contentType).toContain("text/html");
    expect(data.markdown.body?.length).toBe(2_000);
    expect(data.markdown.truncated).toBe(true);
    expect(data.preview?.markdown).toBe(`---\ntitle: Pricing | BrandX\ndescription: Plans and prices.\nurl: ${base}/pricing\n---\n\n# Pricing\n\nEvery plan includes support.\n`);
    expect(data.preview!.tokens).toBeLessThan(data.html.tokens / 10);
  });

  it("breaks the HTML page's tokens down, with or without Markdown", async () => {
    for (const path of ["/pricing", "/served"]) {
      const data = await collectMarkdownCheck(`${base}${path}`, { fetch: fetcher, allowHosts: ALLOW });
      const { tokens } = data.html.anatomy!;
      expect(Object.values(tokens).reduce((a, b) => a + b, 0)).toBe(data.html.tokens);
      expect(tokens.scripts).toBeGreaterThan(1_000); // the __DATA__ blob
      expect(tokens.content).toBeGreaterThan(0);
      expect(data.html.excerpt).toBeNull(); // only when asked for
    }
  });

  it("adds the start of the HTML when asked for (the panel)", async () => {
    const data = await collectMarkdownCheck(`${base}/pricing`, { fetch: fetcher, allowHosts: ALLOW, excerpt: true });
    expect(data.html.excerpt!.segments.map((s) => s.text).join("")).toBe(PAGE);
    expect(data.html.excerpt!.truncated).toBe(false);
  });

  it("reports a missing page without a preview", async () => {
    const data = await collectMarkdownCheck(`${base}/missing`, { fetch: fetcher, allowHosts: ALLOW, excerpt: true });
    expect(data.html.status).toBe(404);
    expect(data.preview).toBeNull();
    expect(data.html.anatomy).toBeNull();
    expect(data.html.excerpt).toBeNull();
  });

  it("refuses private addresses before fetching", async () => {
    await expect(collectMarkdownCheck("http://127.0.0.1/x", { fetch: createSafeFetch() })).rejects.toMatchObject({ code: "blocked_url" });
  });
});
