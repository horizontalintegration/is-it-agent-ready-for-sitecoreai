// ─────────────────────────────────────────────────────────────────────────────
// Input types — pre-fetched data passed into the checks (src/lib/checks).
// All Sitecore SDK and HTML parsing happens OUTSIDE this file.
// ─────────────────────────────────────────────────────────────────────────────

import type { JsonLdScript } from "@/lib/checks/json-ld";
import type { PageFields } from "@/lib/checks/types";

// ── Authoring fields (from XMC GraphQL / field subscription) ─────────────────

export interface ImageField {
  componentName: string;
  alt: string | null;
}

export interface LinkField {
  componentName: string;
  anchorText: string | null;
  href: string | null;
}

export interface FaqItem {
  question: string;
  answer: string; // raw, may contain HTML
}

export interface HeadingField {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  componentName: string;
}

export interface AuthoringFields {
  // SEO meta
  pageTitle: string | null;
  metaDescription: string | null;

  // Open Graph
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;

  // E-E-A-T
  author: string | null;
  authorProfileLinked: boolean; // true if a linked author item is present
  publishDate: Date | null;
  lastUpdatedDate: Date | null;

  // Indexing controls (from page template "No Index" field)
  noIndexField: boolean;

  // Content
  richTextParagraphs: string[]; // plain text, one entry per paragraph (HTML stripped)
  richTextFull: string;         // full concatenated body text, HTML stripped. Not populated from Sitecore (always ""): the AI features use ParsedHtml.mainText
  images: ImageField[];
  links: LinkField[];
  headings: HeadingField[];     // from Heading component fields, in layout order
  faqItems: FaqItem[];

  // Component presence flags
  hasFaqComponent: boolean;
  hasHowToComponent: boolean;
}

// ── Parsed HTML (from preview fetch + node-html-parser) ──────────────────────

/** A question and its answer found in the rendered HTML (accordion or <details>). */
export interface QaPair {
  question: string;
  answer: string; // plain text
}

/** One block of rendered text, with the component it sits in. */
export interface BodyBlock {
  text: string;
  /** Nearest `data-component` value (e.g. "authorable/articles/relatedarticles"), or null. */
  component: string | null;
}

export interface ParsedHtml {
  // <title> text and <meta name="description"> content
  title: string | null;
  metaDescription: string | null;

  // Freshness signals from rendered HTML (preferred over Sitecore's __Updated):
  // <meta name="last-modified" content="...">  and
  // <meta property="article:modified_time" content="...">
  lastModifiedMeta: string | null;
  articleModifiedTimeMeta: string | null;

  // Rendered heading structure in DOM order
  headings: Array<{ level: number; text: string }>;

  // Rendered <img> tags (across all components), in DOM order
  images: Array<{ src: string; alt: string | null }>;

  // Rendered <a> tags inside <main> (content links), in DOM order
  links: Array<{ anchorText: string | null; href: string | null }>;

  // Rendered <p> text inside <main> (content paragraphs), in DOM order
  paragraphs: string[];

  // All readable text of <main> (or <body> without header/nav/footer), one
  // block per line, entities decoded. Sent to the AI checks as the page body.
  mainText: string;

  // Every text block in <body>, header, nav and footer included. P3 compares
  // the draft's blocks with the live page's to find client-rendered content.
  bodyBlocks: BodyBlock[];

  // <html lang>
  htmlLang: string | null;

  // Meta / link tags
  canonicalHref: string | null;
  robotsMeta: string | null;    // content attr of <meta name="robots">
  googlebotMeta: string | null; // content attr of <meta name="googlebot">

  // Open Graph
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: string | null;

  // Author signals: <meta name="author"> and <link|a rel="author" href>
  metaAuthor: string | null;
  relAuthorHref: string | null;

  // Every <script type="application/ld+json">, parsed or with its parse error.
  // Read it with src/lib/checks/json-ld.ts (@graph, @type arrays, subtypes).
  jsonLdScripts: JsonLdScript[];

  // Question/answer pairs from accordions (aria-controls) and <details>, in any component
  qaPairs: QaPair[];

  // Agentic landmarks
  hasMain: boolean;
  hasArticle: boolean;
  hasNav: boolean;
  hasHeader: boolean;
  interactiveElementsMissingLabel: number; // count of buttons/links with no text or aria-label
}

// ── Robots.txt (fetched once on app load) ────────────────────────────────────

export type CrawlerPermission = "allowed" | "blocked" | "unknown";

export interface RobotsTxt {
  googleExtended: CrawlerPermission;
  gptBot: CrawlerPermission;
  claudeBot: CrawlerPermission;
  perplexityBot: CrawlerPermission;
  amazonBot: CrawlerPermission;
  appleBotExtended: CrawlerPermission;
}

// ── Footer trust (fetched once per domain — site-level banner, AEO signal) ───
//
// Rendered-text counterpart to the Organization schema check: visible corporate
// identity signals in the page footer reduce entity ambiguity for AI systems.

export interface FooterTrust {
  hasAddress: boolean;   // postal address pattern (zip, or "City, CC") in footer text
  hasContact: boolean;   // link matching /contact
  hasPrivacy: boolean;   // link matching /privacy
  hasTerms: boolean;     // link matching /terms or /tos
  hasSecurity: boolean;  // link matching /security or /trust
  hasAbout: boolean;     // link matching /about
}

// ── PageSpeed Insights (from PSI API) ────────────────────────────────────────

export interface PsiResult {
  performanceScore: number; // 0–100
  isCrawlable: boolean;
  psiError?: string;        // set when PSI API returned an error (e.g. URL not publicly reachable)
  coreWebVitals: string[];  // e.g. ["LCP: 2.4 s", "FCP: 0.8 s", "CLS: 0.02", "TBT: 120 ms"]
  opportunities: string[];  // e.g. ["Reduce unused JavaScript — potential savings of 890 ms"]
}

// ── AI check results (from Claude API, pre-called before engine runs) ────────

export type UniquenessRating = "unique" | "borderline" | "commodity";

export interface AiResults {
  uniquenessRating: UniquenessRating;
  uniquenessExplanation: string;

  // info-only — not scored
  followUpGaps: Array<{
    question: string;
    covered: boolean;
  }>;
}

// ── Organization identity (for the Organization JSON-LD snippet) ─────────────

export interface OrganizationInfo {
  name: string | null;
  url: string | null;
  logo: string | null;
  description: string | null;
  /** Official profile URLs (LinkedIn, X, …) for `sameAs`. */
  sameAs: string[];
}

// ── Everything the panel knows about the open page (also the demo fixture) ───

export interface PageData {
  // The page URL — used for the canonical self-reference check
  pageUrl: string;
  // Public route ("/" for the home page)
  route: string;
  // Sitecore template display name (e.g. "Article Detail Page")
  templateName: string | null;

  // Site-level organization identity, from config with site fallbacks
  organization: OrganizationInfo;

  authoring: AuthoringFields;      // the panel field model (meta generator)
  fields: PageFields;              // the fields the checks read, same as the dashboard
  parsedHtml: ParsedHtml | null;   // null if preview fetch has not run yet
  robotsTxt: RobotsTxt | null;     // null if not yet fetched
  psi: PsiResult | null;           // null if PSI has not run yet
  ai: AiResults | null;            // null if AI checks have not run yet
}
