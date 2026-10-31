// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — no I/O, no side effects
// ─────────────────────────────────────────────────────────────────────────────

/** Strip HTML tags and collapse whitespace to plain text */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Count words in a plain-text string */
export function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

/** Count sentences in a plain-text string (ends with . ! ?) */
export function sentenceCount(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : 1;
}

/**
 * Automated Readability Index (ARI)
 * Formula: 4.71 × (chars/words) + 0.5 × (words/sentences) − 21.43
 * Returns approximate US grade level. Grade ≤ 13 is the target.
 */
export function ari(text: string): number {
  const chars = text.replace(/\s/g, "").length;
  const words = wordCount(text);
  const sentences = sentenceCount(text);
  if (words === 0 || sentences === 0) return 0;
  return 4.71 * (chars / words) + 0.5 * (words / sentences) - 21.43;
}

/** Anchor text blocklist — generic anchors that waste link equity */
export const ANCHOR_BLOCKLIST = new Set([
  "click here",
  "read more",
  "here",
  "learn more",
  "this",
  "link",
  "more",
  "details",
  "info",
  "see more",
  "view more",
  "view all",
  "see all",
  "find out more",
  "find out",
  "get started",
  "start now",
  "start here",
  "go",
  "next",
  "prev",
  "previous",
  "back",
  "continue",
  "continue reading",
  "keep reading",
  "read on",
  "see here",
  "check here",
  "check this",
  "check it out",
  "follow this link",
  "follow link",
  "visit here",
  "visit this",
  "download",
  "download now",
  "download here",
  "subscribe",
  "sign up",
  "register",
  "submit",
  "go here",
  "click",
  "tap here",
  "press here",
  "open",
  "open here",
]);

/** Normalise anchor text before matching — strip trailing punctuation, arrows, and icon characters */
function normaliseAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s ]+/g, " ")        // collapse whitespace incl. &nbsp;
    .replace(/[→←↑↓►◄»«>|]+$/g, "")    // strip trailing arrow/chevron chars
    .replace(/[.!?,;:]+$/g, "")          // strip trailing punctuation
    .trim();
}

/** Returns true if anchor text is generic / on the blocklist */
export function isGenericAnchor(text: string | null): boolean {
  if (!text) return false;
  const normalised = normaliseAnchor(text);
  if (ANCHOR_BLOCKLIST.has(normalised)) return true;
  // Also catch "click here to …" and "read more about …" style phrases
  for (const phrase of ANCHOR_BLOCKLIST) {
    if (normalised.startsWith(phrase + " ")) return true;
  }
  return false;
}

/** Question-starter regex for H2 headings */
export const QUESTION_REGEX =
  /^(who|what|when|where|why|how|can|does|did|is|are|was|were|should|which|will|would|could)\b/i;

/** Days between two dates */
export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** Normalise a URL for canonical comparison — strip trailing slash, lowercase scheme+host */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname)
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

/** Title-case a URL slug: "blue-widgets" -> "Blue Widgets" */
function humaniseSlug(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // leave raw if it isn't valid percent-encoding
  }
  return s
    .replace(/\.[a-z0-9]+$/i, "") // drop a trailing file extension
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a BreadcrumbList JSON-LD <script> snippet from a page URL's path
 * segments. Always yields at least a "Home" entry, so it never fails.
 * Returns the ready-to-paste script and the trail of names for display.
 */
export function buildBreadcrumbJsonLd(pageUrl: string): { script: string; trail: string[] } {
  let origin = "";
  let segments: string[] = [];
  try {
    const u = new URL(pageUrl);
    origin = u.origin;
    segments = u.pathname.split("/").filter(Boolean);
  } catch {
    // pageUrl missing or not absolute — fall back to a Home-only breadcrumb
  }

  const trail = ["Home", ...segments.map(humaniseSlug)];

  let cumulative = origin;
  const itemListElement = trail.map((name, i) => {
    if (i > 0) cumulative += `/${segments[i - 1]}`;
    return {
      "@type": "ListItem",
      position: i + 1,
      name,
      item: i === 0 ? (origin ? `${origin}/` : "/") : cumulative,
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };

  const script = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
  return { script, trail };
}

/** Build a FAQPage JSON-LD <script> snippet from AccordionItem FAQ data. */
export function buildFaqPageJsonLd(faqItems: import("./types").FaqItem[]): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

/**
 * Organization JSON-LD <script> snippet for the site (preview only). Missing
 * name, URL or logo become obvious placeholders for the author to replace;
 * missing description and sameAs are left out.
 */
export function buildOrganizationJsonLd(org: import("./types").OrganizationInfo): string {
  const url = org.url ?? "https://www.example.com/";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name ?? "YOUR ORGANIZATION NAME",
    url,
    logo: org.logo ?? `${url.replace(/\/+$/, "")}/YOUR-LOGO.png`,
    ...(org.description ? { description: org.description } : {}),
    ...(org.sameAs.length > 0 ? { sameAs: org.sameAs } : {}),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

/** Build a RuleResult with sensible defaults for info-only checks */
export function infoResult(
  id: string,
  name: string,
  pillar: import("./types").Pillar,
  trigger: import("./types").Trigger,
  value: string,
  message: string,
  details: string[] = [],
  fixSuggestion: string = ""
): import("./types").RuleResult {
  return {
    id,
    pillar,
    trigger,
    name,
    status: "info",
    score: 0,
    maxScore: 0,
    value,
    message,
    fixSuggestion,
    details,
  };
}
