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
}

export interface SiteScorePillars {
  crawlability: number;      // 0-15
  structured: number;        // 0-20
  answerability: number;     // 0-20
  authority: number;         // 0-25
  retrievability: number;    // 0-20
}

export interface SiteScoreResult {
  total: number;             // 0-100
  maxTotal: 100;
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

function labelFor(total: number): SiteScoreResult["label"] {
  if (total < 40) return "critical";
  if (total <= 70) return "warning";
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

function scoreStructured(html: ParsedHtml): number {
  let score = 0;
  if (hasJsonLdType(html, ["FAQPage"])) score += 8;
  if (hasJsonLdType(html, ["Article", "NewsArticle", "BlogPosting"])) score += 6;
  if (hasJsonLdType(html, ["BreadcrumbList"])) score += 3;
  if (hasJsonLdType(html, ["Organization"])) score += 3;
  return Math.min(score, MAX_PILLARS.structured);
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

  // Freshness from updatedAt (8 pts)
  if (updatedAt) {
    const d = new Date(updatedAt);
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
  const { parsedHtml, robotsTxt, ai, updatedAt, pageUrl } = input;

  if (!parsedHtml) {
    return {
      total: 0,
      maxTotal: 100,
      pillars: { crawlability: 0, structured: 0, answerability: 0, authority: 0, retrievability: 0 },
      maxPillars: MAX_PILLARS,
      label: "critical",
    };
  }

  const pillars: SiteScorePillars = {
    crawlability: scoreCrawlability(parsedHtml, robotsTxt, pageUrl),
    structured: scoreStructured(parsedHtml),
    answerability: scoreAnswerability(parsedHtml),
    authority: scoreAuthority(parsedHtml, ai, updatedAt),
    retrievability: scoreRetrievability(parsedHtml),
  };

  const total =
    pillars.crawlability +
    pillars.structured +
    pillars.answerability +
    pillars.authority +
    pillars.retrievability;

  return {
    total,
    maxTotal: 100,
    pillars,
    maxPillars: MAX_PILLARS,
    label: labelFor(total),
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
