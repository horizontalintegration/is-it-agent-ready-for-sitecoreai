import { parse } from "node-html-parser";
import type { ParsedHtml } from "@/lib/rule-engine/types";

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

  const title = root.querySelector("title")?.innerText.trim() || null;
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;

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
    headings,
    images,
    links,
    paragraphs,
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

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
