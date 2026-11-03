import type { BodyBlock, PageData, ParsedHtml } from "./types";
import type { PageMatrixRow } from "@/types/dashboard";
import type { DraftHtml, SiteContext } from "@/lib/checks/types";
import { BOTS } from "@/lib/agent-access/bots";
import type { AgentAccessData, BotAccess, HttpProbe, SamplePage } from "@/lib/agent-access/types";
import { WELL_KNOWN_PATHS } from "@/lib/agent-access/well-known";
import { buildPageContext } from "@/lib/checks/context";
import { runPageChecks } from "@/lib/checks/engine";
import { summarisePageReport } from "@/lib/checks/view-model";
import { estimateTokens, toAgentMarkdown } from "@/lib/markdown/convert";
import type { MarkdownCheckData } from "@/lib/markdown/types";
import { botGrid } from "@/lib/agent-access/grid";
import type { CitationDemo, ProbeEvidence } from "@/lib/citations/types";
import { accessSnapshot, scanSnapshot, type AccessSnapshot, type ScanSnapshot, type WhatChangedInput } from "@/lib/history/what-changed";

const SITE_DOMAIN = "https://example.com";
const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** Sitecore's compact date format, as __Updated comes back from authoring GraphQL. */
const sitecoreDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const script = (value: unknown) => ({ ok: true as const, value });

// BrandX is demo data only; real sites use NEXT_PUBLIC_ORG_* (src/lib/brand/organization.ts).
const BRANDX_ORGANIZATION: PageData["organization"] = {
  name: "BrandX",
  url: "https://blueprint-brandx.horizontaldigital.com/",
  logo: "https://blueprint-brandx.horizontaldigital.com/logo.png",
  description:
    "At BrandX, our advisors craft custom financial strategies to match your goals, risk tolerance, and timeline. With over two decades of expertise and a client-first approach, we help you invest smarter, retire better, and grow confidently.",
  sameAs: [
    "https://www.linkedin.com/company/brandx",
    "https://twitter.com/brandx",
    "https://www.instagram.com/brandx",
    "https://www.facebook.com/brandx",
    "https://www.pinterest.com/brandx",
    "https://www.youtube.com/brandx",
    "https://www.tiktok.com/brandx",
  ],
};

/** A blank rendered page; tests and fixtures override what they need. */
export function makeParsedHtml(overrides: Partial<ParsedHtml> = {}): ParsedHtml {
  return {
    title: null,
    metaDescription: null,
    lastModifiedMeta: null,
    articleModifiedTimeMeta: null,
    headings: [],
    images: [],
    links: [],
    paragraphs: [],
    mainText: "",
    bodyBlocks: [],
    htmlLang: null,
    canonicalHref: null,
    robotsMeta: null,
    googlebotMeta: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogType: null,
    metaAuthor: null,
    relAuthorHref: null,
    jsonLdScripts: [],
    qaPairs: [],
    hasMain: false,
    hasArticle: false,
    hasNav: false,
    hasHeader: false,
    interactiveElementsMissingLabel: 0,
    ...overrides,
  };
}

const FAQ = [
  {
    question: "How long should a content strategy take to develop?",
    answer:
      "Most teams need 4-6 weeks to develop a meaningful content strategy. This includes an audit, audience research, and initial content roadmap.",
  },
  {
    question: "Do I need separate strategies for SEO and AEO?",
    answer:
      "No. A modern strategy treats them as overlapping surfaces of the same content programme — but acknowledges each has different format requirements.",
  },
];

// data-component values, BrandX style, so P3 can name the component.
const COMPONENT = {
  header: "authorable/shared/header",
  content: "authorable/page-content/richtext",
  accordion: "authorable/shared/lists/accordion",
  related: "authorable/articles/relatedarticles",
  footer: "authorable/shared/footer",
};

const block = (component: string) => (text: string): BodyBlock => ({ text, component });

/** Every text block of the demo page's <body>, header and footer included. */
function bodyBlocksFor(mainText: string): BodyBlock[] {
  return [
    ...["BrandX", "Services", "Insights", "About", "Contact"].map(block(COMPONENT.header)),
    ...mainText.split("\n").map(block(COMPONENT.content)),
    ...FAQ.flatMap((f) => [f.question, f.answer]).map(block(COMPONENT.accordion)),
    ...["© BrandX. All rights reserved.", "Privacy policy", "Terms of use"].map(block(COMPONENT.footer)),
  ];
}

export function makeTestPageData(): PageData {
  const pageUrl = `${SITE_DOMAIN}/blog/how-to-build-an-effective-content-strategy`;
  const title = "How to build an effective content strategy in 2026";
  const description =
    "A practical guide to building a content strategy that delivers measurable results across SEO, AEO and AI search channels.";
  const paragraphs = [
    "Content strategy is the planning, development, and management of content for a business or brand. A solid strategy aligns content to business goals, audience needs, and channel requirements.",
    "Modern content strategies must account for traditional search, answer engines, and AI-driven retrieval systems. Each surface has different relevance signals and content formats.",
    "Start by auditing your existing content. Identify gaps, duplicates, and pages that under-perform. Use that audit to prioritise where to invest in new content vs refreshes.",
  ];
  const headings = [
    { level: 1, text: title },
    { level: 2, text: "What is a content strategy?" },
    { level: 2, text: "Why does it matter?" },
    { level: 2, text: "Building your audit framework" },
    { level: 3, text: "Step 1: Map your existing pages" },
    { level: 3, text: "Step 2: Score for relevance" },
  ];
  const mainText = [title, "What is a content strategy?", paragraphs[0], "Why does it matter?", paragraphs[1],
    "Building your audit framework", "Step 1: Map your existing pages", "Step 2: Score for relevance", paragraphs[2]].join("\n");

  return {
    pageUrl,
    route: "/blog/how-to-build-an-effective-content-strategy",
    templateName: "Article Detail Page",
    organization: BRANDX_ORGANIZATION,
    authoring: {
      pageTitle: title,
      metaDescription: description,
      ogTitle: title,
      ogDescription: "A practical guide to building a content strategy that delivers measurable results.",
      ogImage: `${SITE_DOMAIN}/images/hero.jpg`,
      author: "Jane Smith",
      authorProfileLinked: false,
      publishDate: daysAgo(400),
      lastUpdatedDate: daysAgo(400),
      noIndexField: false,
      richTextParagraphs: paragraphs,
      richTextFull: paragraphs.join(" "),
      images: [],
      links: [],
      headings: [],
      faqItems: FAQ,
      hasFaqComponent: true,
      hasHowToComponent: false,
    },
    fields: {
      metaTitle: title,
      metaDescription: description,
      robotsMetaTag: "index, follow",
      updated: sitecoreDate(daysAgo(60)),
    },
    parsedHtml: makeParsedHtml({
      title,
      metaDescription: description,
      articleModifiedTimeMeta: daysAgo(60).toISOString(),
      headings,
      images: [
        { src: `${SITE_DOMAIN}/images/hero.jpg`, alt: "Team collaborating around a whiteboard" },
        { src: `${SITE_DOMAIN}/images/inline-figure-1.jpg`, alt: null }, // missing alt
        { src: `${SITE_DOMAIN}/images/inline-figure-2.jpg`, alt: "Content workflow diagram" },
      ],
      links: [
        { anchorText: "the content audit guide", href: "/blog/content-audit" },
        { anchorText: "click here", href: "/contact" }, // generic
        { anchorText: "our 2026 SEO playbook", href: "/blog/seo-playbook-2026" },
      ],
      paragraphs,
      mainText,
      bodyBlocks: bodyBlocksFor(mainText),
      htmlLang: "en",
      canonicalHref: pageUrl,
      robotsMeta: "index, follow",
      ogTitle: title,
      ogDescription: "A practical guide to building a content strategy that delivers measurable results.",
      ogImage: `${SITE_DOMAIN}/images/hero.jpg`,
      ogType: null, // missing → P11 warning
      metaAuthor: "Jane Smith", // named, no profile link → P17 warning
      // FAQPage and BreadcrumbList are valid; Article schema is missing → P10 warning + snippet
      jsonLdScripts: [
        script({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }),
        script({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_DOMAIN}/` },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_DOMAIN}/blog` },
            { "@type": "ListItem", position: 3, name: title, item: pageUrl },
          ],
        }),
      ],
      qaPairs: FAQ,
      hasMain: true,
      hasArticle: true,
      hasNav: true,
      hasHeader: true,
    }),
    psi: {
      performanceScore: 62,
      isCrawlable: true,
      coreWebVitals: ["LCP: 3.2 s", "FCP: 1.4 s", "TBT: 210 ms", "CLS: 0.08", "Speed Index: 3.8 s"],
      opportunities: [
        "Reduce unused JavaScript — Potential savings of 890 ms",
        "Eliminate render-blocking resources — Potential savings of 640 ms",
        "Properly size images — Potential savings of 420 ms",
      ],
    },
    ai: {
      uniquenessRating: "borderline",
      uniquenessExplanation:
        "The article restates common content strategy advice with limited original perspective or first-hand examples.",
      followUpGaps: [
        { question: "How do I measure content ROI?", covered: false },
        { question: "What tools should I use for an audit?", covered: false },
        { question: "How often should I refresh content?", covered: true },
        { question: "Who should own content strategy in my org?", covered: false },
        { question: "How do I prioritise new vs refresh?", covered: true },
      ],
    },
  };
}

// The draft edits one heading. Related-article cards are fetched in the
// browser, as on BrandX: they're in the draft but not in the server HTML.
const LIVE_H2 = "Why does it matter?";
const DRAFT_H2 = "Why does a content strategy matter?";
const RELATED = [
  {
    title: "Measuring content ROI without guesswork",
    summary: "Three metrics that tie content to pipeline.",
    href: "/blog/content-roi",
  },
  {
    title: "Refreshing old articles for AI search",
    summary: "When to update a page instead of writing a new one.",
    href: "/blog/refresh-for-ai",
  },
];

/**
 * The panel's demo draft (Page Builder `getPageHTML`, sanitised): the demo
 * page with one heading edited and client-rendered Related Articles cards,
 * so demo mode shows the source chips, the "Draft differs" banner and a P3
 * warning. The dashboard demo has no draft, as in Sitecore.
 */
export function makeTestDraft(): DraftHtml {
  const live = makeTestPageData().parsedHtml!;
  const edit = (s: string) => (s === LIVE_H2 ? DRAFT_H2 : s);
  const relatedText = ["Related articles", ...RELATED.flatMap((r) => [r.title, r.summary, "Read more"])];
  const footerAt = live.bodyBlocks.findIndex((b) => b.component === COMPONENT.footer);

  return {
    html: {
      ...live,
      headings: [
        ...live.headings.map((h) => ({ ...h, text: edit(h.text) })),
        { level: 2, text: "Related articles" },
        ...RELATED.map((r) => ({ level: 3, text: r.title })),
      ],
      links: [...live.links, ...RELATED.map((r) => ({ anchorText: "Read more", href: r.href }))],
      paragraphs: [...live.paragraphs, ...RELATED.map((r) => r.summary)],
      mainText: [...live.mainText.split("\n").map(edit), ...relatedText].join("\n"),
      bodyBlocks: [
        ...live.bodyBlocks.slice(0, footerAt).map((b) => ({ ...b, text: edit(b.text) })),
        ...relatedText.map(block(COMPONENT.related)),
        ...live.bodyBlocks.slice(footerAt),
      ],
    },
    source: makeTestPageSource({ draft: true }),
    emptyStates: [],
  };
}

// ── The demo page as HTML (Phase 7: the Agent View's Markdown) ────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The demo page's HTML, matching makeTestPageData's parsed HTML: published,
 * or as the sanitised Page Builder draft (edited heading, Related Articles
 * cards, and an empty head). The Agent View converts it to Markdown.
 */
export function makeTestPageSource({ draft = false }: { draft?: boolean } = {}): string {
  const d = makeTestPageData();
  const h = d.parsedHtml!;
  const heading = (text: string) => (draft && text === LIVE_H2 ? DRAFT_H2 : text);
  const [h1, ...sections] = h.headings;
  const para = (i: number) => `<p>${esc(h.paragraphs[i])}</p>`;
  const faq = FAQ.map(
    (f, i) =>
      `<div class="accordion-item"><button aria-controls="faq-${i}" aria-expanded="false">${esc(f.question)}</button>` +
      `<div id="faq-${i}" aria-hidden="true"><p>${esc(f.answer)}</p></div></div>`,
  ).join("");
  const related = draft
    ? `<section data-component="${COMPONENT.related}"><h2>Related articles</h2>${RELATED.map(
        (r) => `<div><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><a href="${r.href}">Read more</a></div>`,
      ).join("")}</section>`
    : "";
  const head = draft
    ? "<head></head>"
    : `<head><title>${esc(d.authoring.pageTitle ?? "")}</title><meta name="description" content="${esc(d.authoring.metaDescription ?? "")}">` +
      `<script>window.__NEXT_DATA__={}</script><style>body{margin:0}</style></head>`;
  return [
    `<!doctype html><html lang="en">${head}<body>`,
    `<header data-component="${COMPONENT.header}"><a href="/">BrandX</a><nav><ul>`,
    ["Services", "Insights", "About", "Contact"].map((n) => `<li><a href="/${n.toLowerCase()}">${n}</a></li>`).join(""),
    `</ul></nav></header>`,
    `<main><article data-component="${COMPONENT.content}">`,
    `<h1>${esc(h1.text)}</h1>`,
    `<img src="/images/hero.jpg" alt="Team collaborating around a whiteboard">`,
    `<h2>${esc(heading(sections[0].text))}</h2>${para(0)}`,
    `<h2>${esc(heading(sections[1].text))}</h2>${para(1)}`,
    `<h2>${esc(sections[2].text)}</h2><h3>${esc(sections[3].text)}</h3><h3>${esc(sections[4].text)}</h3>${para(2)}`,
    `<p>Read <a href="/blog/content-audit">the content audit guide</a> and <a href="/blog/seo-playbook-2026">our 2026 SEO playbook</a>.</p>`,
    `</article><section data-component="${COMPONENT.accordion}">${faq}</section>${related}</main>`,
    `<footer data-component="${COMPONENT.footer}"><p>© BrandX. All rights reserved.</p><a href="/privacy">Privacy policy</a> <a href="/terms">Terms of use</a></footer>`,
    `</body></html>`,
  ].join("");
}

/** A typical published page's weight: Next.js pages carry their data, scripts and styles. */
const DEMO_HTML_BYTES = 24_600;

/**
 * /api/markdown-check for the demo page. `serves: false` (the default, as in
 * the mockup): text/html for Accept: text/markdown, no Vary, and the preview
 * converted from the published HTML. `serves: true` (`?demo=1&md=1`): the
 * Markdown the page would serve, 4 of 4 checks.
 */
export function makeTestMarkdownCheck({ serves = false, pageUrl }: { serves?: boolean; pageUrl?: string } = {}): MarkdownCheckData {
  const d = makeTestPageData();
  const url = pageUrl ?? d.pageUrl;
  const source = makeTestPageSource();
  const html = {
    finalUrl: url,
    status: 200,
    error: null,
    contentType: "text/html; charset=utf-8",
    vary: null,
    bytes: DEMO_HTML_BYTES,
    tokens: estimateTokens("x".repeat(DEMO_HTML_BYTES)),
  };
  const converted = toAgentMarkdown(source, { title: d.fields.metaTitle, description: d.fields.metaDescription, url });
  if (serves) {
    return {
      url,
      checkedAt: new Date().toISOString(),
      markdown: {
        ...html,
        contentType: "text/markdown; charset=utf-8",
        vary: "Accept",
        bytes: converted.length,
        tokens: estimateTokens(converted),
        body: converted,
        truncated: false,
      },
      html: { ...html, vary: "Accept" },
      preview: null,
    };
  }
  return {
    url,
    checkedAt: new Date().toISOString(),
    markdown: { ...html, body: source.slice(0, 2_000), truncated: true },
    html,
    preview: { markdown: converted, tokens: estimateTokens(converted), truncated: false },
  };
}

/** The demo home page: BrandX-style, with no JSON-LD at all (as the real BrandX home page was on 2026-10-31). */
function makeTestHomeHtml(): ParsedHtml {
  return makeParsedHtml({
    title: "BrandX — Financial planning and wealth management",
    htmlLang: "en",
    headings: [{ level: 1, text: "Plan your financial future with BrandX" }],
    hasMain: true,
    hasNav: true,
    hasHeader: true,
  });
}

/**
 * Site checks for the demo: S7 shows "Not added yet" with a snippet, and the
 * agent-access scan is makeTestAgentAccess (ChatGPT-User and Perplexity-User
 * blocked by the firewall, GPTBot opted out in robots.txt).
 */
export function makeTestSiteContext({ servesMarkdown = false }: { servesMarkdown?: boolean } = {}): SiteContext {
  const data = makeTestPageData();
  return {
    siteUrl: SITE_DOMAIN,
    siteType: "content",
    organization: data.organization,
    expectedOrganization: { name: data.organization.name, url: data.organization.url },
    home: makeTestHomeHtml(),
    access: makeTestAgentAccess({ servesMarkdown }),
  };
}

// ── Agent access scan (Phase 6, plan section 10: the accept-when fixture) ─────
//
// As in the Symposium mockup: the firewall returns 403 to ChatGPT-User and
// Perplexity-User although robots.txt allows them; robots.txt opts GPTBot
// out of training; the home page returns HTML for Accept: text/markdown
// (Markdown with Vary: Accept for `servesMarkdown`, `?demo=1&md=1`); no
// llms.txt and no Content-Signal line; a 128-URL sitemap listed in
// robots.txt; about, contact and privacy pages all published.

const DEMO_HOME_MARKDOWN = `---
title: BrandX — Financial planning and wealth management
url: ${SITE_DOMAIN}/
---

# Plan your financial future with BrandX

- [Services](${SITE_DOMAIN}/services)
- [Insights](${SITE_DOMAIN}/insights)
`;

export const DEMO_ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /

Sitemap: ${SITE_DOMAIN}/sitemap.xml
`;

const DEMO_FIREWALL_BLOCKED = new Set(["ChatGPT-User", "Perplexity-User"]);

function demoProbe(path: string, status: number, extra: Partial<HttpProbe> = {}): HttpProbe {
  const url = `${SITE_DOMAIN}${path}`;
  return { url, finalUrl: url, status, error: null, contentType: "text/html; charset=utf-8", bytes: 0, ...extra };
}

export function makeTestAgentAccess({ servesMarkdown = false }: { servesMarkdown?: boolean } = {}): AgentAccessData {
  const pages: SamplePage[] = [
    { path: "/", browser: { ...demoProbe("/", 200, { bytes: 182_000 }), challenge: false } },
    { path: "/insights", browser: { ...demoProbe("/insights", 200, { bytes: 96_000 }), challenge: false } },
    { path: "/services", browser: { ...demoProbe("/services", 200, { bytes: 88_000 }), challenge: false } },
  ];
  const bots: BotAccess[] = BOTS.map((bot) => {
    if (!bot.userAgent) return { name: bot.name, skipped: "token-only", results: [] };
    if (bot.name === "GPTBot") return { name: bot.name, skipped: "robots", results: [] };
    const blocked = DEMO_FIREWALL_BLOCKED.has(bot.name);
    return {
      name: bot.name,
      skipped: null,
      results: pages.map((p) => ({ ...demoProbe(p.path, blocked ? 403 : 200, { bytes: blocked ? 1_200 : p.browser.bytes }), challenge: false })),
    };
  });
  const notFoundStatus = (path: string) => demoProbe(path, 404, { bytes: 9_000 });
  return {
    siteUrl: SITE_DOMAIN,
    checkedAt: new Date().toISOString(),
    durationMs: 11_400,
    requestCount: 49,
    robots: { probe: demoProbe("/robots.txt", 200, { contentType: "text/plain", bytes: DEMO_ROBOTS_TXT.length }), text: DEMO_ROBOTS_TXT },
    home: {
      probe: pages[0].browser,
      html: makeTestHomeHtml(),
      linkHeader: null,
      webMcp: false,
      footer: { hasAddress: true, hasContact: true, hasPrivacy: true, hasTerms: true, hasSecurity: false, hasAbout: true },
    },
    pages,
    bots,
    markdown: servesMarkdown
      ? {
          probe: demoProbe("/", 200, { contentType: "text/markdown; charset=utf-8", bytes: DEMO_HOME_MARKDOWN.length }),
          vary: "Accept",
          body: DEMO_HOME_MARKDOWN,
        }
      : {
          probe: demoProbe("/", 200, { bytes: 182_000 }),
          vary: null,
          body: "<!doctype html><html lang=\"en\"><head><title>BrandX</title></head><body>…</body></html>",
        },
    sitemap: {
      source: "robots",
      probe: demoProbe("/sitemap.xml", 200, { contentType: "application/xml", bytes: 21_000 }),
      kind: "urlset",
      urlCount: 128,
      lastmodCount: 128,
      childCount: 0,
      child: null,
    },
    llmsTxt: { probe: notFoundStatus("/llms.txt"), text: null },
    trustPages: [
      { kind: "about", href: `${SITE_DOMAIN}/about-us`, probe: demoProbe("/about-us", 200, { bytes: 64_000 }), textChars: 2_400 },
      { kind: "contact", href: `${SITE_DOMAIN}/contact-us`, probe: demoProbe("/contact-us", 200, { bytes: 58_000 }), textChars: 900 },
      { kind: "privacy", href: `${SITE_DOMAIN}/privacy-policy`, probe: demoProbe("/privacy-policy", 200, { bytes: 71_000 }), textChars: 4_100 },
    ],
    notFound: notFoundStatus("/agent-ready-check-demo"),
    wellKnown: WELL_KNOWN_PATHS.map(({ id, path }) => ({ id, path, probe: notFoundStatus(path), json: false, paymentInfo: false })),
  };
}

// ── Dashboard demo rows ───────────────────────────────────────────────────────
//
// Each row is the fixture page above with a few changes, scored by the real
// engine on live HTML only, as the dashboard does. "Blog: content strategy" is
// the panel's demo page unchanged; the panel also scores its draft
// (makeTestDraft), so its score there can differ.

type Variant = (d: PageData) => void;

const html = (d: PageData) => d.parsedHtml!;
const age = (days: number): Variant => (d) => {
  html(d).articleModifiedTimeMeta = daysAgo(days).toISOString();
  d.fields.updated = sitecoreDate(daysAgo(days));
};
const noJsonLd: Variant = (d) => { html(d).jsonLdScripts = []; };
const noCanonical: Variant = (d) => { html(d).canonicalHref = null; };
const noDescription: Variant = (d) => { d.fields.metaDescription = null; html(d).metaDescription = null; };
const shortTitle = (t: string): Variant => (d) => { d.fields.metaTitle = t; html(d).title = t; };
const twoH1s: Variant = (d) => { html(d).headings = [{ level: 1, text: "Welcome" }, ...html(d).headings]; };
const unique: Variant = (d) => { d.ai!.uniquenessRating = "unique"; };
const commodity: Variant = (d) => { d.ai!.uniquenessRating = "commodity"; };
const notArticle: Variant = (d) => { d.templateName = "Content Page"; };
const noFaq: Variant = (d) => {
  html(d).qaPairs = [];
  html(d).jsonLdScripts = html(d).jsonLdScripts.filter((s) => !(s.ok && JSON.stringify(s.value).includes("FAQPage")));
};
const withArticle: Variant = (d) => {
  html(d).jsonLdScripts.push(
    script({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: html(d).title,
      author: { "@type": "Person", name: "Jane Smith", url: `${SITE_DOMAIN}/authors/jane-smith` },
    }),
  );
  html(d).ogType = "article";
};
const noindex: Variant = (d) => { d.fields.robotsMetaTag = "noindex, follow"; };

interface FixtureRowInput {
  id: string;
  name: string;
  route: string;
  daysOld: number;
  variants: Variant[];
  description?: string;
  /** The page's template has no Meta Description field (Generate for all can't write it). */
  noMetaField?: boolean;
}

function buildRow(input: FixtureRowInput, servesMarkdown: boolean): PageMatrixRow {
  const data = makeTestPageData();
  const pageUrl = `${SITE_DOMAIN}${input.route}`;
  data.pageUrl = pageUrl;
  data.route = input.route;
  html(data).canonicalHref = pageUrl;
  for (const v of input.variants) v(data);

  const markdown = makeTestMarkdownCheck({ serves: servesMarkdown, pageUrl });
  const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml, markdown }));
  return {
    id: input.id,
    name: input.name,
    route: input.route,
    pageUrl,
    templateName: data.templateName ?? "",
    lastModified: daysAgo(input.daysOld).toISOString(),
    metaTitle: input.name,
    metaDescription: input.description ?? null,
    metaDescriptionField: input.noMetaField ? null : "MetaDescription",
    language: "en",
    fields: data.fields,
    score: summarisePageReport(report),
    scanStatus: "scanned",
    lastScannedAt: new Date().toISOString(),
  };
}

export function makeTestSitePages({ servesMarkdown = false }: { servesMarkdown?: boolean } = {}): PageMatrixRow[] {
  const rows: FixtureRowInput[] = [
    { id: "p1", name: "About", route: "/about", daysOld: 1200,
      variants: [notArticle, noFaq, noJsonLd, noCanonical, noDescription, commodity, age(1200)] },
    { id: "p2", name: "Legacy product page", route: "/products/legacy", daysOld: 900,
      variants: [notArticle, noFaq, noJsonLd, twoH1s, shortTitle("Legacy"), commodity, age(900)] },
    { id: "p3", name: "Empty draft", route: "/blog/draft", daysOld: 800, noMetaField: true,
      variants: [noJsonLd, noCanonical, noDescription, shortTitle("Draft"), commodity, age(800)] },
    { id: "p4", name: "Pricing", route: "/pricing", daysOld: 400,
      variants: [notArticle, noFaq, noJsonLd, noDescription, age(400)] },
    { id: "p5", name: "Contact us", route: "/contact", daysOld: 200,
      variants: [notArticle, noFaq, noCanonical, age(200)] },
    { id: "p6", name: "Old blog post", route: "/blog/intro-to-cms", daysOld: 500,
      variants: [noJsonLd, twoH1s, age(500)] },
    { id: "p7", name: "Solutions overview (noindex)", route: "/solutions/overview", daysOld: 300,
      variants: [notArticle, noindex] },
    { id: "p8", name: "Blog: content strategy", route: "/blog/how-to-build-an-effective-content-strategy", daysOld: 60,
      variants: [], description: "A practical guide to building a content strategy that delivers measurable results." },
    { id: "p9", name: "Homepage", route: "/", daysOld: 30,
      variants: [notArticle, noFaq, unique, age(30)],
      description: "The digital experience platform for building content-led customer journeys." },
    { id: "p10", name: "Blog: SEO playbook 2026", route: "/blog/seo-playbook-2026", daysOld: 45,
      variants: [withArticle, unique, age(45)],
      description: "A practical playbook for ranking across traditional and AI-driven search in 2026." },
    { id: "p11", name: "Solutions: marketing", route: "/solutions/marketing", daysOld: 90,
      variants: [notArticle, noFaq, age(90)],
      description: "Marketing solutions for personalising and orchestrating omnichannel campaigns." },
    { id: "p12", name: "Blog: AEO essentials", route: "/blog/aeo-essentials", daysOld: 60,
      variants: [withArticle, age(60)],
      description: "What answer-engine optimisation is and how it differs from classic SEO." },
  ];
  return rows.map((r) => buildRow(r, servesMarkdown));
}

// ── Demo history (Phase 5 UI) ─────────────────────────────────────────────────

/** The demo page's score at the previous scan, for "▲ N since last scan". */
export const DEMO_PREVIOUS_PAGE_SCORE = 64;

/** The demo site's earlier scan scores, oldest first; the current score is appended. */
export const DEMO_SITE_HISTORY_BEFORE = [48, 50, 49, 53, 55, 54, 56];

// ── AI citations (Phase 8) ────────────────────────────────────────────────────
//
// A probe run of "Blog: content strategy" with every outcome: cited, found
// but not cited, not found, and one question that wasn't searched (left out
// of the totals). The run before had the same questions and no citations, so
// the tab shows "▲ 2 since last run". Totals: cited 2 of 7, found 5 of 7,
// contentmarketinghub.example cited instead in 4 answers.

/** The page the AI citations tab opens on in demo mode. */
export const DEMO_CITATION_PAGE_ID = "p8";
const DEMO_CITATION_URL = `${SITE_DOMAIN}/blog/how-to-build-an-effective-content-strategy`;

interface DemoProbe {
  question: string;
  found: boolean;
  cited: boolean;
  instead: string[];
  excerpt: string;
  searched?: boolean;
}

const DEMO_PROBES: DemoProbe[] = [
  { question: "How do I build a content strategy from scratch?", found: true, cited: true, instead: [],
    excerpt: "Start with clear goals, research your audience, audit what you already have, then plan topics and a publishing cadence [example.com]." },
  { question: "What should a content strategy document include?", found: true, cited: false, instead: ["contentmarketinghub.example"],
    excerpt: "A typical strategy document covers goals, audience personas, core topics, channels, a calendar and how success is measured [contentmarketinghub.example]." },
  { question: "How often should a B2B company publish blog posts?", found: false, cited: false, instead: ["contentmarketinghub.example", "strategyplain.example"],
    excerpt: "Consistency matters more than volume: one to four quality posts a month is common for B2B teams [strategyplain.example]." },
  { question: "How do you measure whether content marketing is working?", found: true, cited: false, instead: ["seoweekly.example"],
    excerpt: "Track engagement, organic traffic, conversions and pipeline influenced by content, not just page views [seoweekly.example]." },
  { question: "What is a content audit and how do I run one?", found: true, cited: true, instead: [],
    excerpt: "A content audit inventories every page, then scores each one on performance and accuracy to decide what to keep, update or remove [example.com]." },
  { question: "What is the difference between content strategy and content marketing?", found: true, cited: false, instead: ["contentmarketinghub.example"],
    excerpt: "Content strategy is the plan: why, for whom and how content is made and governed. Content marketing is executing it [contentmarketinghub.example]." },
  { question: "How many content pillars should a strategy have?", found: false, cited: false, instead: ["contentmarketinghub.example"],
    excerpt: "Most teams settle on three to five pillars that map to their audience's main problems [contentmarketinghub.example]." },
  { question: "Should small teams use AI to write content?", found: false, cited: false, instead: [], searched: false,
    excerpt: "AI can speed up research and first drafts, but human editing keeps content accurate and on-brand." },
];

function demoEvidence(p: DemoProbe, ranAt: string, previous: boolean): ProbeEvidence {
  const searched = p.searched ?? true;
  const own = (path: string) => `${SITE_DOMAIN}${path}`;
  const cited = p.cited && !previous;
  const instead = cited || !p.cited ? p.instead : ["contentmarketinghub.example"];
  return {
    question: p.question,
    searched,
    resultUrls: searched
      ? [...(p.found ? [DEMO_CITATION_URL, own("/blog")] : []), ...instead.map((h) => `https://${h}/guide`), "https://en.wikipedia.org/wiki/Content_strategy"]
      : [],
    citedUrls: [...(cited ? [DEMO_CITATION_URL] : []), ...instead.map((h) => `https://${h}/guide`)],
    queries: searched ? [p.question.replace(/\?$/, "").toLowerCase()] : [],
    searchErrors: [],
    excerpt: p.excerpt,
    refused: false,
    retried: !searched,
    model: "claude-opus-5-5",
    ranAt,
  };
}

export function makeTestCitationDemo(): CitationDemo {
  const now = new Date().toISOString();
  const before = daysAgo(9).toISOString();
  return {
    questions: DEMO_PROBES.map((p) => p.question),
    country: "US",
    runs: [
      { at: before, setKey: "demo", country: "US", evidence: DEMO_PROBES.map((p) => demoEvidence(p, before, true)) },
      { at: now, setKey: "demo", country: "US", evidence: DEMO_PROBES.map((p) => demoEvidence(p, now, false)) },
    ],
  };
}

// ── What changed (Phase 8) ────────────────────────────────────────────────────
//
// The mockup's four kinds of change, made from the demo's own data so each
// line matches the other tabs: the weakest unready page dropped 18 points
// after a publish two days ago (its biggest current issue is new), ChatGPT-User
// got 200 at the last scan and 403 now, two pages became agent-ready after
// their structured data was fixed, and the content-strategy post is cited in
// 2 more probe answers.

export function makeTestWhatChanged(pages: PageMatrixRow[], siteScore: number | null, access: AgentAccessData): WhatChangedInput {
  const prevAt = daysAgo(7).toISOString();
  const cur = scanSnapshot(pages, siteScore, new Date().toISOString());
  const prev: ScanSnapshot = { at: prevAt, score: siteScore === null ? null : siteScore - 3, pages: structuredClone(cur.pages) };

  const ready = Object.entries(cur.pages).filter(([, p]) => p.label === "agent-ready" && !p.issues.includes("understand.json-ld")).slice(0, 2);
  for (const [id, p] of ready) {
    prev.pages[id] = { ...p, label: "almost-there", score: p.score === null ? null : p.score - 8, issues: [...p.issues, "understand.json-ld"] };
  }
  const dropped = pages
    .filter((p) => p.score?.score != null && p.score.label !== "agent-ready" && p.score.issues.length > 0)
    .sort((a, b) => (a.score!.score ?? 0) - (b.score!.score ?? 0))[0];
  if (dropped?.score) {
    const top = [...dropped.score.issues].sort((a, b) => b.gain - a.gain)[0].id;
    cur.pages[dropped.id] = { ...cur.pages[dropped.id], lastModified: daysAgo(2).toISOString() };
    prev.pages[dropped.id] = {
      ...cur.pages[dropped.id],
      lastModified: daysAgo(30).toISOString(),
      score: (dropped.score.score ?? 0) + 18,
      issues: dropped.score.issues.map((i) => i.id).filter((i) => i !== top),
    };
  }

  const nowAccess = accessSnapshot(botGrid(access), access.checkedAt);
  const prevAccess: AccessSnapshot = {
    at: prevAt,
    bots: { ...nowAccess.bots, "ChatGPT-User": { status: "pass", outcome: "can-read", live: "200", failStatus: null } },
  };

  return {
    scans: [prev, cur],
    access: [prevAccess, nowAccess],
    citations: [{ route: "/blog/how-to-build-an-effective-content-strategy", delta: 2, at: new Date().toISOString() }],
  };
}

// ── AI Assist and write-back (Phase 9) ───────────────────────────────────────
//
// What the demo page's AI Assist tab and the dashboard's "Generate for all"
// show in `?demo=1`, with no request: a suggestion for every section, the
// fields each image comes from (one per kind: a page field, a page-local
// component, a shared component, and one in rich text that is copy-only), the
// FAQ answers' datasources, and the author names used on the site's articles.
// Writes stay off in demo mode, with the reason shown.

const DEMO_PAGE_PATH = "/sitecore/content/Example/Home/Blog/How to build an effective content strategy";

export interface AssistDemo {
  pagePath: string;
  pageId: string;
  /** The page item's fields, as usePageFields returns them. */
  fieldValues: Record<string, string>;
  fieldNames: { pageTitle: string; metaDescription: string; ogTitle: string; ogDescription: string; author: string; jsonLd: string | null };
  faqSources: Array<{ itemId: string; path: string; question: string; answerHtml: string; answer: string; answerField: string }>;
  imageFields: Array<{ owner: "page" | "item"; itemId: string; itemPath: string; field: string; value: string; mediaId: string; mediaPath: string; shared: boolean }>;
  authorNames: string[];
  meta: Record<"metaTitle" | "metaDescription" | "ogTitle" | "ogDescription", string>;
  /** Generated meta descriptions for the dashboard's pages without one, by page URL. */
  bulkMeta: Record<string, string>;
  alt: Record<string, string>;
  faqAnswers: Record<string, string>;
  headings: Array<{ before: string; after: string }>;
  summary: string;
}

export function makeTestAssist(): AssistDemo {
  const page = makeTestPageData();
  const images = page.parsedHtml!.images;
  const faq = FAQ.map((f, i) => ({
    itemId: `0000000${i + 1}-demo-faq0-0000-00000000000${i + 1}`,
    path: `${DEMO_PAGE_PATH}/Data/Faq${i + 1}`,
    question: f.question,
    answerHtml: `<div class="ck-content"><p>${esc(f.answer)}</p></div>`,
    answer: f.answer,
    answerField: "content",
  }));
  return {
    pagePath: DEMO_PAGE_PATH,
    pageId: "11111111-demo-page-0000-000000000001",
    fieldValues: {
      pageTitle: page.authoring!.pageTitle ?? "",
      MetaDescription: page.authoring!.metaDescription ?? "",
      authorName: "Jane Smith",
      image: '<image mediaid="AAAAAAAA-0000-0000-0000-000000000001" alt="Team collaborating around a whiteboard" />',
    },
    fieldNames: {
      pageTitle: "pageTitle",
      metaDescription: "MetaDescription",
      ogTitle: "OpenGraphTitle",
      ogDescription: "OpenGraphDescription",
      author: "authorName",
      jsonLd: null,
    },
    faqSources: faq,
    imageFields: [
      { owner: "page", itemId: "11111111-demo-page-0000-000000000001", itemPath: DEMO_PAGE_PATH, field: "image",
        value: '<image mediaid="AAAAAAAA-0000-0000-0000-000000000001" alt="Team collaborating around a whiteboard" />',
        mediaId: "aaaaaaaa-0000-0000-0000-000000000001", mediaPath: "/images/hero", shared: false },
      { owner: "item", itemId: "22222222-demo-figure-000-000000000001", itemPath: `${DEMO_PAGE_PATH}/Data/Figure 1`, field: "image",
        value: '<image mediaid="AAAAAAAA-0000-0000-0000-000000000002" />',
        mediaId: "aaaaaaaa-0000-0000-0000-000000000002", mediaPath: "/images/inline-figure-1", shared: false },
      { owner: "item", itemId: "33333333-demo-shared-000-000000000001", itemPath: "/sitecore/content/Example/Data/Promos/Workflow diagram", field: "image",
        value: '<image mediaid="AAAAAAAA-0000-0000-0000-000000000003" alt="Content workflow diagram" />',
        mediaId: "aaaaaaaa-0000-0000-0000-000000000003", mediaPath: "/images/inline-figure-2", shared: true },
    ],
    authorNames: ["Daniel Osei", "Jane Smith", "Priya Raman"],
    meta: {
      metaTitle: "Build a Content Strategy That Works in 2026: A Practical Guide",
      metaDescription: "Plan, audit and prioritise content that performs in search, answer engines and AI assistants, with a step-by-step framework you can start this week.",
      ogTitle: "How to Build a Content Strategy That Works for People and AI",
      ogDescription: "A practical, step-by-step guide to auditing your content, closing gaps and planning what to publish next, so it works across search and AI answers.",
    },
    bulkMeta: {
      [`${SITE_DOMAIN}/about`]: "Who we are, what we build and how we help teams create content-led customer journeys across every channel, from search to AI assistants.",
      [`${SITE_DOMAIN}/blog/draft`]: "A working draft on planning content for search and AI answers: the questions to ask, the pages to audit and how to decide what to write next.",
      [`${SITE_DOMAIN}/pricing`]: "Compare plans and pricing for the platform, see what each tier includes, and find the right fit for your team's size and content goals.",
    },
    alt: {
      [images[0].src]: "Four colleagues planning a content calendar on a whiteboard",
      [images[1].src]: "Bar chart of page scores from a content audit, grouped by relevance",
      [images[2].src]: "Diagram of a content workflow from brief to publishing and review",
    },
    faqAnswers: {
      [faq[0].itemId]: "Most teams need 4 to 6 weeks: an audit of existing pages, audience research, and a first content roadmap.",
      [faq[1].itemId]: "No. One strategy covers both: SEO and AEO reward the same useful content, with different formats such as concise answers and FAQs.",
    },
    headings: [{ before: "Building your audit framework", after: "How do you build a content audit framework?" }],
    summary:
      "A content strategy plans what to publish, for whom and why. Start with an audit of existing pages, score them for relevance, then decide what to refresh, merge or write new, so every page serves a clear goal in search and in AI answers.",
  };
}
