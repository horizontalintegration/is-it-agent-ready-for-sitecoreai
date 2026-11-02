import type { BodyBlock, PageData, ParsedHtml } from "./types";
import type { PageMatrixRow } from "@/types/dashboard";
import type { DraftHtml, SiteContext } from "@/lib/checks/types";
import { BOTS } from "@/lib/agent-access/bots";
import type { AgentAccessData, BotAccess, HttpProbe, SamplePage } from "@/lib/agent-access/types";
import { WELL_KNOWN_PATHS } from "@/lib/agent-access/well-known";
import { buildPageContext } from "@/lib/checks/context";
import { runPageChecks } from "@/lib/checks/engine";
import { summarisePageReport } from "@/lib/checks/view-model";

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
    emptyStates: [],
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
export function makeTestSiteContext(): SiteContext {
  const data = makeTestPageData();
  return {
    siteUrl: SITE_DOMAIN,
    siteType: "content",
    organization: data.organization,
    expectedOrganization: { name: data.organization.name, url: data.organization.url },
    home: makeTestHomeHtml(),
    access: makeTestAgentAccess(),
  };
}

// ── Agent access scan (Phase 6, plan section 10: the accept-when fixture) ─────
//
// As in the Symposium mockup: the firewall returns 403 to ChatGPT-User and
// Perplexity-User although robots.txt allows them; robots.txt opts GPTBot
// out of training; the home page returns HTML for Accept: text/markdown;
// no llms.txt and no Content-Signal line; a 128-URL sitemap listed in
// robots.txt; about, contact and privacy pages all published.

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

export function makeTestAgentAccess(): AgentAccessData {
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
    markdown: {
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
}

function buildRow(input: FixtureRowInput): PageMatrixRow {
  const data = makeTestPageData();
  const pageUrl = `${SITE_DOMAIN}${input.route}`;
  data.pageUrl = pageUrl;
  data.route = input.route;
  html(data).canonicalHref = pageUrl;
  for (const v of input.variants) v(data);

  const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
  return {
    id: input.id,
    name: input.name,
    route: input.route,
    pageUrl,
    templateName: data.templateName ?? "",
    lastModified: daysAgo(input.daysOld).toISOString(),
    metaTitle: input.name,
    metaDescription: input.description ?? null,
    fields: data.fields,
    score: summarisePageReport(report),
    scanStatus: "scanned",
    lastScannedAt: new Date().toISOString(),
  };
}

export function makeTestSitePages(): PageMatrixRow[] {
  return [
    buildRow({ id: "p1", name: "About", route: "/about", daysOld: 1200,
      variants: [notArticle, noFaq, noJsonLd, noCanonical, noDescription, commodity, age(1200)] }),
    buildRow({ id: "p2", name: "Legacy product page", route: "/products/legacy", daysOld: 900,
      variants: [notArticle, noFaq, noJsonLd, twoH1s, shortTitle("Legacy"), commodity, age(900)] }),
    buildRow({ id: "p3", name: "Empty draft", route: "/blog/draft", daysOld: 800,
      variants: [noJsonLd, noCanonical, noDescription, shortTitle("Draft"), commodity, age(800)] }),
    buildRow({ id: "p4", name: "Pricing", route: "/pricing", daysOld: 400,
      variants: [notArticle, noFaq, noJsonLd, noDescription, age(400)] }),
    buildRow({ id: "p5", name: "Contact us", route: "/contact", daysOld: 200,
      variants: [notArticle, noFaq, noCanonical, age(200)] }),
    buildRow({ id: "p6", name: "Old blog post", route: "/blog/intro-to-cms", daysOld: 500,
      variants: [noJsonLd, twoH1s, age(500)] }),
    buildRow({ id: "p7", name: "Solutions overview (noindex)", route: "/solutions/overview", daysOld: 300,
      variants: [notArticle, noindex] }),
    buildRow({ id: "p8", name: "Blog: content strategy", route: "/blog/how-to-build-an-effective-content-strategy", daysOld: 60,
      variants: [], description: "A practical guide to building a content strategy that delivers measurable results." }),
    buildRow({ id: "p9", name: "Homepage", route: "/", daysOld: 30,
      variants: [notArticle, noFaq, unique, age(30)],
      description: "The digital experience platform for building content-led customer journeys." }),
    buildRow({ id: "p10", name: "Blog: SEO playbook 2026", route: "/blog/seo-playbook-2026", daysOld: 45,
      variants: [withArticle, unique, age(45)],
      description: "A practical playbook for ranking across traditional and AI-driven search in 2026." }),
    buildRow({ id: "p11", name: "Solutions: marketing", route: "/solutions/marketing", daysOld: 90,
      variants: [notArticle, noFaq, age(90)],
      description: "Marketing solutions for personalising and orchestrating omnichannel campaigns." }),
    buildRow({ id: "p12", name: "Blog: AEO essentials", route: "/blog/aeo-essentials", daysOld: 60,
      variants: [withArticle, age(60)],
      description: "What answer-engine optimisation is and how it differs from classic SEO." }),
  ];
}

// ── Demo history (Phase 5 UI) ─────────────────────────────────────────────────

/** The demo page's score at the previous scan, for "▲ N since last scan". */
export const DEMO_PREVIOUS_PAGE_SCORE = 75;

/** The demo site's earlier scan scores, oldest first; the current score is appended. */
export const DEMO_SITE_HISTORY_BEFORE = [61, 63, 62, 66, 68, 67, 70];
