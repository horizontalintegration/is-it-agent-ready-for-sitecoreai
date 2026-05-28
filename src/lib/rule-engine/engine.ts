import {
  PageData,
  RuleResult,
  GateResult,
  EngineOutput,
  ParsedHtml,
  AuthoringFields,
  RobotsTxt,
  PsiResult,
  AiResults,
  CrawlerPermission,
  CheckStatus,
} from "./types";

import {
  stripHtml,
  ari,
  wordCount,
  isGenericAnchor,
  QUESTION_REGEX,
  daysSince,
  normaliseUrl,
  infoResult,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildFaqPageJsonLd,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// GATE CHECK — runs before everything else
// Blocks the entire panel if noindex / nosnippet signals are found.
// ─────────────────────────────────────────────────────────────────────────────

export function runGateCheck(
  authoring: AuthoringFields,
  html: ParsedHtml | null,
): GateResult {
  // Field-level noindex set on the Sitecore item
  if (authoring.noIndexField) {
    return {
      blocked: true,
      reason:
        'The page has "noindex" enabled in its Robots Meta Tag field. It is excluded from Google Search and all AI features.',
    };
  }

  if (!html) {
    return { blocked: false, reason: "" };
  }

  const robotsContent = (html.robotsMeta ?? "").toLowerCase();
  const googlebotContent = (html.googlebotMeta ?? "").toLowerCase();

  const blockedByRobots =
    robotsContent.includes("noindex") ||
    robotsContent.includes("nosnippet") ||
    robotsContent.includes("max-snippet:0") ||
    googlebotContent.includes("noindex") ||
    googlebotContent.includes("nosnippet") ||
    googlebotContent.includes("max-snippet:0");

  if (blockedByRobots) {
    const tag = robotsContent.includes("noindex")
      ? "noindex"
      : "nosnippet / max-snippet:0";
    return {
      blocked: true,
      reason: `The rendered page contains a <meta name="robots"> tag with "${tag}". This page cannot appear in any Google AI feature.`,
    };
  }

  return { blocked: false, reason: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO CHECKS (checks 1–6 scored, check 7 info-only)
// ─────────────────────────────────────────────────────────────────────────────

/** Check 1 — Meta title length (8 pts) */
function checkMetaTitle(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-meta-title",
    pillar: "seo",
    trigger: "live",
    name: "Meta Title Length",
    maxScore: 8,
  };

  if (!a.pageTitle || a.pageTitle.trim() === "") {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "Missing",
      message: "No meta title set.",
      fixSuggestion:
        'Add a descriptive page title of 50–60 characters in the "Page Title" field.',
      details: [],
    };
  }

  const len = a.pageTitle.trim().length;

  if (len >= 50 && len <= 60) {
    return {
      ...base,
      status: "pass",
      score: 8,
      value: `${len} chars`,
      message: "Title length is within the ideal 50–60 character range.",
      fixSuggestion: "",
      details: [],
    };
  }

  if (len < 30 || len > 70) {
    return {
      ...base,
      status: "fail",
      score: 2,
      value: `${len} chars`,
      message:
        len < 30
          ? "Title is too short — may be ignored by Google."
          : "Title is too long and will be truncated in search results.",
      fixSuggestion:
        len < 30
          ? "Expand the title to 50–60 characters with the primary keyword."
          : "Shorten the title to 60 characters or fewer, keeping the primary keyword near the front.",
      details: [],
    };
  }

  // 30–49 or 61–70 — warning band
  return {
    ...base,
    status: "warning",
    score: 5,
    value: `${len} chars`,
    message:
      len < 50
        ? "Title is slightly short — consider expanding."
        : "Title is slightly long and may be trimmed.",
    fixSuggestion:
      len < 50
        ? "Aim for 50–60 characters to maximise SERP real estate."
        : "Trim to under 60 characters to avoid truncation.",
    details: [],
  };
}

/** Check 2 — Meta description present + length (8 pts) */
function checkMetaDescription(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-meta-description",
    pillar: "seo",
    trigger: "live",
    name: "Meta Description Present + Length",
    maxScore: 8,
  };

  if (!a.metaDescription || a.metaDescription.trim() === "") {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "Missing",
      message:
        "No meta description set. This page may not be snippet-eligible for AI features.",
      fixSuggestion:
        'Write a 120–160 character description in the "Meta Description" field that summarises the page for searchers.',
      details: [],
    };
  }

  const len = a.metaDescription.trim().length;

  if (len >= 120 && len <= 160) {
    return {
      ...base,
      status: "pass",
      score: 8,
      value: `${len} chars`,
      message: "Meta description is present and within the ideal length.",
      fixSuggestion: "",
      details: [],
    };
  }

  return {
    ...base,
    status: "warning",
    score: 4,
    value: `${len} chars`,
    message:
      len < 120
        ? "Description is present but too short — Google may replace it."
        : "Description is too long and will be truncated in snippets.",
    fixSuggestion:
      len < 120
        ? `Expand from ${len} to at least 120 characters with a clear description of the page content.`
        : `Shorten from ${len} to 160 characters or fewer.`,
    details: [],
  };
}

/** Check 3 — H1 count + heading hierarchy (6 pts: 3 for H1, 3 for hierarchy) */
function checkHeadings(html: ParsedHtml | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-headings",
    pillar: "seo",
    trigger: "preview",
    name: "H1 Count + Heading Hierarchy",
    maxScore: 6,
  };

  if (!html) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet scanned",
      message:
        "Run a full scan to check heading structure from the rendered page.",
      fixSuggestion: "",
      details: [],
    };
  }

  const headings = html.headings;
  const h1s = headings.filter((h) => h.level === 1);
  const details: string[] = [];
  let score = 0;

  // H1 sub-score (3 pts)
  let h1Score = 0;
  if (h1s.length === 1) {
    h1Score = 3;
  } else if (h1s.length === 0) {
    details.push(
      "No H1 found — add one that matches the page topic and meta title.",
    );
  } else {
    details.push(`${h1s.length} H1s found — remove all but one.`);
    h1Score = 1;
  }

  // Hierarchy sub-score (3 pts)
  let hierarchyScore = 3;
  for (let i = 1; i < headings.length; i++) {
    const diff = headings[i].level - headings[i - 1].level;
    if (diff > 1) {
      hierarchyScore = 0;
      details.push(
        `Heading level skips from H${headings[i - 1].level} to H${headings[i].level} ("${headings[i].text.slice(0, 40)}")`,
      );
      break; // report first violation only
    }
  }

  score = h1Score + hierarchyScore;
  const overallStatus: CheckStatus =
    score === 6 ? "pass" : score >= 4 ? "warning" : "fail";

  return {
    ...base,
    status: overallStatus,
    score,
    value: `${h1s.length} H1, ${headings.length} headings total`,
    message:
      score === 6
        ? "Heading structure is correct — one H1 with no skipped levels."
        : (details[0] ?? "Heading structure has issues."),
    fixSuggestion:
      score === 6 ? "" : "Fix the issues listed in the details below.",
    details,
  };
}

/** Check 4 — Image alt text (5 pts, proportional to coverage) */
function checkImageAltText(html: ParsedHtml | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-image-alt",
    pillar: "seo",
    trigger: "preview",
    name: "Image Alt Text",
    maxScore: 5,
  };

  if (!html) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet scanned",
      message:
        "Run a full scan to check image alt text from the rendered page.",
      fixSuggestion: "",
      details: [],
    };
  }

  const images = html.images;

  if (images.length === 0) {
    return {
      ...base,
      status: "pass",
      score: 5,
      value: "No images on page",
      message: "No images found — nothing to check.",
      fixSuggestion: "",
      details: [],
    };
  }

  const missing = images.filter((img) => !img.alt || img.alt.trim() === "");
  const coverage = (images.length - missing.length) / images.length;
  const score = Math.round(coverage * 5);
  const details = missing.map(
    (img) => `Missing alt: ${imageFileName(img.src)}`,
  );

  return {
    ...base,
    status:
      missing.length === 0
        ? "pass"
        : missing.length < images.length
          ? "warning"
          : "fail",
    score,
    value: `${images.length - missing.length} of ${images.length} images have alt text`,
    message:
      missing.length === 0
        ? "All images have alt text."
        : `${missing.length} image${missing.length > 1 ? "s" : ""} missing alt text.`,
    fixSuggestion:
      missing.length === 0
        ? ""
        : "Add descriptive alt text to the image field of each component listed below.",
    details,
  };
}

/** Short, human-readable file name from an image URL, for fix-suggestion details. */
function imageFileName(src: string): string {
  if (!src) return "image";
  const path = src.split("?")[0];
  const seg = path.substring(path.lastIndexOf("/") + 1);
  return seg || src;
}

/** Check 5 — Canonical tag rendered (5 pts) */
function checkCanonical(pageUrl: string, html: ParsedHtml | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-canonical",
    pillar: "seo",
    trigger: "preview",
    name: "Canonical Tag Rendered",
    maxScore: 5,
  };

  if (!html) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet scanned",
      message: "Run a full scan to validate the canonical tag.",
      fixSuggestion: "",
      details: [],
    };
  }

  if (!html.canonicalHref) {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "Missing",
      message: "No canonical tag found in the rendered page.",
      fixSuggestion:
        'Ensure the page template renders a <link rel="canonical"> tag pointing to this page URL.',
      details: [],
    };
  }

  if (normaliseUrl(html.canonicalHref) === normaliseUrl(pageUrl)) {
    return {
      ...base,
      status: "pass",
      score: 5,
      value: html.canonicalHref,
      message: "Canonical tag is present and self-referencing.",
      fixSuggestion: "",
      details: [],
    };
  }

  return {
    ...base,
    status: "warning",
    score: 2,
    value: html.canonicalHref,
    message: "Canonical tag points to a different URL.",
    fixSuggestion: `Update the canonical href to match this page's URL: ${pageUrl}`,
    details: [`Canonical: ${html.canonicalHref}`, `Expected: ${pageUrl}`],
  };
}

/** Check 6 — OG tags (3 pts, 1 per tag) — read from authoring fields directly */
function checkOgTags(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-og-tags",
    pillar: "seo",
    trigger: "live",
    name: "OG Tags",
    maxScore: 3,
  };

  const tags = [
    { name: "OpenGraphTitle", label: "og:title", value: a.ogTitle },
    {
      name: "OpenGraphDescription",
      label: "og:description",
      value: a.ogDescription,
    },
    { name: "OpenGraphImage", label: "og:image", value: a.ogImage },
  ];

  const missing = tags.filter((t) => !t.value);
  const score = tags.length - missing.length;
  const details = tags.map(
    (t) => `${t.label}: ${t.value ? "✓ present" : "✗ missing"}`,
  );

  return {
    ...base,
    status: score === 3 ? "pass" : score >= 2 ? "warning" : "fail",
    score,
    value: `${score} of 3 OG fields set`,
    message:
      score === 3
        ? "All three core OG fields are set on the page."
        : `Missing: ${missing.map((t) => t.label).join(", ")}`,
    fixSuggestion:
      missing.length === 0
        ? ""
        : `Set the missing OG fields on the page: ${missing.map((t) => t.name).join(", ")}`,
    details,
  };
}

/** Check 7 (info only) — Internal link anchor text quality */
function checkAnchorText(html: ParsedHtml | null): RuleResult {
  if (!html) {
    return infoResult(
      "seo-anchor-text",
      "Internal Link Anchor Text Quality",
      "seo",
      "preview",
      "Not yet scanned",
      "Run a full scan to check link anchor text from the rendered page.",
    );
  }

  const generic = html.links.filter((l) => isGenericAnchor(l.anchorText));

  return infoResult(
    "seo-anchor-text",
    "Internal Link Anchor Text Quality",
    "seo",
    "preview",
    generic.length === 0
      ? "No generic anchors found"
      : `${generic.length} generic anchor${generic.length > 1 ? "s" : ""} found`,
    generic.length === 0
      ? "All link anchor texts appear descriptive."
      : `${generic.length} link${generic.length > 1 ? "s" : ""} use generic anchor text (e.g. "click here", "read more").`,
    generic.map((l) => `"${l.anchorText}"`),
    generic.length === 0
      ? ""
      : "Replace generic anchors with descriptive text, and strengthen internal linking to key pages (docs, security/trust, pricing, integrations, customer stories) using descriptive anchor text.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AEO CHECKS (checks 8–11 scored, check 12 info-only)
// ─────────────────────────────────────────────────────────────────────────────

/** Check 8 — FAQ schema / FAQPage JSON-LD (8 pts)
 * Generates the FAQPage JSON-LD from AccordionItem datasource fields fetched
 * via the authoring API. Always scores full marks — the schema is ready to paste. */
function checkFaqSchema(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "aeo-faq-schema",
    pillar: "aeo",
    trigger: "live",
    name: "FAQ Schema (FAQPage JSON-LD)",
    maxScore: 8,
  };

  if (!a.hasFaqComponent || a.faqItems.length === 0) {
    return {
      ...base,
      status: "pass",
      score: 8,
      value: "No AccordionItem components found",
      message: "No AccordionItem components found on this page — FAQ schema check not applicable.",
      fixSuggestion: "",
      details: [],
    };
  }

  const script = buildFaqPageJsonLd(a.faqItems);

  return {
    ...base,
    status: "pass",
    score: 8,
    value: `${a.faqItems.length} FAQ item${a.faqItems.length > 1 ? "s" : ""} found`,
    message: `FAQPage JSON-LD generated from ${a.faqItems.length} AccordionItem${a.faqItems.length > 1 ? "s" : ""}. AI assistants (ChatGPT, Gemini, Perplexity) extract these Q&A pairs directly to populate conversational answers. Add the snippet below to your page template.`,
    fixSuggestion: "",
    details: [
      "Add this JSON-LD block to your page template's <head> or inline in the <body>.",
      "Validate with Google's Rich Results Test after deploying.",
    ],
    codePreview: script,
  };
}

/** Check 9 — FAQ answer length + quality (5 pts) */
function checkFaqAnswerQuality(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "aeo-faq-answer-quality",
    pillar: "aeo",
    trigger: "live",
    name: "FAQ Answer Length and Quality",
    maxScore: 5,
  };

  if (!a.hasFaqComponent || a.faqItems.length === 0) {
    return {
      ...base,
      status: "info",
      score: 0,
      maxScore: 0,
      value: "No FAQ items",
      message: "No AccordionItem components found on this page — FAQ answer quality check not applicable.",
      fixSuggestion: "",
      details: [],
    };
  }

  const HTML_TAG_RE = /<[^>]*>/g;
  const details: string[] = [];

  let validCount = 0;
  for (const item of a.faqItems) {
    const plain = stripHtml(item.answer);
    const hasHtml = HTML_TAG_RE.test(item.answer);
    const len = plain.length;

    if (hasHtml) {
      details.push(
        `"${item.question.slice(0, 60)}" — answer contains HTML markup (AI assistants skip rich-text answers; plain text only)`,
      );
    } else if (len < 40) {
      details.push(
        `"${item.question.slice(0, 60)}" — answer too short (${len} chars; minimum 40 characters for useful AI citation)`,
      );
    } else if (len > 300) {
      details.push(
        `"${item.question.slice(0, 60)}" — answer too long (${len} chars; maximum 300 characters for focused AI extraction)`,
      );
    } else {
      validCount++;
    }
  }

  const ratio = validCount / a.faqItems.length;
  const score = Math.round(ratio * 5);

  const criteria = "Scoring criteria: plain text only (no HTML) · 40–300 characters per answer · direct, self-contained response.";

  return {
    ...base,
    status: score === 5 ? "pass" : score >= 3 ? "warning" : "fail",
    score,
    value: `${validCount} of ${a.faqItems.length} answers meet criteria`,
    message:
      score === 5
        ? `All ${a.faqItems.length} FAQ answer${a.faqItems.length > 1 ? "s" : ""} pass quality checks. ${criteria} AI assistants (ChatGPT, Perplexity, Gemini) use these answers word-for-word in conversational responses.`
        : `${a.faqItems.length - validCount} of ${a.faqItems.length} answer${a.faqItems.length - validCount > 1 ? "s" : ""} need attention. ${criteria}`,
    fixSuggestion:
      score === 5
        ? ""
        : "Edit the flagged answers: strip all HTML tags, keep plain text between 40–300 characters, and ensure each answer stands alone without referencing the question.",
    details,
  };
}

/* Check 10 — HowTo schema (7 pts) — DISABLED (commented out)
function checkHowToSchema(a: AuthoringFields, html: ParsedHtml | null): RuleResult {
  const base: Pick<RuleResult, "id" | "pillar" | "trigger" | "name" | "maxScore"> = {
    id: "aeo-howto-schema",
    pillar: "aeo",
    trigger: "preview",
    name: "HowTo Schema",
    maxScore: 7,
  };

  if (!a.hasHowToComponent) {
    return {
      ...base,
      status: "pass",
      score: 7,
      value: "No step-list component on page",
      message: "No step-list component present — check not applicable.",
      fixSuggestion: "",
      details: [],
    };
  }

  if (!html) {
    return { ...base, status: "info", score: 0, value: "Not yet scanned", message: "Run a full scan to validate HowTo JSON-LD in the rendered output.", fixSuggestion: "", details: [] };
  }

  const howToBlock = html.jsonLdBlocks.find((b) => b.type === "HowTo");

  if (!howToBlock) {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "Step-list component present but no HowTo JSON-LD",
      message: "Step-list component is on the page but no HowTo JSON-LD was found in the rendered output.",
      fixSuggestion: "Ensure the step-list component outputs HowTo JSON-LD with step[].name and step[].text for each step.",
      details: [],
    };
  }

  // Validate step structure
  const raw = howToBlock.raw as Record<string, unknown>;
  const steps = Array.isArray(raw?.step) ? (raw.step as unknown[]) : [];
  const invalidSteps = steps.filter((s) => {
    const step = s as Record<string, unknown>;
    return !step?.name || !step?.text;
  });

  const details = invalidSteps.map((_, i) => `Step ${i + 1} is missing "name" or "text" property`);

  if (invalidSteps.length > 0) {
    return {
      ...base,
      status: "warning",
      score: 4,
      value: `HowTo JSON-LD present — ${invalidSteps.length} step${invalidSteps.length > 1 ? "s" : ""} incomplete`,
      message: `HowTo schema found but ${invalidSteps.length} step${invalidSteps.length > 1 ? "s are" : " is"} missing required fields.`,
      fixSuggestion: 'Ensure every step in the HowTo JSON-LD has both "name" and "text" properties.',
      details,
    };
  }

  return {
    ...base,
    status: "pass",
    score: 7,
    value: `HowTo JSON-LD present — ${steps.length} step${steps.length !== 1 ? "s" : ""}`,
    message: "HowTo structured data is present and all steps are valid.",
    fixSuggestion: "",
    details: [],
  };
}
*/

/** Organization schema (preview only) — surfaces a ready-to-paste site-level
 * Organization JSON-LD snippet. Always scores full marks. */
function checkOrganizationSchema(): RuleResult {
  return {
    id: "aeo-organization-schema",
    pillar: "aeo",
    trigger: "live",
    name: "Organization Schema",
    maxScore: 5,
    status: "pass",
    score: 5,
    value: "BrandX",
    message:
      "Organization structured data identifies your brand to search engines and AI assistants. Add the snippet below to your global template (e.g. site head) so it renders on every page.",
    fixSuggestion: "",
    details: [
      "Why it matters: identifies your brand as a verified entity (name, logo, official URL) to search engines and AI assistants.",
      "Powers brand features such as the Google Knowledge Panel and your logo appearing in search results.",
      "The sameAs links connect your site to official social profiles, reinforcing trust and authority (E-E-A-T).",
      "AI search engines (ChatGPT, Perplexity, Gemini) use it to recognise and cite your organisation correctly.",
    ],
    codePreview: buildOrganizationJsonLd(),
  };
}

/** Check 11 — Rich results eligibility (structured data coverage) — 5 pts.
 * Generates a BreadcrumbList JSON-LD from the page URL and surfaces it as a
 * ready-to-paste snippet. Always scores full marks. */
function checkStructuredDataCoverage(pageUrl: string): RuleResult {
  const { script, trail } = buildBreadcrumbJsonLd(pageUrl);

  return {
    id: "aeo-structured-data",
    pillar: "aeo",
    trigger: "live",
    name: "Rich Results Eligibility (Structured Data Coverage)",
    maxScore: 5,
    status: "pass",
    score: 5,
    value: trail.join(" › "),
    message:
      "BreadcrumbList structured data generated from the page URL. Breadcrumbs signal site hierarchy to AI crawlers and unlock richer SERP presentation. Add the snippet below to your page template.",
    fixSuggestion: "",
    details: [
      "Why it matters: tells search engines and AI where this page sits in your site hierarchy.",
      "Replaces the raw URL in Google results with a readable breadcrumb trail, which can lift click-through rate.",
      "Helps crawlers and AI understand how your pages relate to each other and the site's structure.",
    ],
    codePreview: script,
  };
}

/** Check 12 (info only) — Question-format H2 headings */
function checkQuestionHeadings(a: AuthoringFields): RuleResult {
  const h2s = a.headings.filter((h) => h.level === 2);

  if (h2s.length === 0) {
    return infoResult(
      "aeo-question-headings",
      "Question-format H2 headings",
      "aeo",
      "live",
      "No H2 headings found",
      "No H2 headings on the page to analyse.",
      [],
    );
  }

  const questionH2s = h2s.filter((h) => QUESTION_REGEX.test(h.text));
  const ratio = Math.round((questionH2s.length / h2s.length) * 100);

  return infoResult(
    "aeo-question-headings",
    "Question-format H2 headings",
    "aeo",
    "live",
    `${questionH2s.length} of ${h2s.length} H2s are question-format (${ratio}%)`,
    `${ratio}% of H2 headings are phrased as questions. Consider adding question headings where natural — don't restructure content purely to hit a number.`,
    questionH2s.map((h) => h.text),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT QUALITY CHECKS (checks 13–19 scored, check 20 info-only)
// ─────────────────────────────────────────────────────────────────────────────

/** Check 13 — Unique content signal via AI (10 pts) */
function checkUniqueness(ai: AiResults | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-uniqueness",
    pillar: "content-quality",
    trigger: "ai",
    name: "Unique Content Signal",
    maxScore: 10,
  };

  if (!ai) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet analysed",
      message: "Run a full scan to analyse content uniqueness with AI.",
      fixSuggestion: "",
      details: [],
    };
  }

  const scoreMap: Record<string, number> = {
    unique: 10,
    borderline: 5,
    commodity: 0,
  };

  const statusMap: Record<string, CheckStatus> = {
    unique: "pass",
    borderline: "warning",
    commodity: "fail",
  };

  const score = scoreMap[ai.uniquenessRating] ?? 0;
  const status = statusMap[ai.uniquenessRating] ?? "fail";

  return {
    ...base,
    status,
    score,
    value:
      ai.uniquenessRating.charAt(0).toUpperCase() +
      ai.uniquenessRating.slice(1),
    message: ai.uniquenessExplanation,
    fixSuggestion:
      score === 10
        ? ""
        : score === 5
          ? "Strengthen the unique perspective — add first-hand experience, original data, or expert insight not available elsewhere."
          : "This content reads as commodity — it summarises information already widely available. Add original research, unique perspective, or first-hand experience to differentiate.",
    details: [],
  };
}

/** Check 14 — Author field present + profile linked (6 pts) */
function checkAuthor(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-author",
    pillar: "content-quality",
    trigger: "live",
    name: "Author Field Present + Profile Linked",
    maxScore: 6,
  };

  if (!a.author || a.author.trim() === "") {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "No author set",
      message:
        "No author attributed. Google and AI engines prioritise first-hand, attributed content when selecting sources for AI-generated answers.",
      fixSuggestion:
        'Set the "Author" field on this page with the content creator\'s name.',
      details: [],
    };
  }

  if (a.authorProfileLinked) {
    return {
      ...base,
      status: "pass",
      score: 6,
      value: `${a.author} (profile linked)`,
      message:
        "Author is set and links to a profile page — strong E-E-A-T signal. AI systems prioritise attributed, expert-authored content when selecting sources for generated answers.",
      fixSuggestion: "",
      details: [],
    };
  }

  return {
    ...base,
    status: "warning",
    score: 3,
    value: `${a.author} (no profile link)`,
    message: "Author name is set but no profile page is linked. A linked profile helps AI systems verify the author's expertise and strengthens E-E-A-T.",
    fixSuggestion:
      "Link the Author field to an author profile item in Sitecore. A name + profile page is a stronger E-E-A-T signal than a name alone.",
    details: [],
  };
}

/** Check 15 — Published date + freshness (5 pts) */
function checkFreshness(a: AuthoringFields): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-freshness",
    pillar: "content-quality",
    trigger: "live",
    name: "Published Date + Freshness",
    maxScore: 5,
  };

  const date = a.lastUpdatedDate ?? a.publishDate;

  if (!date) {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: "No date set",
      message:
        "No publish or updated date found. Google cannot assess content freshness.",
      fixSuggestion:
        'Set a "Published Date" or "Last Updated" field on the page template.',
      details: [],
    };
  }

  const days = daysSince(date);
  const dateLabel = date.toISOString().slice(0, 10);

  if (days <= 365) {
    return {
      ...base,
      status: "pass",
      score: 5,
      value: `Last updated ${dateLabel} (${days} days ago)`,
      message: "Content is within the freshness threshold. AI retrieval systems favour recently updated pages when generating answers on fast-moving topics.",
      fixSuggestion: "",
      details: [],
    };
  }

  if (days <= 730) {
    return {
      ...base,
      status: "warning",
      score: 2,
      value: `Last updated ${dateLabel} (${days} days ago)`,
      message: "Content is over a year old — consider reviewing and updating. Outdated pages may be deprioritised by AI retrieval systems in favour of fresher sources.",
      fixSuggestion:
        "Review and refresh the content, then update the Last Updated date to reflect the revision.",
      details: [],
    };
  }

  return {
    ...base,
    status: "fail",
    score: 0,
    value: `Last updated ${dateLabel} (${days} days ago)`,
    message: `Content is ${Math.floor(days / 365)} years old. Stale content is down-weighted by Google's RAG retrieval layer.`,
    fixSuggestion:
      "Substantially update the content and set a new Last Updated date.",
    details: [],
  };
}

/** Check 16 — AI crawler permissions (6 pts) */
function checkRobotsTxt(robots: RobotsTxt | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "seo-robots-txt",
    pillar: "seo",
    trigger: "on-load",
    name: "AI Crawler Permissions (robots.txt)",
    maxScore: 6,
  };

  if (!robots) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet fetched",
      message:
        "Robots.txt is fetched once on app load. Refresh the page to trigger it.",
      fixSuggestion: "",
      details: [],
    };
  }

  const crawlers: Array<[string, CrawlerPermission]> = [
    ["Google-Extended", robots.googleExtended],
    ["GPTBot", robots.gptBot],
    ["ClaudeBot", robots.claudeBot],
    ["PerplexityBot", robots.perplexityBot],
    ["Amazonbot", robots.amazonBot],
    ["Applebot-Extended", robots.appleBotExtended],
  ];

  const blocked = crawlers.filter(([, p]) => p === "blocked");
  const details = crawlers.map(
    ([name, p]) =>
      `${name}: ${p === "blocked" ? "✗ blocked" : p === "allowed" ? "✓ allowed" : "~ not mentioned (allowed by default)"}`,
  );

  if (blocked.length === 0) {
    return {
      ...base,
      status: "pass",
      score: 6,
      value: "No AI crawlers blocked",
      message: "All major AI crawlers are permitted in robots.txt.",
      fixSuggestion: "",
      details,
    };
  }

  // Partial credit: lose 1 pt per blocked crawler, down to 0
  const score = Math.max(0, 6 - blocked.length);

  return {
    ...base,
    status: score > 0 ? "warning" : "fail",
    score,
    value: `${blocked.length} AI crawler${blocked.length > 1 ? "s" : ""} blocked`,
    message: `Blocked: ${blocked.map(([n]) => n).join(", ")}. These systems cannot index this site's content for AI features.`,
    fixSuggestion: `Review /robots.txt and remove Disallow rules for: ${blocked.map(([n]) => n).join(", ")}.`,
    details,
  };
}

/** Check 17 — Page experience / PageSpeed Insights (5 pts) */
function checkPageExperience(psi: PsiResult | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-page-experience",
    pillar: "content-quality",
    trigger: "psi",
    name: "Page Experience — Performance Score",
    maxScore: 5,
  };

  if (!psi) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet checked",
      message: "Run a full scan to fetch the PageSpeed Insights score.",
      fixSuggestion: "",
      details: [],
    };
  }

  if (psi.psiError) {
    return {
      ...base,
      status: "warning",
      score: 0,
      value: "PSI unavailable",
      message: "PageSpeed Insights could not analyse this page — it may not be publicly accessible on the internet. PSI requires a live, crawlable URL.",
      fixSuggestion: "Run PSI manually at pagespeed.web.dev once the page is deployed to a public URL.",
      details: [`Error: ${psi.psiError}`],
    };
  }

  if (!psi.isCrawlable) {
    return {
      ...base,
      status: "fail",
      score: 0,
      value: `PSI score: ${psi.performanceScore} — page not crawlable`,
      message: "PageSpeed Insights reports this page as not crawlable.",
      fixSuggestion:
        "Check that the page is publicly accessible and not blocked by robots.txt or a login wall.",
      details: [],
    };
  }

  let score: number;
  let status: CheckStatus;

  if (psi.performanceScore >= 70) {
    score = 5;
    status = "pass";
  } else if (psi.performanceScore >= 50) {
    score = 3;
    status = "warning";
  } else {
    score = 0;
    status = "fail";
  }

  return {
    ...base,
    status,
    score,
    value: `PSI performance: ${psi.performanceScore}/100`,
    message:
      score === 5
        ? `Good performance score (${psi.performanceScore}/100). Page experience is acceptable.`
        : `Performance score of ${psi.performanceScore}/100 is below threshold. Slow pages reduce dwell time and can affect AI feature eligibility.`,
    fixSuggestion:
      score === 5
        ? ""
        : "Run PageSpeed Insights directly (pagespeed.web.dev) for a detailed breakdown of Core Web Vitals and improvement opportunities.",
    details: psi.coreWebVitals,
    flaggedItems: psi.opportunities.length > 0 ? psi.opportunities : undefined,
  };
}

/** Check 18 — Agentic readiness / semantic landmarks (4 pts) */
function checkAgenticReadiness(html: ParsedHtml | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-agentic-readiness",
    pillar: "content-quality",
    trigger: "preview",
    name: "Agentic Readiness — Semantic Landmarks",
    maxScore: 4,
  };

  if (!html) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet scanned",
      message: "Run a full scan to check semantic landmarks.",
      fixSuggestion: "",
      details: [],
    };
  }

  const landmarks = [
    { name: "<main>", present: html.hasMain },
    { name: "<article>", present: html.hasArticle },
    { name: "<nav>", present: html.hasNav },
    { name: "<header>", present: html.hasHeader },
  ];

  const presentCount = landmarks.filter((l) => l.present).length;
  const missing = landmarks.filter((l) => !l.present);
  const details = landmarks.map(
    (l) => `${l.name}: ${l.present ? "✓ present" : "✗ missing"}`,
  );

  if (html.interactiveElementsMissingLabel > 0) {
    const n = html.interactiveElementsMissingLabel;
    details.push(
      `⚠ ${n} interactive element${n > 1 ? "s" : ""} missing accessible label`,
    );
    details.push(
      "These are typically icon-only buttons (e.g. hamburger menu, search, carousel arrows) or image-wrapped links with no visible text. Without a label, screen readers and AI agents cannot identify what the element does.",
    );
    details.push(
      'Fix: add aria-label="Descriptive name" to each flagged element — e.g. <button aria-label="Open navigation menu"><svg .../></button>',
    );
  }

  const score = presentCount;

  return {
    ...base,
    status: score === 4 ? "pass" : score >= 3 ? "warning" : "fail",
    score,
    value: `${presentCount} of 4 landmark elements present`,
    message:
      score === 4
        ? "All semantic landmark elements are present. AI agents and browser automation tools use these landmarks to locate and extract specific content regions."
        : `Missing landmark${missing.length > 1 ? "s" : ""}: ${missing.map((l) => l.name).join(", ")}. AI agents rely on these to navigate and extract content from the page.`,
    fixSuggestion:
      missing.length === 0
        ? ""
        : `Add the missing HTML5 landmark elements to your JSS component layout: ${missing.map((l) => l.name).join(", ")}.`,
    details,
  };
}

/** Check 19 — Passage-level reading grade (4 pts) */
function checkReadingGrade(html: ParsedHtml | null): RuleResult {
  const base: Pick<
    RuleResult,
    "id" | "pillar" | "trigger" | "name" | "maxScore"
  > = {
    id: "cq-reading-grade",
    pillar: "content-quality",
    trigger: "preview",
    name: "Passage-level Reading Grade",
    maxScore: 4,
  };

  if (!html) {
    return {
      ...base,
      status: "info",
      score: 0,
      value: "Not yet scanned",
      message:
        "Run a full scan to grade passage reading level from the rendered page.",
      fixSuggestion: "",
      details: [],
    };
  }

  // Explanation shown to users so the check and its scoring are transparent.
  const explanation = [
    "Why it matters: dense, complex prose is summarised and quoted less accurately by AI answer engines, and is harder for readers to scan.",
    "How it's graded: each content paragraph of 20+ words is scored with the Automated Readability Index (ARI) = 4.71 × (characters ÷ words) + 0.5 × (words ÷ sentences) − 21.43, which approximates a US school grade level.",
    "Target: grade ≤ 13 (about early-college level). The score is the share of analysed paragraphs that meet it, scaled to 4 points.",
  ];

  // Only analyse paragraphs of at least 20 words
  const eligible = html.paragraphs.filter((p) => wordCount(p) >= 20);

  if (eligible.length === 0) {
    return {
      ...base,
      status: "pass",
      score: 4,
      value: "No long paragraphs to analyse",
      message: "No paragraphs of 20+ words found — nothing to grade.",
      fixSuggestion: "",
      details: explanation,
    };
  }

  const graded = eligible.map((p) => ({ text: p, grade: ari(p) }));
  const passing = graded.filter((g) => g.grade <= 13);
  const failing = graded.filter((g) => g.grade > 13);
  const ratio = passing.length / graded.length;
  const score = Math.round(ratio * 4);

  const flaggedItems = failing.map(
    (g) => `Grade ${Math.round(g.grade)}: "${g.text.slice(0, 60)}…"`,
  );

  return {
    ...base,
    status: score === 4 ? "pass" : score >= 3 ? "warning" : "fail",
    score,
    value: `${passing.length} of ${graded.length} paragraphs at grade ≤ 13 (${Math.round(ratio * 100)}%)`,
    message:
      score === 4
        ? "All analysed paragraphs are within the target reading grade. Clear, readable prose is quoted more accurately by AI answer engines."
        : `${failing.length} paragraph${failing.length > 1 ? "s" : ""} exceed grade 13. Complex prose is paraphrased poorly by AI retrieval systems and harder for readers to scan.`,
    fixSuggestion:
      score === 4
        ? ""
        : "Simplify the flagged paragraphs: shorter sentences, fewer syllables, active voice.",
    details: explanation,
    flaggedItems,
  };
}

/* Check 20 (info only) — Content follow-up gaps — DISABLED (commented out)
function checkFollowUpGaps(ai: AiResults | null): RuleResult {
  if (!ai) {
    return infoResult(
      "cq-followup-gaps",
      "Content follow-up gaps",
      "content-quality",
      "ai",
      "Not yet analysed",
      "Run a full scan to identify content gaps with AI.",
      []
    );
  }

  const uncovered = ai.followUpGaps.filter((g) => !g.covered);

  return infoResult(
    "cq-followup-gaps",
    "Content follow-up gaps",
    "content-quality",
    "ai",
    `${uncovered.length} of 5 follow-up questions not addressed`,
    uncovered.length === 0
      ? "The page addresses all identified follow-up questions."
      : `${uncovered.length} reader follow-up question${uncovered.length > 1 ? "s" : ""} not covered. Consider adding content if genuinely useful to readers — not to game AI rankings.`,
    [
      ...ai.followUpGaps
        .filter((g) => !g.covered)
        .map((g) => `✗ Not covered: ${g.question}`),
      ...ai.followUpGaps
        .filter((g) => g.covered)
        .map((g) => `✓ Covered: ${g.question}`),
    ]
  );
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

export function runRuleEngine(data: PageData): EngineOutput {
  const gate = runGateCheck(data.authoring, data.parsedHtml);

  // ── Run all checks ──────────────────────────────────────────────────────────
  const results: RuleResult[] = [
    // SEO
    checkMetaTitle(data.authoring),
    checkMetaDescription(data.authoring),
    checkHeadings(data.parsedHtml),
    checkImageAltText(data.parsedHtml),
    checkCanonical(data.pageUrl, data.parsedHtml),
    checkOgTags(data.authoring),
    checkRobotsTxt(data.robotsTxt),
    checkAnchorText(data.parsedHtml), // info-only

    // AEO
    checkOrganizationSchema(),
    checkStructuredDataCoverage(data.pageUrl),
    checkFaqSchema(data.authoring),
    checkFaqAnswerQuality(data.authoring),
    // checkHowToSchema(data.authoring, data.parsedHtml),
    // checkQuestionHeadings(data.authoring),     // info-only

    // Content quality
    checkUniqueness(data.ai),
    // checkAuthor(data.authoring),
    // checkFreshness(data.authoring),
    checkPageExperience(data.psi),
    checkAgenticReadiness(data.parsedHtml),
    checkReadingGrade(data.parsedHtml),
    // checkFollowUpGaps(data.ai),                // info-only
  ];

  // ── Aggregate scores (maxima derived from whichever checks are enabled) ───────
  const sumScore = (p: RuleResult["pillar"]) =>
    results.filter((r) => r.pillar === p).reduce((s, r) => s + r.score, 0);
  const sumMax = (p: RuleResult["pillar"]) =>
    results.filter((r) => r.pillar === p).reduce((s, r) => s + r.maxScore, 0);

  const maxSeoScore = sumMax("seo");
  const maxAeoScore = sumMax("aeo");
  const maxContentQualityScore = sumMax("content-quality");
  const maxTotalScore = maxSeoScore + maxAeoScore + maxContentQualityScore;

  if (gate.blocked) {
    return {
      gate,
      results: [],
      seoScore: 0,
      aeoScore: 0,
      contentQualityScore: 0,
      totalScore: 0,
      maxSeoScore,
      maxAeoScore,
      maxContentQualityScore,
      maxTotalScore,
    };
  }

  const seoScore = sumScore("seo");
  const aeoScore = sumScore("aeo");
  const cqScore = sumScore("content-quality");

  return {
    gate,
    results,
    seoScore,
    aeoScore,
    contentQualityScore: cqScore,
    totalScore: seoScore + aeoScore + cqScore,
    maxSeoScore,
    maxAeoScore,
    maxContentQualityScore,
    maxTotalScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Named exports for the dashboard widget's quick-score utility.
// These are the 9 "live" checks that only require authoring field values
// (no preview fetch, no PSI API, no Claude API).
// ─────────────────────────────────────────────────────────────────────────────
export {
  checkMetaTitle,
  checkMetaDescription,
  checkImageAltText,
  checkAnchorText,
  checkFaqAnswerQuality,
  checkQuestionHeadings,
  checkAuthor,
  checkFreshness,
  checkReadingGrade,
};
