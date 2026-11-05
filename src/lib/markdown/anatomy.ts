// ─────────────────────────────────────────────────────────────────────────────
// Where an HTML page's tokens go (plan Phase 13): the Agent View's Before
// view. Every character of the page gets one category:
//   - content: the main text, by the same rules as mainText (P3, P6 and the
//     Markdown preview), so the numbers match the Markdown. The <title> too:
//     it becomes the front matter.
//   - scripts: <script> elements, inline data blobs (__NEXT_DATA__) included.
//   - styles: <style> elements and style="" attributes.
//   - markup: tags, attributes, comments, whitespace between tags, inline SVG.
//   - chrome: any other text in <body>: menus, header, footer, hidden text.
//   - structuredData: JSON-LD, which agents use (P10, S7), so it isn't waste.
// Tokens are characters ÷ 4, as everywhere else (estimateTokens).
// ─────────────────────────────────────────────────────────────────────────────

import { NodeType, parse, type HTMLElement, type Node } from "node-html-parser";
import { controlledPanelIds, isHiddenText, mainTextScope } from "@/lib/html/extract-html";
import { estimateTokens } from "./convert";
import type { AnatomyKind, HtmlAnatomy, HtmlExcerpt } from "./types";

/** In the order the Agent View lists them. */
export const ANATOMY_KINDS: readonly AnatomyKind[] = ["content", "scripts", "styles", "markup", "chrome", "structuredData"];
/** What Markdown drops and agents don't use: red in the Agent View. */
export const WASTE_KINDS: readonly AnatomyKind[] = ["scripts", "styles", "markup", "chrome"];

/** The excerpt's length: the first 16 KB of the page. */
export const EXCERPT_MAX_CHARS = 16_384;

const STYLE_ATTR = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Elements whose whole source is one category. Others inside them (an SVG's <title>) stay markup.
const WHOLE: Record<string, AnatomyKind> = { script: "scripts", style: "styles", svg: "markup", noscript: "markup", template: "markup", iframe: "markup" };

const index = (kind: AnatomyKind) => ANATOMY_KINDS.indexOf(kind);
const MARKUP = index("markup");

/** One category index (into ANATOMY_KINDS) per character of `html`, and where <body> starts. */
export function classifyHtml(html: string): { kinds: Uint8Array; bodyStart: number } {
  const kinds = new Uint8Array(html.length).fill(MARKUP);
  const mark = ([start, end]: readonly [number, number], kind: AnatomyKind) => kinds.fill(index(kind), start, end);

  // Inline styles first: anything inside a script or a text node is marked again below.
  for (const m of html.matchAll(STYLE_ATTR)) mark([m.index, m.index + m[0].length], "styles");

  const root = parse(html);
  const body = root.querySelector("body") ?? root;
  const { scope, skip } = mainTextScope(root);
  const panels = controlledPanelIds(root);

  const walk = (node: Node, inBody: boolean, inContent: boolean, inTitle: boolean) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      if (!node.rawText.trim()) return; // whitespace between tags: markup
      if (inTitle || inContent) mark(node.range, "content");
      else if (inBody) mark(node.range, "chrome");
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE && node !== root) return;
    const el = node as HTMLElement;
    const tag = el.rawTagName?.toLowerCase() ?? "";
    const whole = WHOLE[tag];
    if (whole) {
      const jsonLd = tag === "script" && /^application\/ld\+json$/i.test(el.getAttribute("type")?.trim() ?? "");
      mark(el.range, jsonLd ? "structuredData" : whole);
      return;
    }
    const nowInBody = inBody || el === body;
    let nowInContent = inContent || el === scope;
    if (nowInContent && (skip.has(tag) || isHiddenText(el, panels))) nowInContent = false;
    for (const child of el.childNodes) walk(child, nowInBody, nowInContent, inTitle || tag === "title");
  };
  walk(root, root === body, false, false);
  return { kinds, bodyStart: body === root ? 0 : body.range[0] };
}

/** Characters ÷ 4 per category, rounded so they add up to estimateTokens of the whole page. */
function tokensByKind(counts: number[], total: number): Record<AnatomyKind, number> {
  const raw = counts.map((c) => c / 4);
  const tokens = raw.map(Math.floor);
  let left = total - tokens.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left--) tokens[byRemainder[k].i]++;
  return Object.fromEntries(ANATOMY_KINDS.map((kind, i) => [kind, tokens[i]])) as Record<AnatomyKind, number>;
}

/**
 * The page's tokens per category, and, with `excerptChars`, its first
 * characters as runs of one category each (adjacent runs merged).
 */
export function analyseHtml(html: string, { excerptChars }: { excerptChars?: number } = {}): { anatomy: HtmlAnatomy; excerpt: HtmlExcerpt | null } {
  const { kinds, bodyStart } = classifyHtml(html);
  const counts = ANATOMY_KINDS.map(() => 0);
  for (const k of kinds) counts[k]++;
  // In the body: the <title> is content too, but it isn't where the page's content starts.
  const firstContent = kinds.indexOf(index("content"), bodyStart);
  const anatomy: HtmlAnatomy = {
    tokens: tokensByKind(counts, estimateTokens(html)),
    contentStartsAt: firstContent === -1 ? null : Math.floor(firstContent / 4),
  };
  if (excerptChars === undefined) return { anatomy, excerpt: null };

  const end = Math.min(html.length, excerptChars);
  const segments: HtmlExcerpt["segments"] = [];
  for (let start = 0; start < end; ) {
    let stop = start + 1;
    while (stop < end && kinds[stop] === kinds[start]) stop++;
    segments.push({ kind: ANATOMY_KINDS[kinds[start]], text: html.slice(start, stop) });
    start = stop;
  }
  return { anatomy, excerpt: { segments, tokens: estimateTokens(html.slice(0, end)), truncated: html.length > end } };
}
