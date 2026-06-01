import type { PageData } from "./types";
import type { PageMatrixRow } from "@/types/dashboard";
import type { SiteScoreResult } from "./site-score";

const SITE_DOMAIN = "https://example.com";

const MAX_PILLARS: SiteScoreResult["maxPillars"] = {
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

function makeFixtureScore(
  pillars: SiteScoreResult["pillars"],
): SiteScoreResult {
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

export function makeTestPageData(): PageData {
  return {
    pageUrl: `${SITE_DOMAIN}/blog/how-to-build-an-effective-content-strategy`,
    authoring: {
      pageTitle: "How to build an effective content strategy in 2026",
      metaDescription:
        "A practical guide to building a content strategy that delivers measurable results across SEO, AEO and AI search channels.",
      ogTitle: "How to build an effective content strategy in 2026",
      ogDescription: "A practical guide to building a content strategy that delivers measurable results.",
      ogImage: `${SITE_DOMAIN}/images/hero.jpg`,
      author: "Jane Smith",
      authorProfileLinked: false, // shows warning state
      publishDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
      lastUpdatedDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      noIndexField: false,
      richTextParagraphs: [
        "Content strategy is the planning, development, and management of content for a business or brand. A solid strategy aligns content to business goals, audience needs, and channel requirements.",
        "Modern content strategies must account for traditional search, answer engines, and AI-driven retrieval systems. Each surface has different relevance signals and content formats.",
        "Start by auditing your existing content. Identify gaps, duplicates, and pages that under-perform. Use that audit to prioritise where to invest in new content vs refreshes.",
      ],
      richTextFull:
        "Content strategy is the planning, development, and management of content. Modern content strategies must account for traditional search, answer engines, and AI-driven retrieval systems. Start by auditing your existing content.",
      images: [
        { componentName: "HeroImage", alt: "Team collaborating around a whiteboard" },
        { componentName: "InlineFigure_1", alt: null }, // missing alt
        { componentName: "InlineFigure_2", alt: "Content workflow diagram" },
      ],
      links: [
        { componentName: "InlineLink_1", anchorText: "the content audit guide", href: "/blog/content-audit" },
        { componentName: "InlineLink_2", anchorText: "click here", href: "/contact" }, // generic
        { componentName: "InlineLink_3", anchorText: "our 2026 SEO playbook", href: "/blog/seo-playbook-2026" },
      ],
      headings: [
        { level: 1, text: "How to build an effective content strategy in 2026", componentName: "Hero" },
        { level: 2, text: "What is a content strategy?", componentName: "Section_1" },
        { level: 2, text: "Why does it matter?", componentName: "Section_2" },
        { level: 2, text: "Building your audit framework", componentName: "Section_3" },
        { level: 3, text: "Step 1: Map your existing pages", componentName: "Subsection_1" },
        { level: 3, text: "Step 2: Score for relevance", componentName: "Subsection_2" },
      ],
      faqItems: [
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
      ],
      hasFaqComponent: true,
      hasHowToComponent: false,
    },
    parsedHtml: {
      title: "How to build an effective content strategy in 2026",
      metaDescription:
        "A practical guide to building a content strategy that delivers measurable results across SEO, AEO and AI search channels.",
      lastModifiedMeta: null,
      articleModifiedTimeMeta: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      headings: [
        { level: 1, text: "How to build an effective content strategy in 2026" },
        { level: 2, text: "What is a content strategy?" },
        { level: 2, text: "Why does it matter?" },
        { level: 2, text: "Building your audit framework" },
        { level: 3, text: "Step 1: Map your existing pages" },
        { level: 3, text: "Step 2: Score for relevance" },
      ],
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
      paragraphs: [
        "Content strategy is the planning, development, and management of content for a business or brand. A solid strategy aligns content to business goals, audience needs, and channel requirements.",
        "Modern content strategies must account for traditional search, answer engines, and AI-driven retrieval systems. Each surface has different relevance signals and content formats.",
        "Start by auditing your existing content. Identify gaps, duplicates, and pages that under-perform. Use that audit to prioritise where to invest in new content vs refreshes.",
      ],
      canonicalHref: `${SITE_DOMAIN}/blog/how-to-build-an-effective-content-strategy`,
      robotsMeta: "index, follow",
      googlebotMeta: null,
      ogTitle: "How to build an effective content strategy in 2026",
      ogDescription: "A practical guide to building a content strategy that delivers measurable results.",
      ogImage: `${SITE_DOMAIN}/images/hero.jpg`,
      jsonLdBlocks: [
        { type: "FAQPage", raw: { "@type": "FAQPage" } },
        { type: "BreadcrumbList", raw: { "@type": "BreadcrumbList" } },
      ],
      hasMain: true,
      hasArticle: true,
      hasNav: true,
      hasHeader: true,
      interactiveElementsMissingLabel: 0,
    },
    robotsTxt: {
      googleExtended: "allowed",
      gptBot: "blocked",
      claudeBot: "allowed",
      perplexityBot: "allowed",
      amazonBot: "unknown",
      appleBotExtended: "unknown",
    },
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

interface FixtureRowInput {
  id: string;
  name: string;
  route: string;
  daysOld: number;
  pillars: SiteScoreResult["pillars"];
  description?: string;
}

function buildRow(input: FixtureRowInput): PageMatrixRow {
  const lastUpdated = new Date(Date.now() - input.daysOld * 86_400_000);
  return {
    id: input.id,
    name: input.name,
    route: input.route,
    pageUrl: `${SITE_DOMAIN}${input.route}`,
    templateId: "article-template-id",
    lastModified: lastUpdated.toISOString(),
    metaTitle: input.name,
    metaDescription: input.description ?? null,
    score: makeFixtureScore(input.pillars),
    scanStatus: "scanned",
    lastScannedAt: new Date().toISOString(),
  };
}

export function makeTestSitePages(): PageMatrixRow[] {
  return [
    // Critical (total < 40)
    buildRow({
      id: "p1", name: "About", route: "/about", daysOld: 1200,
      pillars: { crawlability: 3, structured: 0, answerability: 4, authority: 5, retrievability: 4 },
    }),
    buildRow({
      id: "p2", name: "Legacy product page", route: "/products/legacy", daysOld: 900,
      pillars: { crawlability: 6, structured: 3, answerability: 4, authority: 6, retrievability: 6 },
    }),
    buildRow({
      id: "p3", name: "Empty draft", route: "/blog/draft", daysOld: 800,
      pillars: { crawlability: 4, structured: 0, answerability: 2, authority: 4, retrievability: 5 },
    }),
    // Warning (40–70)
    buildRow({
      id: "p4", name: "Pricing", route: "/pricing", daysOld: 400,
      pillars: { crawlability: 9, structured: 6, answerability: 10, authority: 12, retrievability: 12 },
    }),
    buildRow({
      id: "p5", name: "Contact us", route: "/contact", daysOld: 200,
      pillars: { crawlability: 11, structured: 6, answerability: 8, authority: 15, retrievability: 14 },
    }),
    buildRow({
      id: "p6", name: "Old blog post", route: "/blog/intro-to-cms", daysOld: 500,
      pillars: { crawlability: 11, structured: 9, answerability: 12, authority: 10, retrievability: 14 },
    }),
    buildRow({
      id: "p7", name: "Solutions overview", route: "/solutions/overview", daysOld: 300,
      pillars: { crawlability: 11, structured: 6, answerability: 10, authority: 14, retrievability: 14 },
    }),
    buildRow({
      id: "p8", name: "Customer story", route: "/blog/case-study-acme", daysOld: 250,
      pillars: { crawlability: 11, structured: 14, answerability: 14, authority: 14, retrievability: 14 },
    }),
    // Good (> 70)
    buildRow({
      id: "p9", name: "Homepage", route: "/", daysOld: 30,
      pillars: { crawlability: 14, structured: 17, answerability: 16, authority: 22, retrievability: 18 },
      description: "The digital experience platform for building content-led customer journeys.",
    }),
    buildRow({
      id: "p10", name: "Blog: SEO playbook 2026", route: "/blog/seo-playbook-2026", daysOld: 45,
      pillars: { crawlability: 14, structured: 17, answerability: 18, authority: 23, retrievability: 18 },
      description: "A practical playbook for ranking across traditional and AI-driven search in 2026.",
    }),
    buildRow({
      id: "p11", name: "Solutions: marketing", route: "/solutions/marketing", daysOld: 90,
      pillars: { crawlability: 13, structured: 14, answerability: 16, authority: 20, retrievability: 16 },
      description: "Marketing solutions for personalising and orchestrating omnichannel campaigns.",
    }),
    buildRow({
      id: "p12", name: "Blog: AEO essentials", route: "/blog/aeo-essentials", daysOld: 60,
      pillars: { crawlability: 14, structured: 20, answerability: 18, authority: 22, retrievability: 18 },
      description: "What answer-engine optimisation is and how it differs from classic SEO.",
    }),
  ];
}
