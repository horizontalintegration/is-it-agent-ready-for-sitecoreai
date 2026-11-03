// ─────────────────────────────────────────────────────────────────────────────
// The local Markdown preview (plan Phase 7): what a page could send an agent,
// converted here with node-html-markdown. The panel converts the Page Builder
// draft; /api/markdown-check converts the published HTML when the site
// doesn't serve Markdown. Runs in the browser and on the server.
//
// Like a good Markdown endpoint, it keeps the main content (`<main>`, or the
// body without header, nav and footer), drops scripts and hidden elements
// (collapsed FAQ answers stay), and starts with YAML front matter.
// ─────────────────────────────────────────────────────────────────────────────

import { NodeHtmlMarkdown } from "node-html-markdown";
import { parse, type HTMLElement } from "node-html-parser";
import { controlledPanelIds } from "@/lib/html/extract-html";

/** Rough tokens for a text: about 4 characters each. Free and deterministic, so the dashboard can run it on every page. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const NEVER_CONTENT = "script, style, noscript, template, svg, iframe, link, meta";
const CHROME = "header, nav, footer";

export interface FrontMatterInput {
  /** Defaults to the HTML's <title>. */
  title?: string | null;
  /** Defaults to the HTML's meta description. */
  description?: string | null;
  url?: string | null;
}

/** A YAML scalar: plain when that's safe, otherwise double-quoted (JSON strings are valid YAML). */
function yamlValue(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return "";
  // Plain unless YAML would read it differently: ": " or " #" inside, or a trailing ":".
  return /^[\p{L}\p{N}]/u.test(v) && !/:\s|\s#|:$|["'\n]/.test(v) ? v : JSON.stringify(v);
}

/** `---` front matter with title, description and url, each line present even when empty. */
export function frontMatter({ title, description, url }: FrontMatterInput): string {
  const line = (key: string, value: string | null | undefined) => `${key}:${value?.trim() ? ` ${yamlValue(value)}` : ""}`;
  return ["---", line("title", title), line("description", description), line("url", url), "---", ""].join("\n");
}

/** Absolute links and image sources, so the Markdown works outside the site. */
function absolutise(scope: HTMLElement, baseUrl: string | null | undefined) {
  if (!baseUrl) return;
  for (const [selector, attr] of [["a[href]", "href"], ["img[src]", "src"]] as const) {
    for (const el of scope.querySelectorAll(selector)) {
      const value = el.getAttribute(attr) ?? "";
      if (!value || value.startsWith("#") || /^(data|javascript|mailto|tel):/i.test(value)) continue;
      try {
        el.setAttribute(attr, new URL(value, baseUrl).href);
      } catch {
        // leave it as it is
      }
    }
  }
}

/**
 * The page's main content as Markdown, with front matter. `meta` fields left
 * undefined come from the HTML's head; the draft has none, so the panel
 * passes the Sitecore fields.
 */
export function toAgentMarkdown(html: string, meta: FrontMatterInput = {}): string {
  const root = parse(html);
  const title = meta.title !== undefined ? meta.title : (root.querySelector("title")?.text.trim() ?? null);
  const description =
    meta.description !== undefined ? meta.description : (root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null);

  const main = root.querySelector("main");
  const scope = main ?? root.querySelector("body") ?? root;
  const panels = controlledPanelIds(root);
  const drop = main ? NEVER_CONTENT : `${NEVER_CONTENT}, ${CHROME}`;
  for (const el of scope.querySelectorAll(drop)) el.remove();
  for (const el of scope.querySelectorAll("[hidden], [aria-hidden='true']")) {
    if (!panels.has(el.id)) el.remove();
  }
  absolutise(scope, meta.url);

  const body = NodeHtmlMarkdown.translate(scope.innerHTML, { bulletMarker: "-", maxConsecutiveNewlines: 2 }).trim();
  return `${frontMatter({ title, description, url: meta.url })}\n${body}\n`;
}
