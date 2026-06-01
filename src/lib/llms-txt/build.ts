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
// Sections are derived automatically from the CMS content structure: a page's
// route mirrors its position in the Sitecore tree (".../Home/Blog/Post" → the
// "Blog" folder), so we group by the first route segment. Pages that sit
// directly under Home form the top-level "Main pages" section.
//
// Spec shape:
//   # Title
//   > one-line summary (blockquote)
//   ## Section
//   - [label](url): description
// ─────────────────────────────────────────────────────────────────────────────

const MAIN_SECTION = "Main pages";

export interface LlmsTxtOptions {
  siteDomain: string;
  siteName: string;
  /** Blockquote summary line shown under the title. */
  tagline: string;
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

/** Turn a route slug into a readable section heading: "case-studies" → "Case studies". */
function humanize(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (!spaced) return MAIN_SECTION;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Section heading for a page, from its CMS tree position. Pages directly under
 * Home (one or zero route segments) belong to "Main pages"; deeper pages group
 * by their first folder segment.
 */
function sectionFor(route: string): string {
  const segments = route.split("/").filter(Boolean);
  if (segments.length <= 1) return MAIN_SECTION;
  return humanize(segments[0]);
}

/** True when the page clears the (optional) score gate. */
function passesScore(page: PageMatrixRow, threshold: number | null): boolean {
  if (threshold == null) return true;
  if (page.score == null) return true; // unscanned pages are never penalised
  return page.score.total >= threshold;
}

export function buildLlmsTxt(pages: PageMatrixRow[], opts: LlmsTxtOptions): LlmsTxtResult {
  const cleanDomain = opts.siteDomain.replace(/\/+$/, "");

  // Group into sections by CMS structure, preserving first-seen order.
  const sections = new Map<string, PageMatrixRow[]>();
  let includedCount = 0;
  for (const page of pages) {
    if (!passesScore(page, opts.scoreThreshold)) continue;
    const heading = sectionFor(page.route);
    const bucket = sections.get(heading) ?? [];
    bucket.push(page);
    sections.set(heading, bucket);
    includedCount++;
  }

  // Within each section, surface the healthiest pages first when scores exist.
  const byScoreDesc = (a: PageMatrixRow, b: PageMatrixRow) =>
    (b.score?.total ?? -1) - (a.score?.total ?? -1);
  for (const bucket of sections.values()) bucket.sort(byScoreDesc);

  // "Main pages" first, then the remaining sections alphabetically.
  const orderedHeadings = [...sections.keys()]
    .filter((h) => h !== MAIN_SECTION)
    .sort((a, b) => a.localeCompare(b));
  if (sections.has(MAIN_SECTION)) orderedHeadings.unshift(MAIN_SECTION);

  const formatPage = (p: PageMatrixRow): string => {
    const label = p.metaTitle?.trim() || p.name;
    const url = `${cleanDomain}${p.route}`;
    const description = p.metaDescription?.trim();
    return description ? `- [${label}](${url}): ${description}` : `- [${label}](${url})`;
  };

  const lines: string[] = [];
  lines.push(`# ${opts.siteName || "Site"}`);
  lines.push("");
  if (opts.tagline.trim()) {
    lines.push(`> ${opts.tagline.trim()}`);
    lines.push("");
  }

  for (const heading of orderedHeadings) {
    const rows = sections.get(heading) ?? [];
    if (rows.length === 0) continue;
    lines.push(`## ${heading}`);
    rows.forEach((p) => lines.push(formatPage(p)));
    lines.push("");
  }

  // Standard site-level resources. These two are near-universal on a Sitecore
  // site, so we point at them unconditionally. Per the spec, `## Optional` marks
  // links an agent may skip for a shorter context.
  lines.push("## Optional");
  lines.push(`- [Sitemap](${cleanDomain}/sitemap.xml): XML sitemap`);
  lines.push(`- [Robots](${cleanDomain}/robots.txt): Crawler access rules`);
  lines.push("");

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
