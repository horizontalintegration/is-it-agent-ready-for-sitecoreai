// Page checks — Trust: will they trust and cite it?

import { daysSince, isGenericAnchor, parseDate, wordCount } from "@/lib/rule-engine/helpers";
import { isArticleTemplate } from "../context";
import { collectNodes, isArticle, listProp, resolve, stringProp } from "../json-ld";
import { htmlNotScanned, notApplicable, notChecked, scored } from "../result";
import type { CheckDef, PageContext } from "../types";

/** P16 — was cq-uniqueness. The AI reads the page's main text (D1). */
export const uniqueness: CheckDef<PageContext> = {
  id: "trust.uniqueness",
  ref: "P16",
  title: "Content is original, not generic",
  why: "Agents cite the source that adds something; content that repeats what's everywhere else is rarely chosen.",
  category: "trust",
  tier: "recommended",
  scope: "page",
  sources: ["ai"],
  owner: "author",
  applies: () => true,
  run({ ai }) {
    if (!ai) return notChecked("Not yet analysed", "Run a scan to analyse content uniqueness with AI.");

    const credit = ai.uniquenessRating === "unique" ? 1 : ai.uniquenessRating === "borderline" ? 0.5 : 0;
    return scored(credit, ai.uniquenessRating.charAt(0).toUpperCase() + ai.uniquenessRating.slice(1), ai.uniquenessExplanation, {
      fixSuggestion:
        credit === 1
          ? ""
          : credit === 0.5
            ? "Strengthen the unique perspective — add first-hand experience, original data, or expert insight not available elsewhere."
            : "This content reads as commodity — it summarises information already widely available. Add original research, unique perspective, or first-hand experience to differentiate.",
    });
  },
};

interface AuthorSignal {
  name: string | null;
  url: string | null;
  source: string;
}

function authorFromJsonLd(ctx: PageContext): AuthorSignal | null {
  const nodes = collectNodes(ctx.html?.jsonLdScripts ?? []);
  for (const article of nodes.filter(isArticle)) {
    for (const raw of listProp(article.data, "author")) {
      if (typeof raw === "string" && raw.trim()) return { name: raw.trim(), url: null, source: "Article JSON-LD" };
      const node = resolve(raw, nodes);
      if (!node) continue;
      const sameAs = listProp(node.data, "sameAs").find((s): s is string => typeof s === "string");
      return {
        name: stringProp(node.data, "name"),
        url: stringProp(node.data, "url") ?? sameAs ?? null,
        source: "Article JSON-LD",
      };
    }
  }
  return null;
}

/** P17 — was cq-author (disabled). Article templates only. */
export const author: CheckDef<PageContext> = {
  id: "trust.author",
  ref: "P17",
  title: "Author is named and linked",
  why: "A named author with a profile page lets agents judge expertise before citing an article.",
  category: "trust",
  tier: "recommended",
  scope: "page",
  sources: ["live"],
  owner: "author",
  applies: (ctx) => isArticleTemplate(ctx.templateName),
  run(ctx) {
    const { html } = ctx;
    if (!html) return htmlNotScanned();

    const fromJsonLd = authorFromJsonLd(ctx);
    const name = fromJsonLd?.name ?? html.metaAuthor;
    const url = fromJsonLd?.url ?? html.relAuthorHref;
    const details = [
      `Article JSON-LD author: ${fromJsonLd?.name ?? "—"}${fromJsonLd?.url ? ` (${fromJsonLd.url})` : ""}`,
      `<meta name="author">: ${html.metaAuthor ?? "—"}`,
      `rel="author" link: ${html.relAuthorHref ?? "—"}`,
    ];

    if (!name) {
      return scored(0, "No author found", "No author is named on the page. AI engines prioritise attributed, first-hand content.", {
        fixSuggestion: "Show the author's name on the article and add it to the Article JSON-LD (author.name and author.url).",
        details,
      });
    }
    if (url) {
      return scored(1, `${name} (profile linked)`, "The author is named and linked to a profile — a strong expertise signal for AI systems.", {
        details,
      });
    }
    return scored(0.5, `${name} (no profile link)`, "The author is named but not linked to a profile page.", {
      fixSuggestion: "Link the author to a profile page: add author.url to the Article JSON-LD, or a rel=\"author\" link.",
      details,
    });
  },
};

/** P18 — was cq-freshness (disabled), using the matrix's sources and bands. */
export const freshness: CheckDef<PageContext> = {
  id: "trust.freshness",
  ref: "P18",
  title: "Content is recently updated",
  why: "AI retrieval favours recently updated pages, especially on fast-moving topics.",
  category: "trust",
  tier: "recommended",
  scope: "page",
  sources: ["live", "fields"],
  owner: "author",
  applies: () => true,
  run({ html, fields }) {
    if (!html && !fields?.updated) return htmlNotScanned();

    const jsonLdModified = collectNodes(html?.jsonLdScripts ?? [])
      .map((n) => stringProp(n.data, "dateModified"))
      .find(Boolean);

    // What agents read first; Sitecore's __Updated is the fallback.
    const candidates: Array<[string, string | null | undefined]> = [
      ['<meta property="article:modified_time">', html?.articleModifiedTimeMeta],
      ["JSON-LD dateModified", jsonLdModified],
      ['<meta name="last-modified">', html?.lastModifiedMeta],
      ["Sitecore __Updated", fields?.updated],
    ];
    const found = candidates
      .map(([source, raw]) => ({ source, date: parseDate(raw) }))
      .find((c) => c.date !== null);

    if (!found?.date) {
      return scored(0, "No date found", "No modified date was found, so agents can't tell how current the page is.", {
        fixSuggestion: 'Render a <meta property="article:modified_time"> tag, or dateModified in the JSON-LD.',
      });
    }

    const days = daysSince(found.date);
    const credit = days <= 180 ? 1 : days <= 365 ? 0.6 : days <= 730 ? 0.25 : 0;
    const label = `Updated ${found.date.toISOString().slice(0, 10)} (${days} days ago)`;
    return scored(
      credit,
      label,
      credit === 1
        ? "Content was updated in the last six months."
        : credit > 0
          ? "Content is getting old — consider reviewing and updating it."
          : `Content is ${Math.floor(days / 365)} years old. Stale content is down-weighted by AI retrieval.`,
      {
        status: credit === 1 ? "pass" : credit >= 0.25 ? "warning" : "fail",
        fixSuggestion: credit === 1 ? "" : "Review and refresh the content, then republish so the modified date updates.",
        details: [`Source: ${found.source}`],
      },
    );
  },
};

/** P19 — word count, from the matrix */
export const depth: CheckDef<PageContext> = {
  id: "trust.depth",
  ref: "P19",
  title: "Enough depth to be cited",
  why: "Thin pages rarely hold a complete answer, so agents look elsewhere.",
  category: "trust",
  tier: "recommended",
  scope: "page",
  sources: ["live"],
  owner: "author",
  applies: () => true,
  run({ html }) {
    if (!html) return htmlNotScanned();
    const words = html.paragraphs.reduce((s, p) => s + wordCount(p), 0);
    const credit = words >= 800 ? 1 : words >= 400 ? 2 / 3 : words >= 150 ? 1 / 3 : 0;
    return scored(
      credit,
      `${words} words of body text`,
      credit === 1 ? "The page has enough depth to answer questions fully." : "The page is short; thin content is rarely cited.",
      {
        status: credit === 1 ? "pass" : credit > 0 ? "warning" : "fail",
        fixSuggestion: credit === 1 ? "" : "Expand the page with the detail readers need (aim for 800+ words where the topic warrants it).",
        details: ["Full credit at 800+ words, two thirds at 400+, one third at 150+."],
      },
    );
  },
};

/** P20 — was seo-anchor-text (info only); now scored */
export const anchorText: CheckDef<PageContext> = {
  id: "trust.anchor-text",
  ref: "P20",
  title: "Links say where they go",
  why: "Descriptive link text tells agents what the linked page is about before they follow it.",
  category: "trust",
  tier: "recommended",
  scope: "page",
  sources: ["live"],
  owner: "author",
  applies: () => true,
  run({ html }) {
    if (!html) return htmlNotScanned();
    if (html.links.length === 0) return notApplicable("No links", "No links in the page content to check.");

    const generic = html.links.filter((l) => isGenericAnchor(l.anchorText));
    const ratio = generic.length / html.links.length;
    const credit = ratio <= 0.2 ? 1 : ratio <= 0.4 ? 0.5 : 0;
    return scored(
      credit,
      generic.length === 0 ? "No generic anchors found" : `${generic.length} of ${html.links.length} links are generic`,
      generic.length === 0
        ? "All link anchor texts appear descriptive."
        : `${generic.length} link${generic.length > 1 ? "s" : ""} use generic anchor text (e.g. "click here", "read more").`,
      {
        status: generic.length === 0 ? "pass" : credit > 0 ? "warning" : "fail",
        fixSuggestion: generic.length === 0 ? "" : "Replace generic anchors with text that says where the link goes.",
        details: ["Full credit when at most 20% of links are generic, half at 40%."],
        flaggedItems: generic.length > 0 ? generic.map((l) => `"${l.anchorText}"`) : undefined,
      },
    );
  },
};

/** P21 — was cq-followup-gaps (disabled). Bonus. */
export const followUpGaps: CheckDef<PageContext> = {
  id: "trust.follow-up-gaps",
  ref: "P21",
  title: "Answers the next question too",
  why: "Agents prefer sources that also cover the obvious follow-up questions.",
  category: "trust",
  tier: "bonus",
  scope: "page",
  sources: ["ai"],
  owner: "author",
  applies: () => true,
  run({ ai }) {
    if (!ai) return notChecked("Not yet analysed", "Run a scan to identify follow-up questions with AI.");
    const gaps = ai.followUpGaps;
    if (gaps.length === 0) return notApplicable("No follow-up questions", "The AI found no follow-up questions to check.");

    const covered = gaps.filter((g) => g.covered).length;
    return scored(
      covered / gaps.length,
      `${covered} of ${gaps.length} follow-up questions answered`,
      covered === gaps.length
        ? "The page also answers the likely follow-up questions."
        : `${gaps.length - covered} likely follow-up question${gaps.length - covered > 1 ? "s are" : " is"} not covered. Add content only where it's genuinely useful to readers.`,
      {
        status: covered === gaps.length ? "pass" : "warning",
        details: [
          ...gaps.filter((g) => !g.covered).map((g) => `✗ Not covered: ${g.question}`),
          ...gaps.filter((g) => g.covered).map((g) => `✓ Covered: ${g.question}`),
        ],
      },
    );
  },
};

export const TRUST_PAGE_CHECKS = [uniqueness, author, freshness, depth, anchorText, followUpGaps];
