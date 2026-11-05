import { parse, NodeType, type HTMLElement, type Node, type TextNode } from "node-html-parser";
import { parseJsonLdScript } from "@/lib/checks/json-ld";
import { QUESTION_REGEX } from "@/lib/rule-engine/helpers";
import type { BodyBlock, FooterTrust, ParsedHtml, QaPair } from "@/lib/rule-engine/types";

/** Upper bound on `mainText`, so a very long page doesn't bloat the JSON response. */
export const MAIN_TEXT_MAX_CHARS = 20_000;
/** Upper bound on the total text in `bodyBlocks`. Higher than `mainText`: it includes the chrome. */
export const BODY_TEXT_MAX_CHARS = 50_000;

// Never content, wherever they appear.
const NON_CONTENT_TAGS: ReadonlySet<string> = new Set(["script", "style", "noscript", "template", "svg", "iframe", "nav"]);
// Site chrome. Skipped only when there is no <main>: inside <main>, a <header>
// or <footer> usually belongs to an article (title, byline, date).
const CHROME_TAGS: ReadonlySet<string> = new Set(["header", "footer"]);

/** True for an element mainText skips as hidden: `hidden` or `aria-hidden`, unless a toggle controls it. */
export const isHiddenText = (el: HTMLElement, panels: Set<string>) =>
  (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") && !panels.has(el.id);
// Elements that start a new line, so adjacent blocks don't run together.
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "button", "dd", "details", "div", "dl", "dt",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "main", "ol",
  "p", "pre", "section", "summary", "table", "td", "th", "tr", "ul",
]);

/**
 * Decoded text of an element, whitespace collapsed. `innerText` leaves
 * entities like `&nbsp;` encoded; `.text` decodes them. Includes collapsed
 * (aria-hidden) panels.
 */
function plainText(el: HTMLElement): string {
  return el.text.replace(/\s+/g, " ").trim();
}

/**
 * Ids of panels that a toggle controls (`aria-controls`). They're hidden until
 * opened (collapsed FAQ answers), but they're content, so the text keeps them.
 */
export function controlledPanelIds(root: HTMLElement): Set<string> {
  const ids = new Set<string>();
  for (const toggle of root.querySelectorAll("[aria-controls]")) {
    for (const id of (toggle.getAttribute("aria-controls") ?? "").split(/\s+/)) if (id) ids.add(id);
  }
  return ids;
}

function collectText(node: Node, skip: ReadonlySet<string>, panels: Set<string>, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push((node as TextNode).text); // .text decodes entities (&nbsp;, &amp;, …)
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() ?? "";
  if (skip.has(tag)) return;
  if (isHiddenText(el, panels)) return;
  const block = BLOCK_TAGS.has(tag);
  if (block) out.push("\n");
  for (const child of el.childNodes) collectText(child, skip, panels, out);
  if (block) out.push("\n");
}

/**
 * Where mainText reads: `<main>` when present, otherwise `<body>` (or the
 * whole document), and the tags it skips there. Shared with the Agent View's
 * token breakdown (src/lib/markdown/anatomy.ts), so "your content" is the same text.
 */
export function mainTextScope(root: HTMLElement): { scope: HTMLElement; skip: ReadonlySet<string> } {
  const main = root.querySelector("main");
  return {
    scope: main ?? root.querySelector("body") ?? root,
    skip: main ? NON_CONTENT_TAGS : new Set([...NON_CONTENT_TAGS, ...CHROME_TAGS]),
  };
}

/**
 * The page's main readable text: `<main>` when present, otherwise `<body>`
 * without header, nav and footer. Entities are decoded, whitespace is
 * collapsed, and each block element sits on its own line. Hidden elements are
 * skipped, except panels a toggle controls (collapsed FAQ answers).
 */
export function extractMainText(root: HTMLElement): string {
  const { scope, skip } = mainTextScope(root);
  const out: string[] = [];
  collectText(scope, skip, controlledPanelIds(root), out);
  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, MAIN_TEXT_MAX_CHARS);
}

// Never text, wherever they appear. Unlike mainText, the body blocks keep nav,
// header, footer and hidden elements: P3 only asks whether text is in the HTML.
const NON_TEXT_TAGS = new Set(["script", "style", "noscript", "template", "svg", "iframe"]);

/**
 * Every text block in `<body>`, each with its nearest `data-component`, so P3
 * can say which component renders content only in the browser.
 */
export function extractBodyBlocks(root: HTMLElement): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  let buffer = "";
  let bufferComponent: string | null = null;
  let total = 0;

  const flush = () => {
    const text = buffer.replace(/\s+/g, " ").trim();
    if (text && total < BODY_TEXT_MAX_CHARS) {
      blocks.push({ text, component: bufferComponent });
      total += text.length;
    }
    buffer = "";
    bufferComponent = null;
  };

  const walk = (node: Node, component: string | null) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = (node as TextNode).text;
      if (!buffer.trim() && text.trim()) bufferComponent = component;
      buffer += text;
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.rawTagName?.toLowerCase() ?? "";
    if (NON_TEXT_TAGS.has(tag)) return;
    // Field and layout wrappers ("helpers/fieldwrappers/richtextwrapper",
    // "generic-wrappers/section-wrapper") sit inside every component, so the
    // block keeps the component around them.
    const marked = el.getAttribute("data-component");
    const own = marked && !/wrapper/i.test(marked) ? marked : component;
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    for (const child of el.childNodes) walk(child, own);
    if (block) flush();
  };

  walk(root.querySelector("body") ?? root, null);
  flush();
  return blocks;
}

const looksLikeQuestion = (s: string) => s.endsWith("?") || QUESTION_REGEX.test(s);

/**
 * Question/answer pairs in any component: an accordion toggle
 * (`[aria-controls]` + `aria-expanded`) whose controlled panel holds the
 * answer, or a `<details>` whose `<summary>` is the question. Only toggles
 * that read as a question count, so menus and "Expand all" are skipped.
 */
export function extractQaPairs(root: HTMLElement): QaPair[] {
  const pairs: QaPair[] = [];
  const seen = new Set<string>();
  const add = (question: string, answer: string) => {
    if (!question || !answer || !looksLikeQuestion(question) || seen.has(question)) return;
    seen.add(question);
    pairs.push({ question, answer });
  };

  for (const toggle of root.querySelectorAll("[aria-controls][aria-expanded]")) {
    const ids = (toggle.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean);
    const panels = ids.map((id) => root.getElementById(id)).filter((p): p is HTMLElement => p !== null);
    add(plainText(toggle), panels.map(plainText).join(" ").trim());
  }

  for (const details of root.querySelectorAll("details")) {
    const summary = details.querySelector("summary");
    if (!summary) continue;
    const question = plainText(summary);
    add(question, plainText(details).slice(question.length).trim());
  }

  return pairs;
}

/**
 * Unwrap the Next.js image optimizer URL (`/_next/image?url=<encoded>`) to the
 * original asset URL so the value is human-readable in fix suggestions.
 */
function resolveImgSrc(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw, "http://_");
    const wrapped = u.searchParams.get("url");
    return wrapped ? decodeURIComponent(wrapped) : raw;
  } catch {
    return raw;
  }
}

export function extractParsedHtml(html: string): ParsedHtml {
  const root = parse(html);

  const headingNodes = root.querySelectorAll("h1,h2,h3,h4");
  // Empty headings (`<h3>&nbsp;</h3>`) aren't headings to a reader or an agent.
  const headings = headingNodes
    .map((h) => ({ level: parseInt(h.tagName.substring(1), 10), text: plainText(h) }))
    .filter((h) => h.text.length > 0);

  const images = root.querySelectorAll("img").map((img) => ({
    src: resolveImgSrc(img.getAttribute("src") ?? ""),
    alt: img.getAttribute("alt") ?? null,
  }));

  // Anchor-text quality and reading grade are about content, so scope to <main>
  // and exclude nav/header/footer chrome. Falls back to the whole document if
  // there is no <main>.
  const contentScope = root.querySelector("main") ?? root;
  const links = contentScope.querySelectorAll("a").map((a) => ({
    anchorText: plainText(a) || null,
    href: a.getAttribute("href") ?? null,
  }));

  const paragraphs = contentScope
    .querySelectorAll("p")
    .map(plainText)
    .filter((t) => t.length > 0);

  const mainText = extractMainText(root);
  const bodyBlocks = extractBodyBlocks(root);

  const titleEl = root.querySelector("title");
  const title = (titleEl && plainText(titleEl)) || null;
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;

  const lastModifiedMeta = root.querySelector('meta[name="last-modified"]')?.getAttribute("content") ?? null;
  const articleModifiedTimeMeta = root.querySelector('meta[property="article:modified_time"]')?.getAttribute("content") ?? null;

  const canonicalHref = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
  const robotsMeta = root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
  const googlebotMeta = root.querySelector('meta[name="googlebot"]')?.getAttribute("content") ?? null;

  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null;
  const ogDescription = root.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? null;
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
  const ogType = root.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? null;

  const htmlLang = root.querySelector("html")?.getAttribute("lang")?.trim() || null;
  const metaAuthor = root.querySelector('meta[name="author"]')?.getAttribute("content")?.trim() || null;
  const relAuthorHref = root.querySelector('[rel~="author"][href]')?.getAttribute("href") ?? null;

  // Kept raw (parsed or with the parse error); src/lib/checks/json-ld.ts reads
  // @graph bundles, @type arrays and subtypes from it.
  const jsonLdScripts = root
    .querySelectorAll('script[type="application/ld+json"]')
    .map((script) => parseJsonLdScript(script.text));

  const qaPairs = extractQaPairs(root);

  const hasMain = root.querySelector("main") !== null;
  const hasArticle = root.querySelector("article") !== null;
  const hasNav = root.querySelector("nav") !== null;
  const hasHeader = root.querySelector("header") !== null;

  let interactiveElementsMissingLabel = 0;
  for (const el of root.querySelectorAll("button,a")) {
    const text = plainText(el);
    const ariaLabel = el.getAttribute("aria-label");
    if (!text && !ariaLabel) {
      interactiveElementsMissingLabel++;
    }
  }

  return {
    title,
    metaDescription,
    lastModifiedMeta,
    articleModifiedTimeMeta,
    headings,
    images,
    links,
    paragraphs,
    mainText,
    bodyBlocks,
    htmlLang,
    canonicalHref,
    robotsMeta,
    googlebotMeta,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    metaAuthor,
    relAuthorHref,
    jsonLdScripts,
    qaPairs,
    hasMain,
    hasArticle,
    hasNav,
    hasHeader,
    interactiveElementsMissingLabel,
  };
}

/**
 * Detect visible corporate-identity signals in the page footer — the rendered-text
 * counterpart to Organization schema. Scopes to the <footer> element (falls back to
 * the whole document when there is none) and uses regex/href heuristics, so results
 * are best-effort: the address check in particular will miss spelled-out or non-US
 * formats. Surface it as "detected", not a guarantee.
 */
export function extractFooterTrust(html: string): FooterTrust {
  const root = parse(html);
  const footer = root.querySelector("footer") ?? root;

  const hrefs = footer
    .querySelectorAll("a")
    .map((a) => (a.getAttribute("href") ?? "").toLowerCase());
  const hasLink = (re: RegExp) => hrefs.some((h) => re.test(h));

  const text = footer.innerText.replace(/\s+/g, " ").trim();
  // US ZIP (12345 / 12345-6789) or a "City, CC" / "City, ST" pair.
  const hasAddress =
    /\b\d{5}(-\d{4})?\b/.test(text) || /\b[A-Z][a-zA-Z.'-]+,\s*[A-Z]{2,}\b/.test(text);

  return {
    hasAddress,
    hasContact: hasLink(/\/contact/),
    hasPrivacy: hasLink(/\/privacy/),
    hasTerms: hasLink(/\/(terms|tos)\b/),
    hasSecurity: hasLink(/\/(security|trust)\b/),
    hasAbout: hasLink(/\/about/),
  };
}
