import type { PageData } from "./types";
import type { PageMatrixRow } from "@/types/dashboard";
import { quickScore } from "./quick-score";

const SITE_DOMAIN = "https://example.com";

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

interface FixtureFieldsInput {
  pageTitle: string | null;
  metaDescription: string | null;
  author: string | null;
  daysOld: number;
  imagesMissingAlt: number;
  totalImages: number;
  faqValid: boolean;
  paragraphsHard: boolean;
}

function buildRow(
  id: string,
  name: string,
  path: string,
  input: FixtureFieldsInput
): PageMatrixRow {
  const lastUpdated = new Date(Date.now() - input.daysOld * 86_400_000);
  const images = Array.from({ length: input.totalImages }, (_, i) => ({
    componentName: `Image_${i + 1}`,
    alt: i < input.totalImages - input.imagesMissingAlt ? "alt text" : null,
  }));

  const score = quickScore({
    pageTitle: input.pageTitle,
    metaDescription: input.metaDescription,
    author: input.author,
    publishDate: lastUpdated,
    lastUpdatedDate: lastUpdated,
    images,
    hasFaqComponent: true,
    faqItems: input.faqValid
      ? [
          {
            question: "Sample question?",
            answer: "This is a properly sized answer that falls within the 30 to 300 character ideal range.",
          },
        ]
      : [
          {
            question: "Sample question?",
            answer: "short",
          },
        ],
    richTextParagraphs: input.paragraphsHard
      ? [
          "Notwithstanding the multidimensional ramifications of contemporary discursive paradigms, contemporary practitioners frequently encounter epistemologically fraught circumstances that necessitate sophisticated analytical engagement.",
        ]
      : [
          "This is a short and readable paragraph. It uses common words. It should grade easily under thirteen.",
        ],
  });

  return {
    id,
    name,
    path,
    templateId: "article-template-id",
    lastModified: lastUpdated.toISOString(),
    score,
    fields: {
      pageTitle: input.pageTitle,
      metaDescription: input.metaDescription,
      author: input.author,
      publishDate: lastUpdated.toISOString(),
      lastUpdatedDate: lastUpdated.toISOString(),
      noIndex: false,
      richTextParagraphs: [],
      images: images.map((i) => ({ componentName: i.componentName, alt: i.alt })),
      links: [],
      headings: [],
      faqItems: [],
      hasFaqComponent: true,
      hasHowToComponent: false,
    },
  };
}

export function makeTestSitePages(): PageMatrixRow[] {
  return [
    // Critical (score < 25)
    buildRow("p1", "About", "/about", {
      pageTitle: null,
      metaDescription: null,
      author: null,
      daysOld: 1200,
      imagesMissingAlt: 3,
      totalImages: 3,
      faqValid: false,
      paragraphsHard: true,
    }),
    buildRow("p2", "Legacy product page", "/products/legacy", {
      pageTitle: "Old",
      metaDescription: null,
      author: null,
      daysOld: 900,
      imagesMissingAlt: 2,
      totalImages: 2,
      faqValid: false,
      paragraphsHard: true,
    }),
    buildRow("p3", "Empty draft", "/blog/draft", {
      pageTitle: "Draft",
      metaDescription: "Too short",
      author: null,
      daysOld: 800,
      imagesMissingAlt: 1,
      totalImages: 1,
      faqValid: false,
      paragraphsHard: true,
    }),
    // Warning (25–45)
    buildRow("p4", "Pricing", "/pricing", {
      pageTitle: "Pricing for our platform — flexible plans for every team",
      metaDescription: null,
      author: "Sales Team",
      daysOld: 400,
      imagesMissingAlt: 1,
      totalImages: 4,
      faqValid: true,
      paragraphsHard: true,
    }),
    buildRow("p5", "Contact us", "/contact", {
      pageTitle: "Contact",
      metaDescription: "Get in touch with our team",
      author: "Support",
      daysOld: 200,
      imagesMissingAlt: 0,
      totalImages: 1,
      faqValid: true,
      paragraphsHard: false,
    }),
    buildRow("p6", "Old blog post", "/blog/intro-to-cms", {
      pageTitle: "Intro to content management — a beginner's guide for marketers",
      metaDescription:
        "An introduction to content management systems for marketing teams looking to adopt their first CMS this year.",
      author: "Sam Author",
      daysOld: 500,
      imagesMissingAlt: 1,
      totalImages: 2,
      faqValid: true,
      paragraphsHard: false,
    }),
    buildRow("p7", "Solutions overview", "/solutions/overview", {
      pageTitle: "Solutions overview",
      metaDescription:
        "Explore the full range of digital experience solutions for marketers, developers and content teams.",
      author: "Product Marketing",
      daysOld: 300,
      imagesMissingAlt: 2,
      totalImages: 5,
      faqValid: false,
      paragraphsHard: false,
    }),
    buildRow("p8", "Customer story", "/blog/case-study-acme", {
      pageTitle: "How Acme increased content velocity by 3x with the platform",
      metaDescription:
        "Acme Co used the platform to triple their content output while maintaining quality across SEO and AI surfaces.",
      author: "Customer Marketing",
      daysOld: 250,
      imagesMissingAlt: 0,
      totalImages: 3,
      faqValid: true,
      paragraphsHard: true,
    }),
    // Good (> 45) — likely unreachable until thresholds are reconciled
    buildRow("p9", "Homepage", "/", {
      pageTitle: "The platform for modern digital experience — built for content teams",
      metaDescription:
        "A composable digital experience platform for content teams, marketers and developers. Ship great content faster.",
      author: "Editorial Team",
      daysOld: 30,
      imagesMissingAlt: 0,
      totalImages: 4,
      faqValid: true,
      paragraphsHard: false,
    }),
    buildRow("p10", "Blog: SEO playbook 2026", "/blog/seo-playbook-2026", {
      pageTitle: "The complete SEO playbook for 2026 — what's changed and what works",
      metaDescription:
        "A comprehensive guide to SEO in 2026 covering AI features, AEO, structured data and the workflows your team needs.",
      author: "Editorial Team",
      daysOld: 45,
      imagesMissingAlt: 0,
      totalImages: 5,
      faqValid: true,
      paragraphsHard: false,
    }),
    buildRow("p11", "Solutions: marketing", "/solutions/marketing", {
      pageTitle: "Marketing solutions — orchestrate content across every channel",
      metaDescription:
        "Modern marketing solutions to plan, create, publish and measure content across every channel your audience touches.",
      author: "Product Marketing",
      daysOld: 90,
      imagesMissingAlt: 0,
      totalImages: 3,
      faqValid: true,
      paragraphsHard: false,
    }),
    buildRow("p12", "Blog: AEO essentials", "/blog/aeo-essentials", {
      pageTitle: "AEO essentials — getting your content into answer engines",
      metaDescription:
        "What answer engine optimisation means, how it differs from SEO, and the structured data your content needs.",
      author: "Editorial Team",
      daysOld: 60,
      imagesMissingAlt: 0,
      totalImages: 4,
      faqValid: true,
      paragraphsHard: false,
    }),
  ];
}
