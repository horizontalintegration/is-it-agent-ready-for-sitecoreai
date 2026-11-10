import type { BodyBlock, PageData, ParsedHtml } from "./types";
import type { PageMatrixRow } from "@/types/dashboard";
import type { DraftHtml, SiteContext } from "@/lib/checks/types";
import { BOTS } from "@/lib/agent-access/bots";
import type { AgentAccessData, BotAccess, HttpProbe, SamplePage } from "@/lib/agent-access/types";
import { WELL_KNOWN_PATHS } from "@/lib/agent-access/well-known";
import { buildPageContext } from "@/lib/checks/context";
import { runPageChecks } from "@/lib/checks/engine";
import { summarisePageReport } from "@/lib/checks/view-model";
import { analyseHtml, EXCERPT_MAX_CHARS } from "@/lib/markdown/anatomy";
import { estimateTokens, toAgentMarkdown } from "@/lib/markdown/convert";
import type { MarkdownCheckData } from "@/lib/markdown/types";
import type { SiteOption } from "@/lib/sitecore/sites";
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
    question: "How much should I have saved for retirement at 45?",
    answer:
      "A common benchmark is three to four times your annual salary by 45. This includes workplace plans, IRAs, and other long-term investments.",
  },
  {
    question: "Is it too late to start a Roth IRA in my 40s?",
    answer:
      "No. You can contribute at any age if you have earned income — and two decades of tax-free growth still make a Roth IRA worth opening.",
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

/** The demo article (the panel's page, and the dashboard's p8). */
export const DEMO_ROUTE = "/insights/retirement-planning-in-your-40s";
const OG_DESCRIPTION = "How much to save in your 40s, which accounts to fund first, and how to catch up.";

export function makeTestPageData(): PageData {
  const pageUrl = `${SITE_DOMAIN}${DEMO_ROUTE}`;
  const title = "Retirement planning in your 40s: a practical guide";
  const description =
    "How much to save in your 40s, which accounts to fund first, and how to catch up on retirement savings if you started late.";
  const paragraphs = [
    "Retirement planning is the setting of income goals for later life and the saving, investing, and protection needed to reach them. A solid plan aligns contributions to goals, timelines, and risk tolerance.",
    "Your 40s are usually your peak earning years. Decisions about saving rates, account types, and debt during this decade affect retirement income more than any other period.",
    "Start by reviewing your current balances. Identify gaps, duplicated accounts, and investments that under-perform. Use that review to prioritise between higher contributions and paying down debt.",
  ];
  const headings = [
    { level: 1, text: title },
    { level: 2, text: "What does retirement planning involve?" },
    { level: 2, text: "Why do your 40s matter?" },
    { level: 2, text: "Building your savings plan" },
    { level: 3, text: "Step 1: Max out your workplace plan" },
    { level: 3, text: "Step 2: Open an IRA" },
  ];
  const mainText = [title, headings[1].text, paragraphs[0], headings[2].text, paragraphs[1],
    headings[3].text, headings[4].text, headings[5].text, paragraphs[2]].join("\n");

  return {
    pageUrl,
    route: DEMO_ROUTE,
    templateName: "Article Detail Page",
    organization: BRANDX_ORGANIZATION,
    authoring: {
      pageTitle: title,
      metaDescription: description,
      ogTitle: title,
      ogDescription: OG_DESCRIPTION,
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
        { src: `${SITE_DOMAIN}/images/hero.jpg`, alt: "Couple meeting a financial advisor" },
        { src: `${SITE_DOMAIN}/images/inline-figure-1.jpg`, alt: null }, // missing alt
        { src: `${SITE_DOMAIN}/images/inline-figure-2.jpg`, alt: "Savings chart" },
      ],
      links: [
        { anchorText: "our retirement savings calculator", href: "/insights/retirement-calculator" },
        { anchorText: "click here", href: "/contact-us" }, // generic
        { anchorText: "our guide to Roth conversions", href: "/insights/roth-conversions-explained" },
      ],
      paragraphs,
      mainText,
      bodyBlocks: bodyBlocksFor(mainText),
      htmlLang: "en",
      canonicalHref: pageUrl,
      robotsMeta: "index, follow",
      ogTitle: title,
      ogDescription: OG_DESCRIPTION,
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
            { "@type": "ListItem", position: 2, name: "Insights", item: `${SITE_DOMAIN}/insights` },
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
        "The article repeats common retirement-saving advice with few first-hand examples or figures of BrandX's own.",
      followUpGaps: [
        { question: "How do catch-up contributions work?", covered: false },
        { question: "Should I pay off my mortgage or invest more?", covered: false },
        { question: "How do I roll over an old 401(k)?", covered: true },
        { question: "How much will I need to retire?", covered: false },
        { question: "Which account should I fund first?", covered: true },
      ],
    },
  };
}

// The draft edits one heading. Related-article cards are fetched in the
// browser, as on BrandX: they're in the draft but not in the server HTML.
const LIVE_H2 = "Why do your 40s matter?";
const DRAFT_H2 = "Why do your 40s matter for retirement?";
const RELATED = [
  {
    title: "When to claim Social Security",
    summary: "How your claiming age changes your monthly benefit.",
    href: "/insights/social-security-timing",
  },
  {
    title: "Roth conversions explained",
    summary: "When converting to a Roth IRA pays off.",
    href: "/insights/roth-conversions-explained",
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
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");

// The published page's weight (plan Phase 13), as on a Content SDK (Next.js) site such as the
// BrandX replica: chunk scripts and preloads, JSON-LD, utility classes, responsive image srcSets,
// inline SVG icons, and the page's layout data again in __NEXT_DATA__. The Agent View's Before
// view breaks it down. Measured on the replica (2026-11-04): about 60% markup, 37% scripts, under
// 1% content, CSS in external files; Markdown 97% smaller. The demo follows that shape.

/** A stable fake build hash for a name. */
function hashOf(name: string, length = 16): string {
  let h = 2166136261;
  let out = "";
  while (out.length < length) {
    for (const c of name + out.length) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

const BUILD_ID = hashOf("build", 21);
const CHUNKS = [
  "webpack", "framework", "main", "pages/_app", "pages/[[...path]]", "polyfills", "1755", "2817", "3402", "4620",
  "5139", "6871", "7424", "8159", "9038", "components/header", "components/accordion", "components/footer",
].map((name) => `/_next/static/chunks/${name}-${hashOf(name)}.js`);

/** An SVG path of about `segments` × 40 characters, like an exported icon's. */
const svgPath = (segments: number, seed: number) =>
  Array.from({ length: segments }, (_, i) => {
    const n = (k: number) => (((seed + i) * 37 + k * 11) % 230) / 10;
    return `M${n(1)} ${n(2)}c${n(3)}-${n(4)} ${n(5)}-${n(6)} ${n(7)}-${n(8)}l${n(9)} ${n(10)}z`;
  }).join("");
const LOGO_PATH = svgPath(60, 7);
const ICON_PATH = svgPath(22, 3);
const SOCIAL_PATH = svgPath(35, 11);
const icon = (label: string, path = ICON_PATH) =>
  `<svg class="!h-4 !w-4 duration-200 h-auto transition-transform group-hover:rotate-180 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false" data-icon="${label}"><path stroke-linecap="round" stroke-linejoin="round" d="${path}"></path></svg>`;

/** A Next.js image's srcSet: the media URL through the image optimiser at every width. */
const srcSet = (path: string) =>
  [640, 750, 828, 1080, 1200, 1920, 2048, 3840]
    .map((w) => `/_next/image?url=${encodeURIComponent(`https://edge.sitecorecloud.io/brandx-${hashOf("tenant", 8)}/media${path}?h=630&iar=0&w=1200&hash=${hashOf(path, 32)}`)}&w=${w}&q=75 ${w}w`)
    .join(", ");

/** The page's layout data as the Content SDK serialises it: every field again, the rich text as HTML. */
function nextData(d: PageData, mainHtml: string): string {
  const field = (value: unknown) => ({ value });
  const nav = ["Services", "Insights", "About", "Contact"].map((name, i) => ({
    id: hashOf(name, 32), displayName: name, href: `/${name.toLowerCase()}`, fields: { Title: field(name), Link: field({ href: `/${name.toLowerCase()}`, linktype: "internal", id: `{${hashOf(name + i, 32).toUpperCase()}}` }) },
  }));
  const dictionary = Object.fromEntries(
    ["Header", "Footer", "Search", "Article", "Accordion", "Form", "Cookie", "Share", "Pagination", "Error", "Newsletter", "Navigation", "Media", "Author"].flatMap((area) =>
      ["Title", "Label", "Placeholder", "Button", "Close", "Open", "Next", "Previous", "Loading", "Empty", "Required", "Invalid"].map((key) => [
        `${area}.${key}`,
        `${area} ${key.toLowerCase()} text for BrandX visitors`,
      ]),
    ),
  );
  const component = (name: string, uid: string, fields: object) => ({ uid: hashOf(uid, 32), componentName: name, dataSource: `{${hashOf(uid + "ds", 32).toUpperCase()}}`, params: { GridParameters: "col-12", FieldNames: "Default", Styles: "", RenderingIdentifier: "", DynamicPlaceholderId: "1" }, fields });
  const data = {
    props: {
      pageProps: {
        site: { name: "brandx", hostName: "*", language: "en" },
        locale: "en",
        layoutData: {
          sitecore: {
            context: { pageEditing: false, site: { name: "brandx" }, pageState: "normal", editMode: "chromes", language: "en", itemPath: d.route, variantId: "_default" },
            route: {
              name: d.route.split("/").pop(), displayName: d.authoring.pageTitle, templateName: d.templateName, itemId: hashOf("item", 32), itemLanguage: "en", itemVersion: 3, layoutId: hashOf("layout", 32), templateId: hashOf("template", 32),
              fields: {
                pageTitle: field(d.authoring.pageTitle), metaTitle: field(d.fields.metaTitle), metaDescription: field(d.fields.metaDescription), ogTitle: field(d.authoring.ogTitle), ogDescription: field(d.authoring.ogDescription), ogImage: field({ src: d.authoring.ogImage, alt: "", width: 1200, height: 630 }),
                authorName: field(d.authoring.author), publishDate: field(d.authoring.publishDate?.toISOString()), content: field(mainHtml),
              },
              placeholders: {
                "headless-header": [component("Header", "header", { navigation: nav, logo: field({ src: "/images/brandx-logo.svg", alt: "BrandX" }) })],
                "headless-main": [
                  component("RichText", "content", { Text: field(mainHtml) }),
                  component("Accordion", "accordion", { items: FAQ.map((f, i) => ({ id: hashOf(`faq${i}`, 32), fields: { heading: field(f.question), content: field(`<p>${esc(f.answer)}</p>`) } })) }),
                ],
                "headless-footer": [component("Footer", "footer", { copyright: field("© BrandX. All rights reserved."), links: nav, social: BRANDX_ORGANIZATION.sameAs.map((href) => ({ fields: { Link: field({ href, target: "_blank" }) } })) })],
              },
            },
          },
        },
        dictionary,
        headLinks: [],
        componentProps: {},
      },
      __N_SSG: true,
    },
    page: "/[[...path]]",
    query: { path: d.route.split("/").filter(Boolean) },
    buildId: BUILD_ID,
    isFallback: false,
    gsp: true,
    locale: "en",
    locales: ["en"],
    defaultLocale: "en",
    scriptLoader: [],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * The demo page's HTML, matching makeTestPageData's parsed HTML: published,
 * or as the sanitised Page Builder draft (edited heading, Related Articles
 * cards, an empty head and no scripts). The Agent View converts it to
 * Markdown, and breaks the published page's tokens down.
 */
export function makeTestPageSource({ draft = false }: { draft?: boolean } = {}): string {
  const d = makeTestPageData();
  const h = d.parsedHtml!;
  const heading = (text: string) => (draft && text === LIVE_H2 ? DRAFT_H2 : text);
  const [h1, ...sections] = h.headings;
  const para = (i: number) => `<p class="mb-4 text-base text-slate-700">${esc(h.paragraphs[i])}</p>`;
  const h2 = (text: string) => `<h2 class="mt-8 mb-3 text-2xl font-semibold tracking-tight text-slate-900">${esc(text)}</h2>`;
  const h3 = (text: string) => `<h3 class="mt-6 mb-2 text-xl font-semibold text-slate-900">${esc(text)}</h3>`;
  const faq = FAQ.map(
    (f, i) =>
      `<div class="accordion-item border-b border-slate-200"><button class="flex w-full items-center justify-between py-4 text-left text-lg font-medium" aria-controls="faq-${i}" aria-expanded="false">${esc(f.question)}${icon("chevron-down")}</button>` +
      `<div id="faq-${i}" class="overflow-hidden pb-4 text-base text-slate-700" aria-hidden="true" style="max-height:0px;transition:max-height .3s ease-in-out"><p>${esc(f.answer)}</p></div></div>`,
  ).join("");
  const related = draft
    ? `<section data-component="${COMPONENT.related}"><h2>Related articles</h2>${RELATED.map(
        (r) => `<div><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p><a href="${r.href}">Read more</a></div>`,
      ).join("")}</section>`
    : "";
  const article = [
    `<h1 class="mb-6 text-4xl font-bold tracking-tight text-slate-900">${esc(h1.text)}</h1>`,
    `<img src="/images/hero.jpg" alt="${attr(h.images[0].alt ?? "")}" class="mb-8 h-auto w-full rounded-xl object-cover" width="1200" height="630" loading="eager" decoding="async" style="color:transparent" sizes="100vw" srcSet="${attr(srcSet("/images/hero.jpg"))}">`,
    `${h2(heading(sections[0].text))}${para(0)}`,
    `${h2(heading(sections[1].text))}${para(1)}`,
    `${h2(sections[2].text)}${h3(sections[3].text)}${h3(sections[4].text)}${para(2)}`,
    `<p class="mb-4 text-base text-slate-700">Try <a class="text-blue-700 underline underline-offset-2 hover:text-blue-900" href="/insights/retirement-calculator">our retirement savings calculator</a> and read <a class="text-blue-700 underline underline-offset-2 hover:text-blue-900" href="/insights/roth-conversions-explained">our guide to Roth conversions</a>.</p>`,
  ].join("");
  const head = draft
    ? "<head></head>"
    : [
        `<head><meta charSet="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.authoring.pageTitle ?? "")}</title>`,
        `<meta name="description" content="${attr(d.authoring.metaDescription ?? "")}"><meta name="robots" content="index, follow"><meta name="author" content="Jane Smith">`,
        `<link rel="canonical" href="${d.pageUrl}"><meta property="og:title" content="${attr(d.authoring.ogTitle ?? "")}"><meta property="og:description" content="${attr(OG_DESCRIPTION)}">`,
        `<meta property="og:image" content="${d.authoring.ogImage}"><meta name="twitter:card" content="summary_large_image"><meta property="article:modified_time" content="${h.articleModifiedTimeMeta}">`,
        `<link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://edge.sitecorecloud.io" crossorigin=""><link rel="preload" href="/_next/static/media/inter-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous">`,
        ...h.jsonLdScripts.map((s) => `<script type="application/ld+json">${JSON.stringify(s.ok ? s.value : {})}</script>`),
        ...CHUNKS.map((src) => `<link rel="preload" href="${src}" as="script">`),
        `<link rel="preload" as="image" imageSrcSet="${attr(srcSet("/images/hero.jpg"))}" imageSizes="100vw" fetchpriority="high">`,
        ...["app", "components", "fonts"].map((name) => `<link rel="stylesheet" href="/_next/static/css/${hashOf(name)}.css" data-precedence="next">`),
        `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-BRANDX1');</script>`,
        ...CHUNKS.slice(0, 6).map((src) => `<script src="${src}" defer=""></script>`),
        `</head>`,
      ].join("");
  const scripts = draft
    ? ""
    : `<script id="__NEXT_DATA__" type="application/json">${nextData(d, article)}</script>` + CHUNKS.slice(6).map((src) => `<script src="${src}" async=""></script>`).join("");
  return [
    `<!doctype html><html lang="en">${head}<body class="min-h-screen bg-white font-sans antialiased"><div id="__next">`,
    `<header data-component="${COMPONENT.header}" class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur"><div class="container flex h-16 items-center justify-between gap-6">`,
    `<a href="/" class="flex items-center gap-2 text-xl font-bold text-slate-900"><svg class="h-8 w-auto" viewBox="0 0 200 32" role="img" aria-hidden="true"><path fill="currentColor" d="${LOGO_PATH}"></path></svg>BrandX</a>`,
    `<nav aria-label="Main" class="hidden md:block"><ul class="flex items-center gap-8 text-sm font-medium text-slate-700">`,
    ["Services", "Insights", "About", "Contact"].map((n) => `<li class="relative"><a class="flex items-center gap-1 py-2 hover:text-blue-700" href="/${n.toLowerCase()}">${n}${icon("chevron-down")}</a></li>`).join(""),
    `</ul></nav></div></header>`,
    `<main class="container py-12"><article data-component="${COMPONENT.content}" class="mx-auto max-w-3xl">${article}`,
    `</article><section data-component="${COMPONENT.accordion}" class="mx-auto mt-12 max-w-3xl">${faq}</section>${related}</main>`,
    `<footer data-component="${COMPONENT.footer}" class="mt-16 border-t border-slate-200 bg-slate-50"><div class="container flex flex-col gap-6 py-10 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">`,
    `<p>© BrandX. All rights reserved.</p><div class="flex gap-6"><a class="hover:text-slate-900" href="/privacy">Privacy policy</a> <a class="hover:text-slate-900" href="/terms">Terms of use</a></div>`,
    `<ul class="flex gap-4" aria-label="Social">${BRANDX_ORGANIZATION.sameAs.map((href) => `<li><a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${new URL(href).hostname}">${icon("social", SOCIAL_PATH)}</a></li>`).join("")}</ul>`,
    `</div></footer></div>${scripts}</body></html>`,
  ].join("");
}

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
  const probe = {
    finalUrl: url,
    status: 200,
    error: null,
    contentType: "text/html; charset=utf-8",
    vary: null,
    bytes: new TextEncoder().encode(source).byteLength,
    tokens: estimateTokens(source),
  };
  // The route's breakdown of the page, with the excerpt the panel asks for.
  const html = { ...probe, ...analyseHtml(source, { excerptChars: EXCERPT_MAX_CHARS }) };
  const converted = toAgentMarkdown(source, { title: d.fields.metaTitle, description: d.fields.metaDescription, url });
  if (serves) {
    return {
      url,
      checkedAt: new Date().toISOString(),
      markdown: {
        ...probe,
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
    markdown: { ...probe, body: source.slice(0, 2_000), truncated: true },
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
// engine on live HTML only, as the dashboard does. "Retirement planning in your
// 40s" is the panel's demo page unchanged; the panel also scores its draft
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
      "@type": "Article",
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
    { id: "p1", name: "About us", route: "/about-us", daysOld: 1200,
      variants: [notArticle, noFaq, noJsonLd, noCanonical, noDescription, commodity, age(1200)] },
    { id: "p2", name: "Annuities", route: "/services/annuities", daysOld: 900,
      variants: [notArticle, noFaq, noJsonLd, twoH1s, shortTitle("Annuities"), commodity, age(900)] },
    { id: "p3", name: "Saving for retirement at any age", route: "/insights/saving-at-any-age", daysOld: 800, noMetaField: true,
      variants: [noJsonLd, noCanonical, noDescription, shortTitle("Saving"), commodity, age(800)] },
    { id: "p4", name: "Fees and pricing", route: "/fees", daysOld: 400,
      variants: [notArticle, noFaq, noJsonLd, noDescription, age(400)] },
    { id: "p5", name: "Contact us", route: "/contact-us", daysOld: 200,
      variants: [notArticle, noFaq, noCanonical, age(200)] },
    { id: "p6", name: "529 college savings plans", route: "/insights/college-savings-529-plans", daysOld: 500,
      variants: [noJsonLd, twoH1s, age(500)] },
    { id: "p7", name: "Client login (noindex)", route: "/client-login", daysOld: 300,
      variants: [notArticle, noindex] },
    { id: "p8", name: "Retirement planning in your 40s", route: DEMO_ROUTE, daysOld: 60,
      variants: [], description: OG_DESCRIPTION },
    { id: "p9", name: "Home", route: "/", daysOld: 30,
      variants: [notArticle, noFaq, unique, age(30)],
      description: "Independent financial planning and wealth management to help you invest smarter, retire better and grow with confidence." },
    { id: "p10", name: "Roth conversions explained", route: "/insights/roth-conversions-explained", daysOld: 45,
      variants: [withArticle, unique, age(45)],
      description: "What a Roth conversion is, when paying the tax now saves you money later, and the mistakes to avoid." },
    { id: "p11", name: "Wealth management", route: "/services/wealth-management", daysOld: 90,
      variants: [notArticle, noFaq, age(90)],
      description: "Personal wealth management from BrandX advisors: investments, tax and estate planning in one plan." },
    { id: "p12", name: "Estate planning checklist", route: "/insights/estate-planning-checklist", daysOld: 60,
      variants: [withArticle, age(60)],
      description: "The documents, accounts and decisions to review so your estate plan does what you intend." },
  ];
  return rows.map((r) => buildRow(r, servesMarkdown));
}

/**
 * The full-screen app's site picker in demo mode (Phase 14): BrandX, whose
 * pages are the demo, and a second site that picking only names in a toast.
 */
export function makeTestSiteList(): SiteOption[] {
  return [
    { id: "demo", name: "BrandX", domain: SITE_DOMAIN, homePageId: null },
    { id: "demo-nimbus", name: "Nimbus Goods", domain: "https://nimbus.example.com", homePageId: null },
  ];
}

// ── Demo history (Phase 5 UI) ─────────────────────────────────────────────────

/** The demo page's score at the previous scan, for "▲ N since last scan". */
export const DEMO_PREVIOUS_PAGE_SCORE = 64;

/** The demo site's earlier scan scores, oldest first; the current score is appended. */
export const DEMO_SITE_HISTORY_BEFORE = [48, 50, 49, 53, 55, 54, 56];

// ── AI citations (Phase 8) ────────────────────────────────────────────────────
//
// A probe run of "Retirement planning in your 40s" with every outcome: cited,
// found but not cited, not found, and one question that wasn't searched (left
// out of the totals). The run before had the same questions and no citations,
// so the tab shows "▲ 2 since last run". Totals: cited 2 of 7, found 5 of 7,
// retirementwise.example cited instead in 4 answers.

/** The page the AI citations tab opens on in demo mode. */
export const DEMO_CITATION_PAGE_ID = "p8";
const DEMO_CITATION_URL = `${SITE_DOMAIN}${DEMO_ROUTE}`;
const DEMO_COMPETITOR = "retirementwise.example";

interface DemoProbe {
  question: string;
  found: boolean;
  cited: boolean;
  instead: string[];
  excerpt: string;
  searched?: boolean;
}

const DEMO_PROBES: DemoProbe[] = [
  { question: "How much should I have saved for retirement at 45?", found: true, cited: true, instead: [],
    excerpt: "A common benchmark is three to four times your annual salary by 45, counting workplace plans and IRAs [example.com]." },
  { question: "What are catch-up contributions and when can I make them?", found: true, cited: false, instead: [DEMO_COMPETITOR],
    excerpt: `From age 50 you can add catch-up contributions on top of the normal 401(k) and IRA limits [${DEMO_COMPETITOR}].` },
  { question: "Should I pay off my mortgage or invest for retirement in my 40s?", found: false, cited: false, instead: [DEMO_COMPETITOR, "savvysaver.example"],
    excerpt: "It depends on your mortgage rate: above about 6%, extra payments often win; below it, investing usually does [savvysaver.example]." },
  { question: "How do I know if I'm on track for retirement?", found: true, cited: false, instead: ["moneyweekly.example"],
    excerpt: "Compare your savings with age-based benchmarks and project your income at 65, not just your balance today [moneyweekly.example]." },
  { question: "Is it too late to open a Roth IRA in my 40s?", found: true, cited: true, instead: [],
    excerpt: "No. Anyone with earned income can contribute, and 20 or more years of tax-free growth still make it worthwhile [example.com]." },
  { question: "What is the difference between a 401(k) and an IRA?", found: true, cited: false, instead: [DEMO_COMPETITOR],
    excerpt: `A 401(k) is offered by your employer and has higher limits; an IRA is one you open yourself, with more investment choice [${DEMO_COMPETITOR}].` },
  { question: "How much of my income should I save for retirement in my 40s?", found: false, cited: false, instead: [DEMO_COMPETITOR],
    excerpt: `Most planners suggest 15% to 20% of gross income in your 40s, more if you started late [${DEMO_COMPETITOR}].` },
  { question: "Should I use an AI tool to plan my retirement?", found: false, cited: false, instead: [], searched: false,
    excerpt: "AI tools can help you model scenarios, but a qualified advisor should review a plan before you act on it." },
];

function demoEvidence(p: DemoProbe, ranAt: string, previous: boolean): ProbeEvidence {
  const searched = p.searched ?? true;
  const own = (path: string) => `${SITE_DOMAIN}${path}`;
  const cited = p.cited && !previous;
  const instead = cited || !p.cited ? p.instead : [DEMO_COMPETITOR];
  return {
    question: p.question,
    searched,
    resultUrls: searched
      ? [...(p.found ? [DEMO_CITATION_URL, own("/insights")] : []), ...instead.map((h) => `https://${h}/guide`), "https://en.wikipedia.org/wiki/Retirement_planning"]
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
// their structured data was fixed, and the retirement article is cited in 2
// more probe answers.

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
    citations: [{ route: DEMO_ROUTE, delta: 2, at: new Date().toISOString() }],
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

const DEMO_PAGE_PATH = "/sitecore/content/BrandX/Home/Insights/Retirement planning in your 40s";

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
      image: `<image mediaid="AAAAAAAA-0000-0000-0000-000000000001" alt="${images[0].alt}" />`,
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
        value: `<image mediaid="AAAAAAAA-0000-0000-0000-000000000001" alt="${images[0].alt}" />`,
        mediaId: "aaaaaaaa-0000-0000-0000-000000000001", mediaPath: "/images/hero", shared: false },
      { owner: "item", itemId: "22222222-demo-figure-000-000000000001", itemPath: `${DEMO_PAGE_PATH}/Data/Figure 1`, field: "image",
        value: '<image mediaid="AAAAAAAA-0000-0000-0000-000000000002" />',
        mediaId: "aaaaaaaa-0000-0000-0000-000000000002", mediaPath: "/images/inline-figure-1", shared: false },
      { owner: "item", itemId: "33333333-demo-shared-000-000000000001", itemPath: "/sitecore/content/BrandX/Data/Promos/Savings chart", field: "image",
        value: `<image mediaid="AAAAAAAA-0000-0000-0000-000000000003" alt="${images[2].alt}" />`,
        mediaId: "aaaaaaaa-0000-0000-0000-000000000003", mediaPath: "/images/inline-figure-2", shared: true },
    ],
    authorNames: ["Daniel Osei", "Jane Smith", "Priya Raman"],
    meta: {
      metaTitle: "Retirement Planning in Your 40s: How Much to Save and Where",
      metaDescription: "How much to save in your 40s, which accounts to fund first and how to catch up if you started late, with a step-by-step plan you can start this month.",
      ogTitle: "Retirement Planning in Your 40s: A Practical Guide from BrandX",
      ogDescription: "Savings benchmarks for your 40s, the order to fund your 401(k) and IRA, and how to catch up if you started late, explained by BrandX advisors.",
    },
    bulkMeta: {
      [`${SITE_DOMAIN}/about-us`]: "Meet BrandX: independent financial advisors with over two decades of experience helping clients invest smarter, retire better and grow with confidence.",
      [`${SITE_DOMAIN}/insights/saving-at-any-age`]: "How much to save for retirement at every age, the accounts to fund first and how to catch up if you started late, explained by BrandX advisors.",
      [`${SITE_DOMAIN}/fees`]: "See how BrandX charges for financial planning and wealth management, what each service includes and how to choose the right level of advice.",
    },
    alt: {
      [images[0].src]: "Couple reviewing their retirement savings with a BrandX financial advisor",
      [images[1].src]: "Line chart of retirement savings growing from age 40 to 65",
      [images[2].src]: "Bar chart comparing yearly 401(k) and IRA contribution limits",
    },
    faqAnswers: {
      [faq[0].itemId]: "Aim for about three to four times your annual salary by 45, counting your 401(k), IRAs and other long-term investments.",
      [faq[1].itemId]: "No. You can open a Roth IRA at any age if you have earned income, and 20 or more years of tax-free growth still make it worthwhile.",
    },
    headings: [{ before: "Building your savings plan", after: "How do you build a retirement savings plan?" }],
    summary:
      "Your 40s are usually your peak earning years, so they shape retirement income more than any other decade. Check your savings against a benchmark of three to four times your salary, fund your workplace plan first, then add an IRA and close any gaps.",
  };
}
