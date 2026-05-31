// ─────────────────────────────────────────────────────────────────────────────
// Input types — pre-fetched data passed into the rule engine
// All Sitecore SDK and HTML parsing happens OUTSIDE this file.
// ─────────────────────────────────────────────────────────────────────────────

export type Pillar = "seo" | "aeo" | "content-quality";
export type Trigger = "live" | "preview" | "on-load" | "ai" | "psi";
export type CheckStatus = "pass" | "warning" | "fail" | "info";

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
  richTextFull: string;         // full concatenated body text, HTML stripped
  images: ImageField[];
  links: LinkField[];
  headings: HeadingField[];     // from Heading component fields, in layout order
  faqItems: FaqItem[];

  // Component presence flags
  hasFaqComponent: boolean;
  hasHowToComponent: boolean;
}

// ── Parsed HTML (from preview fetch + node-html-parser) ──────────────────────

export interface JsonLdBlock {
  type: string;       // value of @type field
  raw: unknown;       // full parsed object
}

export interface ParsedHtml {
  // <title> text and <meta name="description"> content
  title: string | null;
  metaDescription: string | null;

  // Rendered heading structure in DOM order
  headings: Array<{ level: number; text: string }>;

  // Rendered <img> tags (across all components), in DOM order
  images: Array<{ src: string; alt: string | null }>;

  // Rendered <a> tags inside <main> (content links), in DOM order
  links: Array<{ anchorText: string | null; href: string | null }>;

  // Rendered <p> text inside <main> (content paragraphs), in DOM order
  paragraphs: string[];

  // Meta / link tags
  canonicalHref: string | null;
  robotsMeta: string | null;    // content attr of <meta name="robots">
  googlebotMeta: string | null; // content attr of <meta name="googlebot">

  // Open Graph
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;

  // Structured data
  jsonLdBlocks: JsonLdBlock[];

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

// ── Aggregated input to the rule engine ──────────────────────────────────────

export interface PageData {
  // The page's canonical URL — used for canonical self-reference check
  pageUrl: string;

  authoring: AuthoringFields;
  parsedHtml: ParsedHtml | null;   // null if preview fetch hasn't run yet
  robotsTxt: RobotsTxt | null;     // null if not yet fetched
  psi: PsiResult | null;           // null if PSI hasn't run yet
  ai: AiResults | null;            // null if AI checks haven't run yet
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleResult {
  id: string;
  pillar: Pillar;
  trigger: Trigger;
  name: string;

  status: CheckStatus;
  score: number;       // points earned for this check
  maxScore: number;    // 0 for info-only checks

  // Human-readable output
  value: string;           // what was found, e.g. "58 chars"
  message: string;         // short verdict, e.g. "Title is within the ideal range"
  fixSuggestion: string;   // actionable next step, empty string if passing

  // Optional detail items (e.g. list of images missing alt, list of blocked crawlers)
  details: string[];

  // Optional flagged items needing attention, shown in their own list (e.g. paragraphs above target grade)
  flaggedItems?: string[];

  // Optional ready-to-paste code snippet (e.g. generated JSON-LD), shown in a code block
  codePreview?: string;
}

export interface GateResult {
  blocked: boolean;
  reason: string; // empty if not blocked
}

export interface EngineOutput {
  gate: GateResult;

  // Only populated when gate.blocked === false
  results: RuleResult[];
  seoScore: number;
  aeoScore: number;
  contentQualityScore: number;
  totalScore: number;
  maxSeoScore: number;
  maxAeoScore: number;
  maxContentQualityScore: number;
  maxTotalScore: number;
}
