import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { extractMainText, extractQaPairs } from "@/lib/html/extract-html";
import { makeTestMarkdownCheck, makeTestPageSource } from "@/lib/rule-engine/test-fixture";
import { analyseHtml, ANATOMY_KINDS, classifyHtml, EXCERPT_MAX_CHARS, WASTE_KINDS } from "./anatomy";
import { estimateTokens } from "./convert";
import type { AnatomyKind } from "./types";

const capture = (name: string) => readFileSync(new URL(`../html/fixtures/${name}`, import.meta.url), "utf8");
const CAPTURES = ["brandx-article-live.html", "brandx-stpatricks-live.html", "brandx-faq-draft.html"];

const sum = (tokens: Record<AnatomyKind, number>) => ANATOMY_KINDS.reduce((a, k) => a + tokens[k], 0);

/** The category of each character of `needle` in `html` (its first occurrence). */
function kindsOf(html: string, needle: string): Set<AnatomyKind> {
  const at = html.indexOf(needle);
  expect(at, `"${needle}" in the page`).toBeGreaterThanOrEqual(0);
  const { kinds } = classifyHtml(html);
  return new Set([...kinds.slice(at, at + needle.length)].map((k) => ANATOMY_KINDS[k]));
}

describe("analyseHtml on the BrandX captures", () => {
  it.each(CAPTURES)("%s: the categories add up to the page's total tokens", (name) => {
    const html = capture(name);
    const { anatomy } = analyseHtml(html);
    expect(sum(anatomy.tokens)).toBe(estimateTokens(html));
    expect(anatomy.tokens.content).toBeGreaterThan(0);
    expect(anatomy.tokens.markup).toBeGreaterThan(0);
  });

  it.each(CAPTURES)("%s: content is about the size of mainText", (name) => {
    const html = capture(name);
    const { anatomy } = analyseHtml(html);
    // The source keeps entities and whitespace that mainText decodes and collapses.
    const main = estimateTokens(extractMainText(parse(html)));
    expect(anatomy.tokens.content).toBeGreaterThanOrEqual(main * 0.8);
    expect(anatomy.tokens.content).toBeLessThanOrEqual(main * 1.5);
  });

  it("counts JSON-LD as structured data", () => {
    const html = capture("brandx-article-live.html");
    const { anatomy } = analyseHtml(html);
    expect(anatomy.tokens.structuredData).toBeGreaterThan(0);
    expect(anatomy.tokens.scripts).toBe(0); // the capture keeps only its JSON-LD scripts
    expect(kindsOf(html, '<script type="application/ld+json"')).toEqual(new Set(["structuredData"]));
  });

  it("counts collapsed FAQ answers as content", () => {
    const html = capture("brandx-faq-draft.html");
    const pairs = extractQaPairs(parse(html));
    expect(pairs.length).toBeGreaterThan(0);
    for (const { answer } of pairs) {
      const words = answer.split(" ").slice(0, 4).join(" ");
      expect(kindsOf(html, words)).toEqual(new Set(["content"]));
    }
  });
});

describe("classifyHtml", () => {
  const PAGE = `<!doctype html><html><head><title>Pricing</title><meta name="description" content="Plans">
<script>window.__NEXT_DATA__={"page":"/"}</script><style>body{margin:0}</style>
<script type="application/ld+json">{"@type":"Organization"}</script></head><body>
<header><a href="/"><svg viewBox="0 0 1 1"><title>Logo</title><path d="M0"/></svg>BrandX</a></header>
<main><h1 style="color:red">Our plans</h1><nav>Back to top</nav><p>Every plan includes support.</p>
<div aria-hidden="true">Loading…</div><!-- note --></main>
<footer><a href="/privacy">Privacy</a></footer></body></html>`;

  it.each<[string, AnatomyKind]>([
    ["Every plan includes support.", "content"],
    ["Our plans", "content"],
    ["window.__NEXT_DATA__", "scripts"],
    ["body{margin:0}", "styles"],
    [' style="color:red"', "styles"],
    ['{"@type":"Organization"}', "structuredData"],
    ['<path d="M0"/>', "markup"],
    ["<!-- note -->", "markup"],
    ["BrandX", "chrome"],
    ["Back to top", "chrome"],
    ["Loading…", "chrome"],
    ["Privacy", "chrome"],
    ["<p>", "markup"],
  ])("%s is %s", (needle, kind) => {
    expect(kindsOf(PAGE, needle)).toEqual(new Set([kind]));
  });

  it("counts the <title> as content: it becomes the front matter", () => {
    expect(kindsOf(PAGE, "Pricing")).toEqual(new Set(["content"]));
  });

  it("without <main>, reads the body without header, nav and footer, as mainText does", () => {
    const html = `<body><header>Menu</header><h1>Hello</h1><p>World</p><footer>Legal</footer></body>`;
    expect(kindsOf(html, "Hello")).toEqual(new Set(["content"]));
    expect(kindsOf(html, "Menu")).toEqual(new Set(["chrome"]));
    expect(kindsOf(html, "Legal")).toEqual(new Set(["chrome"]));
  });

  it("works on a fragment without <html> or <body>", () => {
    expect(kindsOf("<p>Just text</p>", "Just text")).toEqual(new Set(["content"]));
    expect(sum(analyseHtml("<p>Just text</p>").anatomy.tokens)).toBe(estimateTokens("<p>Just text</p>"));
  });
});

describe("analyseHtml's excerpt", () => {
  const html = capture("brandx-article-live.html");

  it("is only made when asked for", () => {
    expect(analyseHtml(html).excerpt).toBeNull();
  });

  it("is the first characters, as runs of one category each", () => {
    const { excerpt } = analyseHtml(html, { excerptChars: EXCERPT_MAX_CHARS });
    const text = excerpt!.segments.map((s) => s.text).join("");
    expect(text).toBe(html.slice(0, EXCERPT_MAX_CHARS));
    expect(excerpt!.truncated).toBe(html.length > EXCERPT_MAX_CHARS);
    expect(excerpt!.tokens).toBe(estimateTokens(text));
    excerpt!.segments.forEach((s, i) => i > 0 && expect(s.kind).not.toBe(excerpt!.segments[i - 1].kind));
  });

  it("isn't cut when the page is shorter", () => {
    const { excerpt } = analyseHtml("<p>Hi</p>", { excerptChars: EXCERPT_MAX_CHARS });
    expect(excerpt).toEqual({
      segments: [
        { kind: "markup", text: "<p>" },
        { kind: "content", text: "Hi" },
        { kind: "markup", text: "</p>" },
      ],
      tokens: 3,
      truncated: false,
    });
  });

  it("says where the content starts", () => {
    const html = `<head><script>${"x".repeat(400)}</script></head><body><p>Hi</p></body>`;
    expect(analyseHtml(html).anatomy.contentStartsAt).toBe(Math.floor(html.indexOf("Hi") / 4));
    expect(analyseHtml("<div></div>").anatomy.contentStartsAt).toBeNull();
  });
});

describe("the demo page", () => {
  it("looks like a real Next.js page: about 97% of it isn't content", () => {
    const { anatomy } = analyseHtml(makeTestPageSource());
    const total = sum(anatomy.tokens);
    const waste = WASTE_KINDS.reduce((a, k) => a + anatomy.tokens[k], 0);
    expect(anatomy.tokens.content / total).toBeLessThan(0.05);
    expect(waste / total).toBeGreaterThan(0.9);
    for (const k of ANATOMY_KINDS) expect(anatomy.tokens[k], k).toBeGreaterThan(0);
  });

  it("shows its content inside the excerpt", () => {
    const { anatomy } = analyseHtml(makeTestPageSource());
    expect(anatomy.contentStartsAt).not.toBeNull();
    expect(anatomy.contentStartsAt!).toBeLessThan(estimateTokens("x".repeat(EXCERPT_MAX_CHARS)));
  });

  it("is what the demo's Before view shows, without and with Markdown", () => {
    for (const serves of [false, true]) {
      const { html } = makeTestMarkdownCheck({ serves });
      expect(html.anatomy).toEqual(analyseHtml(makeTestPageSource()).anatomy);
      expect(html.excerpt?.segments.length).toBeGreaterThan(10);
      expect(sum(html.anatomy!.tokens)).toBe(html.tokens);
    }
  });
});
