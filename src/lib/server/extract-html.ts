import { parse, NodeType, type HTMLElement, type Node, type TextNode } from "node-html-parser";
import type { FooterTrust, ParsedHtml } from "@/lib/rule-engine/types";

/** Upper bound on `mainText`, so a very long page doesn't bloat the JSON response. */
export const MAIN_TEXT_MAX_CHARS = 20_000;

// Never content, wherever they appear.
const NON_CONTENT_TAGS = new Set(["script", "style", "noscript", "template", "svg", "iframe", "nav"]);
// Site chrome. Skipped only when there is no <main>: inside <main>, a <header>
// or <footer> usually belongs to an article (title, byline, date).
const CHROME_TAGS = new Set(["header", "footer"]);
// Elements that start a new line, so adjacent blocks don't run together.
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "details", "div", "dl", "dt",
  "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "main", "ol",
  "p", "pre", "section", "summary", "table", "td", "th", "tr", "ul",
]);

function collectText(node: Node, skip: Set<string>, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push((node as TextNode).text); // .text decodes entities (&nbsp;, &amp;, …)
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase() ?? "";
  if (skip.has(tag)) return;
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return;
  const block = BLOCK_TAGS.has(tag);
  if (block) out.push("\n");
  for (const child of el.childNodes) collectText(child, skip, out);
  if (block) out.push("\n");
}

/**
 * The page's main readable text: `<main>` when present, otherwise `<body>`
 * without header, nav and footer. Entities are decoded, whitespace is
 * collapsed, and each block element sits on its own line.
 */
export function extractMainText(root: HTMLElement): string {
  const main = root.querySelector("main");
  const scope = main ?? root.querySelector("body") ?? root;
  const skip = main ? NON_CONTENT_TAGS : new Set([...NON_CONTENT_TAGS, ...CHROME_TAGS]);
  const out: string[] = [];
  collectText(scope, skip, out);
  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, MAIN_TEXT_MAX_CHARS);
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
  const headings = headingNodes.map((h) => ({
    level: parseInt(h.tagName.substring(1), 10),
    text: h.innerText.trim(),
  }));

  const images = root.querySelectorAll("img").map((img) => ({
    src: resolveImgSrc(img.getAttribute("src") ?? ""),
    alt: img.getAttribute("alt") ?? null,
  }));

  // Anchor-text quality and reading grade are about content, so scope to <main>
  // and exclude nav/header/footer chrome. Falls back to the whole document if
  // there is no <main>.
  const contentScope = root.querySelector("main") ?? root;
  const links = contentScope.querySelectorAll("a").map((a) => ({
    anchorText: a.innerText.replace(/\s+/g, " ").trim() || null,
    href: a.getAttribute("href") ?? null,
  }));

  const paragraphs = contentScope
    .querySelectorAll("p")
    .map((p) => p.innerText.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);

  const mainText = extractMainText(root);

  const title = root.querySelector("title")?.innerText.trim() || null;
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;

  const lastModifiedMeta = root.querySelector('meta[name="last-modified"]')?.getAttribute("content") ?? null;
  const articleModifiedTimeMeta = root.querySelector('meta[property="article:modified_time"]')?.getAttribute("content") ?? null;

  const canonicalHref = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
  const robotsMeta = root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
  const googlebotMeta = root.querySelector('meta[name="googlebot"]')?.getAttribute("content") ?? null;

  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null;
  const ogDescription = root.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? null;
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

  const jsonLdBlocks: ParsedHtml["jsonLdBlocks"] = [];
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw = JSON.parse(script.text);
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          const type = typeof entry?.["@type"] === "string" ? entry["@type"] : String(entry?.["@type"] ?? "");
          if (type) jsonLdBlocks.push({ type, raw: entry });
        }
      } else if (raw && typeof raw === "object") {
        const type = typeof raw["@type"] === "string" ? raw["@type"] : String(raw["@type"] ?? "");
        if (type) jsonLdBlocks.push({ type, raw });
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  }

  const hasMain = root.querySelector("main") !== null;
  const hasArticle = root.querySelector("article") !== null;
  const hasNav = root.querySelector("nav") !== null;
  const hasHeader = root.querySelector("header") !== null;

  let interactiveElementsMissingLabel = 0;
  for (const el of root.querySelectorAll("button,a")) {
    const text = el.innerText.trim();
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
    canonicalHref,
    robotsMeta,
    googlebotMeta,
    ogTitle,
    ogDescription,
    ogImage,
    jsonLdBlocks,
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
