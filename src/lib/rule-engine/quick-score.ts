import type { AuthoringFields } from "./types";
import {
  checkMetaTitle,
  checkMetaDescription,
  checkFaqAnswerQuality,
  checkQuestionHeadings,
  checkAuthor,
  checkFreshness,
} from "./engine";

// Image alt text and reading grade are intentionally excluded here: they read
// from the rendered HTML, which the site-wide dashboard scan does not fetch
// per page.
//
// NOTE: the guide's spec says maxTotal: 61, but the scored checks here
// sum to 8+8+5+6+5 = 32. Kept maxTotal at 61 per spec; expect the "good"
// label (> 45) to be unreachable until either the threshold or the maxTotal
// is reconciled. Adjust here once decided.
export interface QuickScoreResult {
  total: number;          // 0–61 (sum of the fast authoring checks; actual max is 32)
  maxTotal: number;       // always 61 per spec
  seo: number;            // 0–16 (meta title 8 + meta desc 8)
  aeo: number;            // 0–5  (faq answer quality 5)
  contentQuality: number; // 0–11 (author 6 + freshness 5)
  label: "critical" | "warning" | "good";
  // critical: total < 25 | warning: 25–45 | good: > 45
}

const EMPTY_AUTHORING: AuthoringFields = {
  pageTitle: null,
  metaDescription: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  author: null,
  authorProfileLinked: false,
  publishDate: null,
  lastUpdatedDate: null,
  noIndexField: false,
  richTextParagraphs: [],
  richTextFull: "",
  images: [],
  links: [],
  headings: [],
  faqItems: [],
  hasFaqComponent: false,
  hasHowToComponent: false,
};

function zeroResult(): QuickScoreResult {
  return {
    total: 0,
    maxTotal: 61,
    seo: 0,
    aeo: 0,
    contentQuality: 0,
    label: "critical",
  };
}

function labelFor(total: number): QuickScoreResult["label"] {
  if (total < 25) return "critical";
  if (total <= 45) return "warning";
  return "good";
}

export function quickScore(fields: Partial<AuthoringFields>): QuickScoreResult {
  try {
    const merged: AuthoringFields = { ...EMPTY_AUTHORING, ...fields };

    // SEO bucket (image alt excluded — needs rendered HTML, see note above)
    const seo =
      checkMetaTitle(merged).score +
      checkMetaDescription(merged).score;

    // AEO bucket
    const aeo = checkFaqAnswerQuality(merged).score;
    // Question headings is info-only
    checkQuestionHeadings(merged);

    // Content quality bucket (reading grade excluded — needs rendered HTML, see note above)
    const contentQuality =
      checkAuthor(merged).score +
      checkFreshness(merged).score;

    const total = seo + aeo + contentQuality;

    return {
      total,
      maxTotal: 61,
      seo,
      aeo,
      contentQuality,
      label: labelFor(total),
    };
  } catch {
    return zeroResult();
  }
}

export function scoreColor(label: QuickScoreResult["label"]): string {
  switch (label) {
    case "critical":
      return "text-red-600";
    case "warning":
      return "text-amber-600";
    case "good":
      return "text-green-600";
  }
}

export function scoreBgColor(label: QuickScoreResult["label"]): string {
  switch (label) {
    case "critical":
      return "bg-red-50 text-red-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "good":
      return "bg-green-50 text-green-700";
  }
}
