import type { PageMatrixRow } from "@/types/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Pure llms.txt builder
//
// Produces a spec-compliant /llms.txt document (https://llmstxt.org) from the
// enumerated site pages. This is intentionally decoupled from the metrics scan:
// it needs only the page list plus the Title / Meta Description fields captured
// at enumeration time. The health score is an *optional* filter, not a
// precondition — pages with no score are always kept.
//
// Spec shape:
//   # Title
//   > one-line summary (blockquote)
//   ## Section
//   - [label](url): description
//   ## Optional        ← secondary links an LLM may skip
// ─────────────────────────────────────────────────────────────────────────────

/** Utility/boilerplate routes that belong in the standard `## Optional` section. */
const UTILITY_PATHS = ["/contact", "/privacy", "/terms", "/404", "/sitemap"];

export interface LlmsTxtOptions {
  siteDomain: string;
  siteName: string;
  /** Blockquote summary line shown under the title. */
  tagline: string;
  /** Append the page's meta description as the link summary. */
  includeDescriptions: boolean;
  includeBlog: boolean;
  includeProducts: boolean;
  /** Emit the `## Optional` section for utility pages. */
  includeUtility: boolean;
  /**
   * When a finite number, exclude pages whose `score.total` is below it.
   * `null` disables score filtering entirely. Pages with no score (unscanned)
   * are always kept regardless of this value.
   */
  scoreThreshold: number | null;
}

export interface LlmsTxtResult {
  content: string;
  includedCount: number;
  excludedCount: number;
}

type Section = "core" | "blog" | "products" | "optional";

function isBlogPath(path: string): boolean {
  return path.startsWith("/blog");
}

function isProductsPath(path: string): boolean {
  return path.startsWith("/products") || path.startsWith("/solutions");
}

function isUtilityPath(path: string): boolean {
  return UTILITY_PATHS.some((p) => path.startsWith(p));
}

function sectionFor(route: string): Section {
  if (isBlogPath(route)) return "blog";
  if (isProductsPath(route)) return "products";
  if (isUtilityPath(route)) return "optional";
  return "core";
}

/** True when the page clears the (optional) score gate. */
function passesScore(page: PageMatrixRow, threshold: number | null): boolean {
  if (threshold == null) return true;
  if (page.score == null) return true; // unscanned pages are never penalised
  return page.score.total >= threshold;
}

/** True when the page's section is enabled in the options. */
function sectionEnabled(section: Section, opts: LlmsTxtOptions): boolean {
  switch (section) {
    case "blog":
      return opts.includeBlog;
    case "products":
      return opts.includeProducts;
    case "optional":
      return opts.includeUtility;
    case "core":
      return true;
  }
}

export function buildLlmsTxt(pages: PageMatrixRow[], opts: LlmsTxtOptions): LlmsTxtResult {
  const cleanDomain = opts.siteDomain.replace(/\/+$/, "");

  const buckets: Record<Section, PageMatrixRow[]> = {
    core: [],
    blog: [],
    products: [],
    optional: [],
  };

  let includedCount = 0;
  for (const page of pages) {
    const section = sectionFor(page.route);
    if (!passesScore(page, opts.scoreThreshold) || !sectionEnabled(section, opts)) {
      continue;
    }
    buckets[section].push(page);
    includedCount++;
  }

  // Within each section, surface the healthiest pages first when scores exist.
  const byScoreDesc = (a: PageMatrixRow, b: PageMatrixRow) =>
    (b.score?.total ?? -1) - (a.score?.total ?? -1);
  for (const key of Object.keys(buckets) as Section[]) {
    buckets[key].sort(byScoreDesc);
  }

  const formatPage = (p: PageMatrixRow): string => {
    const label = p.metaTitle?.trim() || p.name;
    const url = `${cleanDomain}${p.route}`;
    const description = opts.includeDescriptions ? p.metaDescription?.trim() : undefined;
    return description ? `- [${label}](${url}): ${description}` : `- [${label}](${url})`;
  };

  const lines: string[] = [];
  lines.push(`# ${opts.siteName || "Site"}`);
  lines.push("");
  if (opts.tagline.trim()) {
    lines.push(`> ${opts.tagline.trim()}`);
    lines.push("");
  }

  const emitSection = (heading: string, rows: PageMatrixRow[]) => {
    if (rows.length === 0) return;
    lines.push(`## ${heading}`);
    rows.forEach((p) => lines.push(formatPage(p)));
    lines.push("");
  };

  emitSection("Core pages", buckets.core);
  emitSection("Blog", buckets.blog);
  emitSection("Products", buckets.products);
  // Per the spec, `## Optional` is the canonical name for skippable secondary links.
  emitSection("Optional", buckets.optional);

  // Trim the trailing blank line so the document ends on content.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return {
    content: lines.join("\n"),
    includedCount,
    excludedCount: pages.length - includedCount,
  };
}
