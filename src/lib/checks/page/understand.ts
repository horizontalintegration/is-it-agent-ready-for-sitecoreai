// Page checks — Understand: do they understand it?

import {
  ari,
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  QUESTION_REGEX,
  wordCount,
} from "@/lib/rule-engine/helpers";
import { isArticleTemplate } from "../context";
import {
  collectNodes,
  hasType,
  isArticle,
  isObject,
  listProp,
  parseErrors,
  stringProp,
  type JsonLdNode,
} from "../json-ld";
import { htmlNotScanned, notApplicable, notChecked, scored } from "../result";
import type { CheckDef, PageContext } from "../types";

/** Short, human-readable file name from an image URL, for details. */
function imageFileName(src: string): string {
  if (!src) return "image";
  const path = src.split("?")[0];
  return path.substring(path.lastIndexOf("/") + 1) || src;
}

/** P8 — was seo-headings */
export const headings: CheckDef<PageContext> = {
  id: "understand.headings",
  ref: "P8",
  title: "One clear H1 and logical headings",
  why: "Agents use the heading outline to work out what the page is about and where each answer starts.",
  category: "understand",
  tier: "essential",
  scope: "page",
  sources: ["draft"],
  owner: "author",
  applies: () => true,
  run({ body: html }) {
    if (!html) return htmlNotScanned();

    const all = html.headings;
    const h1s = all.filter((h) => h.level === 1);
    const details: string[] = [];

    // H1: half the credit
    let h1Credit = 0;
    if (h1s.length === 1) h1Credit = 0.5;
    else if (h1s.length === 0) details.push("No H1 found — add one that matches the page topic and meta title.");
    else {
      details.push(`${h1s.length} H1s found — remove all but one.`);
      h1Credit = 1 / 6;
    }

    // Hierarchy: the other half; report the first skip only
    let hierarchyCredit = 0.5;
    for (let i = 1; i < all.length; i++) {
      if (all[i].level - all[i - 1].level > 1) {
        hierarchyCredit = 0;
        details.push(
          `Heading level skips from H${all[i - 1].level} to H${all[i].level} ("${all[i].text.slice(0, 40)}")`,
        );
        break;
      }
    }

    const credit = h1Credit + hierarchyCredit;
    return scored(
      credit,
      `${h1s.length} H1, ${all.length} headings total`,
      credit === 1 ? "Heading structure is correct — one H1 with no skipped levels." : (details[0] ?? "Heading structure has issues."),
      {
        status: credit === 1 ? "pass" : credit >= 2 / 3 ? "warning" : "fail",
        fixSuggestion: credit === 1 ? "" : "Fix the issues listed in the details below.",
        details,
      },
    );
  },
};

/** P9 — merges seo-meta-title and seo-meta-description */
export const titleMeta: CheckDef<PageContext> = {
  id: "understand.title-meta",
  ref: "P9",
  title: "Title and description are set",
  why: "The title and description are the page summary agents and search results show before anyone clicks.",
  category: "understand",
  tier: "essential",
  scope: "page",
  sources: ["fields", "live"],
  owner: "author",
  fix: "generate",
  applies: () => true,
  run({ fields, html }) {
    if (!fields && !html) return notChecked("Not yet loaded", "Waiting for the page fields and the rendered page.");

    // The Sitecore field wins (it's what the author edits); the rendered tag is the fallback.
    const title = fields?.metaTitle ?? html?.title ?? null;
    const description = fields?.metaDescription ?? html?.metaDescription ?? null;
    const details: string[] = [];
    const fixes: string[] = [];

    let titleCredit = 0;
    if (!title) {
      details.push("Title: missing");
      fixes.push('Add a descriptive page title of 50–60 characters in the "Page Title" field.');
    } else {
      const len = title.length;
      if (len >= 50 && len <= 60) titleCredit = 1;
      else if (len >= 30 && len <= 70) titleCredit = 0.6;
      else titleCredit = 0.25;
      details.push(`Title: ${len} chars${titleCredit === 1 ? " (ideal 50–60)" : len < 50 ? " — too short (aim for 50–60)" : " — too long, will be truncated (aim for 50–60)"}`);
      if (titleCredit < 1) fixes.push(len < 50 ? "Expand the title to 50–60 characters with the primary keyword." : "Shorten the title to 60 characters or fewer, keeping the primary keyword near the front.");
    }

    let descriptionCredit = 0;
    if (!description) {
      details.push("Description: missing");
      fixes.push('Write a 120–160 character description in the "Meta Description" field that summarises the page.');
    } else {
      const len = description.length;
      descriptionCredit = len >= 120 && len <= 160 ? 1 : 0.5;
      details.push(`Description: ${len} chars${descriptionCredit === 1 ? " (ideal 120–160)" : len < 120 ? " — too short, Google may replace it" : " — too long, will be truncated"}`);
      if (descriptionCredit < 1) fixes.push(len < 120 ? `Expand the description from ${len} to at least 120 characters.` : `Shorten the description from ${len} to 160 characters or fewer.`);
    }

    const credit = (titleCredit + descriptionCredit) / 2;
    return scored(
      credit,
      `Title ${title ? `${title.length} chars` : "missing"} · description ${description ? `${description.length} chars` : "missing"}`,
      credit === 1
        ? "Title and meta description are set and within the ideal lengths."
        : !title || !description
          ? "The page is missing its title or meta description."
          : "Title or meta description is outside the ideal length.",
      {
        status: credit === 1 ? "pass" : !title || !description ? "fail" : "warning",
        fixSuggestion: fixes.join(" "),
        details,
      },
    );
  },
};

// ── P10 — understand.json-ld ──────────────────────────────────────────────────

interface Expectation {
  label: string;
  matches(node: JsonLdNode): boolean;
  /** Missing required properties; empty when valid. */
  missing(node: JsonLdNode): string[];
  snippet(): string;
}

function breadcrumbMissing(node: JsonLdNode): string[] {
  const items = listProp(node.data, "itemListElement");
  if (items.length === 0) return ["itemListElement"];
  const bad = items.filter((i) => {
    if (!isObject(i) || i.position === undefined) return true;
    return !stringProp(i, "name") && !(isObject(i.item) && stringProp(i.item, "name"));
  });
  return bad.length > 0 ? [`position and name on ${bad.length} of ${items.length} list items`] : [];
}

function faqMissing(node: JsonLdNode): string[] {
  const questions = listProp(node.data, "mainEntity");
  if (questions.length === 0) return ["mainEntity"];
  const bad = questions.filter((q) => {
    if (!isObject(q) || !stringProp(q, "name")) return true;
    const answers = listProp(q, "acceptedAnswer");
    return !answers.some((a) => isObject(a) && stringProp(a, "text"));
  });
  return bad.length > 0 ? [`name and acceptedAnswer.text on ${bad.length} of ${questions.length} questions`] : [];
}

function articleMissing(node: JsonLdNode): string[] {
  return stringProp(node.data, "headline") || stringProp(node.data, "name") ? [] : ["headline"];
}

/** P10 — real JSON-LD detection; replaces aeo-structured-data and aeo-faq-schema (D2). */
export const jsonLd: CheckDef<PageContext> = {
  id: "understand.json-ld",
  ref: "P10",
  title: "Structured data is present and valid",
  why: "JSON-LD tells agents exactly what the page is (an article, a set of answers, its place in the site) without guessing.",
  category: "understand",
  tier: "essential",
  scope: "page",
  sources: ["live"],
  owner: "developer",
  fix: "copy-snippet",
  applies: () => true,
  run(ctx) {
    const { html, pageUrl, isHomePage, templateName, organization } = ctx;
    if (!html) return htmlNotScanned();

    const nodes = collectNodes(html.jsonLdScripts);
    const errors = parseErrors(html.jsonLdScripts);
    const expectations: Expectation[] = [];

    if (!isHomePage) {
      expectations.push({
        label: "BreadcrumbList",
        matches: (n) => hasType(n, "BreadcrumbList"),
        missing: breadcrumbMissing,
        snippet: () => buildBreadcrumbJsonLd(pageUrl).script,
      });
    }
    if (html.qaPairs.length >= 2) {
      expectations.push({
        label: "FAQPage",
        matches: (n) => hasType(n, "FAQPage"),
        missing: faqMissing,
        snippet: () => buildFaqPageJsonLd(html.qaPairs),
      });
    }
    if (isArticleTemplate(templateName)) {
      expectations.push({
        label: "Article",
        matches: isArticle,
        missing: articleMissing,
        snippet: () =>
          buildArticleJsonLd({
            pageUrl,
            headline: html.headings.find((h) => h.level === 1)?.text ?? html.title,
            author: html.metaAuthor,
            datePublished: null,
            dateModified: html.articleModifiedTimeMeta,
            image: html.ogImage,
            publisher: organization,
          }),
      });
    }

    const errorDetails = errors.map((e, i) => `JSON-LD block ${i + 1} doesn't parse: ${e}`);
    const found = Array.from(new Set(nodes.flatMap((n) => n.types)));
    const foundDetail = found.length > 0 ? [`Found: ${found.join(", ")}`] : [];

    if (expectations.length === 0) {
      if (errors.length === 0) {
        return notApplicable(
          found.length > 0 ? found.join(", ") : "None expected",
          "No page-level structured data is expected here (no breadcrumb, FAQ or article schema applies). The site's Organization schema is a site check.",
          { details: foundDetail },
        );
      }
      return scored(0.5, `${errors.length} block${errors.length > 1 ? "s" : ""} broken`, "A JSON-LD block on this page doesn't parse, so agents ignore it.", {
        status: "fail",
        fixSuggestion: "Fix the JSON syntax of the broken block (validate it at validator.schema.org).",
        details: [...errorDetails, ...foundDetail],
      });
    }

    const rows = expectations.map((exp) => {
      const candidates = nodes.filter(exp.matches);
      if (candidates.length === 0) return { exp, credit: 0, line: `✗ ${exp.label}: missing` };
      const best = candidates.map((n) => exp.missing(n)).sort((a, b) => a.length - b.length)[0];
      return best.length === 0
        ? { exp, credit: 1, line: `✓ ${exp.label}: present and valid` }
        : { exp, credit: 0.5, line: `⚠ ${exp.label}: missing ${best.join(", ")}` };
    });

    let credit = rows.reduce((s, r) => s + r.credit, 0) / rows.length;
    if (errors.length > 0) credit = Math.min(credit, 0.5);

    const toFix = rows.filter((r) => r.credit < 1);
    const ok = rows.length - toFix.length;
    return scored(
      credit,
      `${ok} of ${rows.length} expected schema${rows.length > 1 ? "s" : ""} valid`,
      errors.length > 0
        ? "A JSON-LD block on this page doesn't parse, so agents ignore it."
        : toFix.length === 0
          ? "The structured data this page needs is present and valid."
          : `Missing or incomplete: ${toFix.map((r) => r.exp.label).join(", ")}. Add the snippet below to the page template.`,
      {
        status: errors.length > 0 ? "fail" : undefined,
        fixSuggestion:
          errors.length > 0
            ? "Fix the JSON syntax of the broken block (validate it at validator.schema.org)."
            : toFix.length > 0
              ? "Add the JSON-LD below to the page template (or complete the existing block), then validate it with Google's Rich Results Test."
              : "",
        details: [...rows.map((r) => r.line), ...errorDetails, ...foundDetail],
        codePreview: toFix.length > 0 ? toFix.map((r) => r.exp.snippet()).join("\n\n") : undefined,
      },
    );
  },
};

/** P11 — extends seo-og-tags with html lang and og:type */
export const metadata: CheckDef<PageContext> = {
  id: "understand.metadata",
  ref: "P11",
  title: "Page identity metadata is complete",
  why: "Language and Open Graph tags tell agents what the page is, in which language, and how to preview it.",
  category: "understand",
  tier: "recommended",
  scope: "page",
  sources: ["live"],
  owner: "author",
  fix: "generate",
  applies: () => true,
  run({ html }) {
    if (!html) return htmlNotScanned();

    const items = [
      { label: "html lang", value: html.htmlLang },
      { label: "og:type", value: html.ogType },
      { label: "og:title", value: html.ogTitle },
      { label: "og:description", value: html.ogDescription },
      { label: "og:image", value: html.ogImage },
    ];
    const missing = items.filter((i) => !i.value);
    const present = items.length - missing.length;

    return scored(
      present / items.length,
      `${present} of ${items.length} set`,
      missing.length === 0 ? "Language and Open Graph metadata are complete." : `Missing: ${missing.map((i) => i.label).join(", ")}`,
      {
        status: missing.length === 0 ? "pass" : present >= 3 ? "warning" : "fail",
        fixSuggestion:
          missing.length === 0
            ? ""
            : "Set the missing Open Graph fields on the page. A missing html lang or og:type is set in the page template (developer).",
        details: items.map((i) => `${i.label}: ${i.value ? `✓ ${i.value}` : "✗ missing"}`),
      },
    );
  },
};

/** P12 — was aeo-faq-answer-quality; now finds Q&A in any component */
export const faqQuality: CheckDef<PageContext> = {
  id: "understand.faq-quality",
  ref: "P12",
  title: "FAQ answers are quotable",
  why: "Agents quote FAQ answers word for word, so each one has to stand alone at a quotable length.",
  category: "understand",
  tier: "recommended",
  scope: "page",
  sources: ["draft"],
  owner: "author",
  applies: () => true,
  run({ body: html }) {
    if (!html) return htmlNotScanned();
    const pairs = html.qaPairs;
    if (pairs.length === 0) {
      return notApplicable("No FAQ found", "No question-and-answer pairs (accordion or <details>) on this page.");
    }

    const flagged: string[] = [];
    let valid = 0;
    for (const { question, answer } of pairs) {
      const len = answer.length;
      if (len < 40) flagged.push(`"${question.slice(0, 60)}" — answer too short (${len} chars; at least 40 for a useful citation)`);
      else if (len > 300) flagged.push(`"${question.slice(0, 60)}" — answer too long (${len} chars; at most 300 for focused extraction)`);
      else valid++;
    }

    const credit = valid / pairs.length;
    return scored(
      credit,
      `${valid} of ${pairs.length} answers meet the criteria`,
      credit === 1
        ? `All ${pairs.length} answers are 40–300 characters. AI assistants use answers like these word for word.`
        : `${pairs.length - valid} of ${pairs.length} answers need attention. Criteria: 40–300 characters, a direct, self-contained response.`,
      {
        status: credit === 1 ? "pass" : credit >= 0.6 ? "warning" : "fail",
        fixSuggestion: credit === 1 ? "" : "Edit the flagged answers to 40–300 characters, and make each one stand alone without repeating the question.",
        flaggedItems: flagged.length > 0 ? flagged : undefined,
      },
    );
  },
};

/** P13 — was aeo-question-headings (disabled); now scored */
export const questionHeadings: CheckDef<PageContext> = {
  id: "understand.question-headings",
  ref: "P13",
  title: "Sections answer real questions",
  why: "People ask agents questions; sections headed by the question they answer are easy to match and cite.",
  category: "understand",
  tier: "recommended",
  scope: "page",
  sources: ["draft"],
  owner: "author",
  fix: "generate",
  applies: () => true,
  run({ body: html }) {
    if (!html) return htmlNotScanned();
    const h2s = html.headings.filter((h) => h.level === 2);
    if (h2s.length === 0) return notApplicable("No H2 headings", "No H2 headings on the page to analyse.");

    const questions = h2s.filter((h) => QUESTION_REGEX.test(h.text.trim()) || h.text.trim().endsWith("?"));
    const ratio = questions.length / h2s.length;
    const credit = questions.length >= 3 || ratio >= 0.5 ? 1 : questions.length >= 1 ? 0.5 : 0;

    return scored(
      credit,
      `${questions.length} of ${h2s.length} H2s are questions (${Math.round(ratio * 100)}%)`,
      credit === 1
        ? "Sections are headed by the questions they answer."
        : "Consider phrasing section headings as the questions readers ask, where it's natural — don't restructure content purely to hit a number.",
      {
        status: credit === 1 ? "pass" : "warning",
        fixSuggestion: credit === 1 ? "" : "Rephrase some H2s as questions (What…, How…, Why…) that the section answers.",
        details: questions.map((h) => h.text),
      },
    );
  },
};

/** P14 — merges cq-reading-grade with the matrix's paragraph length */
export const readability: CheckDef<PageContext> = {
  id: "understand.readability",
  ref: "P14",
  title: "Easy to read and quote",
  why: "Dense prose is summarised and quoted less accurately by AI answer engines, and is harder for readers to scan.",
  category: "understand",
  tier: "recommended",
  scope: "page",
  sources: ["draft"],
  owner: "author",
  applies: () => true,
  run({ body: html }) {
    if (!html) return htmlNotScanned();
    const paragraphs = html.paragraphs;
    if (paragraphs.length === 0) return notApplicable("No paragraphs", "No paragraphs in the page content to grade.");

    const explanation = [
      "Reading grade (half the credit): each paragraph of 20+ words is scored with the Automated Readability Index (ARI) = 4.71 × (characters ÷ words) + 0.5 × (words ÷ sentences) − 21.43. Target: grade ≤ 13. Credit is the share of paragraphs that meet it.",
      "Paragraph length (the other half): average 40–120 words per paragraph for full credit, 20–200 for half.",
    ];

    const eligible = paragraphs.filter((p) => wordCount(p) >= 20);
    const graded = eligible.map((text) => ({ text, grade: ari(text) }));
    const failing = graded.filter((g) => g.grade > 13);
    const gradeCredit = graded.length === 0 ? 1 : (graded.length - failing.length) / graded.length;

    const avg = paragraphs.reduce((s, p) => s + wordCount(p), 0) / paragraphs.length;
    const lengthCredit = avg >= 40 && avg <= 120 ? 1 : avg >= 20 && avg <= 200 ? 0.5 : 0;

    const credit = (gradeCredit + lengthCredit) / 2;
    return scored(
      credit,
      `${graded.length - failing.length} of ${graded.length} paragraphs at grade ≤ 13 · ${Math.round(avg)} words per paragraph on average`,
      credit === 1
        ? "Paragraphs are readable and a quotable length."
        : failing.length > 0
          ? `${failing.length} paragraph${failing.length > 1 ? "s" : ""} exceed grade 13. Complex prose is paraphrased poorly by AI retrieval systems.`
          : "Paragraphs are outside the 40–120 word range that AI answers quote best.",
      {
        status: credit === 1 ? "pass" : credit >= 0.75 ? "warning" : "fail",
        fixSuggestion:
          credit === 1 ? "" : "Simplify the flagged paragraphs (shorter sentences, plain words, active voice) and keep paragraphs to about 40–120 words.",
        details: explanation,
        flaggedItems: failing.length > 0 ? failing.map((g) => `Grade ${Math.round(g.grade)}: "${g.text.slice(0, 60)}…"`) : undefined,
      },
    );
  },
};

/** P15 — was seo-image-alt */
export const imageAlt: CheckDef<PageContext> = {
  id: "understand.image-alt",
  ref: "P15",
  title: "Images are described",
  why: "Agents can't see images; alt text is the only way they learn what an image shows.",
  category: "understand",
  tier: "recommended",
  scope: "page",
  sources: ["draft"],
  owner: "author",
  fix: "generate",
  applies: () => true,
  run({ body: html }) {
    if (!html) return htmlNotScanned();
    const images = html.images;
    if (images.length === 0) return notApplicable("No images on page", "No images found — nothing to check.");

    const missing = images.filter((img) => !img.alt || img.alt.trim() === "");
    const credit = (images.length - missing.length) / images.length;
    return scored(
      credit,
      `${images.length - missing.length} of ${images.length} images have alt text`,
      missing.length === 0 ? "All images have alt text." : `${missing.length} image${missing.length > 1 ? "s" : ""} missing alt text.`,
      {
        status: missing.length === 0 ? "pass" : missing.length < images.length ? "warning" : "fail",
        fixSuggestion: missing.length === 0 ? "" : "Add descriptive alt text to the image field of each component listed below.",
        details: missing.map((img) => `Missing alt: ${imageFileName(img.src)}`),
      },
    );
  },
};

export const UNDERSTAND_PAGE_CHECKS = [
  headings,
  titleMeta,
  jsonLd,
  metadata,
  faqQuality,
  questionHeadings,
  readability,
  imageAlt,
];
