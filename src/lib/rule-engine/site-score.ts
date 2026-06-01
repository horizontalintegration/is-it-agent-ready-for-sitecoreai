// ─────────────────────────────────────────────────────────────────────────────
// AI Search Discovery score — dashboard-only scoring (one entry per page).
// Runs purely from rendered HTML + robots.txt + AI uniqueness rating, with
// `updatedAt` supplied separately by the page enumeration step.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ParsedHtml,
  RobotsTxt,
  AiResults,
} from "./types";
import {
  ari,
  wordCount,
  isGenericAnchor,
  QUESTION_REGEX,
  daysSince,
  normaliseUrl,
} from "./helpers";

export interface SiteScoreInput {
  parsedHtml: ParsedHtml | null;
  robotsTxt: RobotsTxt | null;
  ai: AiResults | null;
  updatedAt: string | null; // ISO timestamp from xmc.pages.search
  pageUrl: string;
  /** True for the site's Home page (route "/") — gates Organization vs BreadcrumbList. */
  isHomePage: boolean;
  /** Sitecore template ID (with or without braces). Gates the Article-schema check. */
  templateId: string | null;
}

// Articles use this template (Sitecore item template ID).
// Only pages of this template are checked for Article/NewsArticle/BlogPosting schema.
const ARTICLE_TEMPLATE_ID = "375dcaaa-f94c-42ce-b2ab-3fb1d8871fd9";

function normaliseTemplateId(id: string | null | undefined): string {
  if (!id) return "";
  return id.toLowerCase().replace(/[{}]/g, "");
}

export interface SiteScorePillars {
  crawlability: number;      // 0-15
  structured: number;        // 0-20
  answerability: number;     // 0-20
  authority: number;         // 0-25
  retrievability: number;    // 0-20
}

export interface SiteScoreResult {
  total: number;             // sum of pillar scores
  maxTotal: number;          // sum of pillar maxes — varies per page (Structured is conditional)
  pillars: SiteScorePillars;
  maxPillars: SiteScorePillars;
  label: "critical" | "warning" | "good";
}

const MAX_PILLARS: SiteScorePillars = {
  crawlability: 15,
  structured: 20,
  answerability: 20,
  authority: 25,
  retrievability: 20,
};

function labelFor(total: number, maxTotal: number): SiteScoreResult["label"] {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  if (pct < 40) return "critical";
  if (pct <= 70) return "warning";
  return "good";
}

// ── Crawlability (15) ────────────────────────────────────────────────────────

function scoreCrawlability(html: ParsedHtml, robots: RobotsTxt | null, pageUrl: string): number {
  let score = 0;

  // AI crawler permissions in robots.txt (6 pts)
  // Pass if at least 5 of 6 named crawlers are allowed (or unknown — i.e. no explicit block).
  if (robots) {
    const crawlers = [
      robots.googleExtended,
      robots.gptBot,
      robots.claudeBot,
      robots.perplexityBot,
      robots.amazonBot,
      robots.appleBotExtended,
    ];
    const blocked = crawlers.filter((c) => c === "blocked").length;
    if (blocked === 0) score += 6;
    else if (blocked <= 2) score += 3;
  } else {
    // No robots data → assume neutral (allowed)
    score += 3;
  }

  // Canonical URL present + matches page URL (5 pts)
  if (html.canonicalHref) {
    if (normaliseUrl(html.canonicalHref) === normaliseUrl(pageUrl)) score += 5;
    else score += 2;
  }

  // Robots meta not noindex/nosnippet (4 pts)
  const robotsMeta = (html.robotsMeta ?? "").toLowerCase();
  const googlebotMeta = (html.googlebotMeta ?? "").toLowerCase();
  const blockers = ["noindex", "nosnippet", "noimageindex", "none"];
  const hasBlocker = blockers.some((b) => robotsMeta.includes(b) || googlebotMeta.includes(b));
  if (!hasBlocker) score += 4;

  return Math.min(score, MAX_PILLARS.crawlability);
}

// ── Structured (20) ──────────────────────────────────────────────────────────

function hasJsonLdType(html: ParsedHtml, types: string[]): boolean {
  const wanted = types.map((t) => t.toLowerCase());
  return html.jsonLdBlocks.some((b) => wanted.includes((b.type ?? "").toLowerCase()));
}

/**
 * Structured-data score with per-page applicability:
 *   - FAQPage   — only when the page has FAQ-like content (≥2 question-style H2s)
 *   - Article   — only when the page template matches ARTICLE_TEMPLATE_ID
 *   - Breadcrumb — only on non-home pages
 *   - Organization — only on the home page
 *
 * Returns both the earned score and the max points actually checked, so pages
 * aren't penalised for missing schemas that don't apply to them.
 */
function scoreStructured(
  html: ParsedHtml,
  isHomePage: boolean,
  templateId: string | null,
): { score: number; max: number } {
  let score = 0;
  let max = 0;

  // FAQPage (8 pts) — only when page exhibits FAQ content (heuristic: 2+ question H2s)
  const questionH2s = html.headings.filter(
    (h) => h.level === 2 && QUESTION_REGEX.test(h.text.trim()),
  ).length;
  if (questionH2s >= 2) {
    max += 8;
    if (hasJsonLdType(html, ["FAQPage"])) score += 8;
  }

  // Article (6 pts) — only when the page uses the Article template
  if (normaliseTemplateId(templateId) === ARTICLE_TEMPLATE_ID) {
    max += 6;
    if (hasJsonLdType(html, ["Article", "NewsArticle", "BlogPosting"])) score += 6;
  }

  // BreadcrumbList (3 pts) — required everywhere except the home page
  if (!isHomePage) {
    max += 3;
    if (hasJsonLdType(html, ["BreadcrumbList"])) score += 3;
  }

  // Organization (3 pts) — only on the home page (site-wide entity declaration)
  if (isHomePage) {
    max += 3;
    if (hasJsonLdType(html, ["Organization"])) score += 3;
  }

  return { score, max };
}

// ── Answerability (20) ───────────────────────────────────────────────────────

function scoreAnswerability(html: ParsedHtml): number {
  let score = 0;

  // H1 count = 1 + no hierarchy skips (6 pts)
  const h1Count = html.headings.filter((h) => h.level === 1).length;
  let lastLevel = 0;
  let skipDetected = false;
  for (const h of html.headings) {
    if (lastLevel > 0 && h.level > lastLevel + 1) skipDetected = true;
    lastLevel = h.level;
  }
  if (h1Count === 1 && !skipDetected) score += 6;
  else if (h1Count === 1 || !skipDetected) score += 3;

  // Question-style H2 count ≥ 3 (6 pts)
  const questionH2s = html.headings.filter(
    (h) => h.level === 2 && QUESTION_REGEX.test(h.text.trim()),
  ).length;
  if (questionH2s >= 3) score += 6;
  else if (questionH2s >= 1) score += 3;

  // Reading grade ≤ 13 for the body as a whole (4 pts)
  if (html.paragraphs.length > 0) {
    const body = html.paragraphs.join(" ");
    const grade = ari(body);
    if (grade > 0 && grade <= 13) score += 4;
    else if (grade > 0 && grade <= 16) score += 2;
  }

  // Avg paragraph length 40–120 words (4 pts)
  if (html.paragraphs.length > 0) {
    const counts = html.paragraphs.map(wordCount);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg >= 40 && avg <= 120) score += 4;
    else if (avg >= 20 && avg <= 200) score += 2;
  }

  return Math.min(score, MAX_PILLARS.answerability);
}

// ── Authority (25) ───────────────────────────────────────────────────────────

function scoreAuthority(html: ParsedHtml, ai: AiResults | null, updatedAt: string | null): number {
  let score = 0;

  // AI uniqueness rating (15 pts)
  if (ai) {
    if (ai.uniquenessRating === "unique") score += 15;
    else if (ai.uniquenessRating === "borderline") score += 8;
    // commodity → 0
  }
  // If AI hasn't been evaluated, neither pass nor fail — leave 0.

  // Freshness (8 pts). Prefer rendered-HTML meta tags (what AI bots actually read);
  // fall back to Sitecore's __Updated when neither meta tag is present.
  //   1. <meta property="article:modified_time">  (OpenGraph standard)
  //   2. <meta name="last-modified">              (custom but common)
  //   3. updatedAt (Sitecore __Updated field)     (admin/template edits)
  const freshnessSource =
    html.articleModifiedTimeMeta ?? html.lastModifiedMeta ?? updatedAt;
  if (freshnessSource) {
    const d = new Date(freshnessSource);
    if (!isNaN(d.getTime())) {
      const age = daysSince(d);
      if (age <= 180) score += 8;
      else if (age <= 365) score += 5;
      else if (age <= 730) score += 2;
    }
  }

  // Internal anchor descriptive (2 pts) — pass if generic anchors are ≤ 20% of links
  if (html.links.length > 0) {
    const generic = html.links.filter((l) => isGenericAnchor(l.anchorText)).length;
    const ratio = generic / html.links.length;
    if (ratio <= 0.2) score += 2;
    else if (ratio <= 0.4) score += 1;
  } else {
    score += 1; // no links to judge
  }

  return Math.min(score, MAX_PILLARS.authority);
}

// ── Retrievability (20) ──────────────────────────────────────────────────────

function scoreRetrievability(html: ParsedHtml): number {
  let score = 0;

  // <title> 30–60 chars (6 pts)
  if (html.title) {
    const len = html.title.length;
    if (len >= 30 && len <= 60) score += 6;
    else if (len >= 20 && len <= 80) score += 3;
  }

  // Meta description 120–160 chars (6 pts)
  if (html.metaDescription) {
    const len = html.metaDescription.length;
    if (len >= 120 && len <= 160) score += 6;
    else if (len >= 70 && len <= 200) score += 3;
  }

  // OG tags complete (3 pts)
  const ogCount = [html.ogTitle, html.ogDescription, html.ogImage].filter(Boolean).length;
  if (ogCount === 3) score += 3;
  else if (ogCount === 2) score += 2;
  else if (ogCount === 1) score += 1;

  // Semantic landmarks (3 pts)
  const landmarks = [html.hasMain, html.hasArticle, html.hasNav, html.hasHeader].filter(Boolean).length;
  if (landmarks >= 3) score += 3;
  else if (landmarks >= 2) score += 2;
  else if (landmarks >= 1) score += 1;

  // Image alt coverage (2 pts)
  if (html.images.length > 0) {
    const withAlt = html.images.filter((i) => i.alt && i.alt.trim().length > 0).length;
    const ratio = withAlt / html.images.length;
    if (ratio >= 0.9) score += 2;
    else if (ratio >= 0.6) score += 1;
  } else {
    score += 1; // no images → partial credit
  }

  return Math.min(score, MAX_PILLARS.retrievability);
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function runSiteScore(input: SiteScoreInput): SiteScoreResult {
  const {
    parsedHtml,
    robotsTxt,
    ai,
    updatedAt,
    pageUrl,
    isHomePage,
    templateId,
  } = input;

  if (!parsedHtml) {
    return {
      total: 0,
      maxTotal: 100,
      pillars: { crawlability: 0, structured: 0, answerability: 0, authority: 0, retrievability: 0 },
      maxPillars: MAX_PILLARS,
      label: "critical",
    };
  }

  const structured = scoreStructured(parsedHtml, isHomePage, templateId);

  const pillars: SiteScorePillars = {
    crawlability: scoreCrawlability(parsedHtml, robotsTxt, pageUrl),
    structured: structured.score,
    answerability: scoreAnswerability(parsedHtml),
    authority: scoreAuthority(parsedHtml, ai, updatedAt),
    retrievability: scoreRetrievability(parsedHtml),
  };

  // Structured pillar's max varies per page (between 0 and 20) depending on
  // which schema checks applied. Other pillars use the fixed defaults.
  const maxPillars: SiteScorePillars = {
    ...MAX_PILLARS,
    structured: structured.max,
  };

  const total =
    pillars.crawlability +
    pillars.structured +
    pillars.answerability +
    pillars.authority +
    pillars.retrievability;

  const maxTotal =
    maxPillars.crawlability +
    maxPillars.structured +
    maxPillars.answerability +
    maxPillars.authority +
    maxPillars.retrievability;

  return {
    total,
    maxTotal,
    pillars,
    maxPillars,
    label: labelFor(total, maxTotal),
  };
}

export function scoreLabelColor(label: SiteScoreResult["label"]): string {
  switch (label) {
    case "critical": return "text-red-600";
    case "warning":  return "text-amber-600";
    case "good":     return "text-green-600";
  }
}

export function scoreLabelBgColor(label: SiteScoreResult["label"]): string {
  switch (label) {
    case "critical": return "bg-red-50 text-red-700";
    case "warning":  return "bg-amber-50 text-amber-700";
    case "good":     return "bg-green-50 text-green-700";
  }
}
