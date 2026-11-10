// ─────────────────────────────────────────────────────────────────────────────
// What /api/markdown-check returns: one page requested twice, as an agent
// (`Accept: text/markdown`) and as a browser (`Accept: text/html`). Raw
// evidence only: P5 and P6 grade it in the engine (src/lib/checks/page/read.ts),
// so the panel, the dashboard and the demo fixtures go through the same code.
// ─────────────────────────────────────────────────────────────────────────────

/** One request's outcome. Never thrown: a failed request has `status: null` and an `error`. */
export interface MarkdownProbe {
  /** After redirects. Null when the request failed. */
  finalUrl: string | null;
  status: number | null;
  /** "timeout", "too_large", "fetch_failed", "blocked_url", … */
  error: string | null;
  contentType: string | null;
  vary: string | null;
  /** Body size in bytes. */
  bytes: number;
  /** Estimated tokens: characters ÷ 4 (estimateTokens). */
  tokens: number;
}

/**
 * Where an HTML page's characters go (plan Phase 13, the Agent View's Before
 * view). Content is the main text the Markdown keeps; scripts, styles, markup
 * and chrome are what Markdown drops; structured data (JSON-LD) is neutral.
 */
export type AnatomyKind = "content" | "scripts" | "styles" | "markup" | "chrome" | "structuredData";

export interface HtmlAnatomy {
  /** Estimated tokens per category over the whole page. They add up to the probe's `tokens`. */
  tokens: Record<AnatomyKind, number>;
  /** Tokens before the first character of content in <body>; null when there's none. */
  contentStartsAt: number | null;
}

/** The start of the page's HTML, each run of characters with its category. */
export interface HtmlExcerpt {
  segments: Array<{ kind: AnatomyKind; text: string }>;
  /** Estimated tokens in the excerpt. */
  tokens: number;
  /** The page is longer than the excerpt. */
  truncated: boolean;
}

export interface MarkdownCheckData {
  /** The page requested. */
  url: string;
  checkedAt: string;
  /** The `Accept: text/markdown` request. */
  markdown: MarkdownProbe & {
    /**
     * The first 50,000 characters when it's served as text/markdown;
     * otherwise the first 2,000, enough to tell Markdown from HTML.
     */
    body: string | null;
    /** The body was cut to fit. */
    truncated: boolean;
  };
  /** The `Accept: text/html` request. */
  html: MarkdownProbe & {
    /** Tokens per category, when it returned an HTML page (200, text/html). Null otherwise. */
    anatomy: HtmlAnatomy | null;
    /** The first 16 KB, classified: only when asked for (`excerpt=1`, the panel). Null otherwise. */
    excerpt: HtmlExcerpt | null;
  };
  /**
   * The local conversion of the published HTML, when the page doesn't serve
   * Markdown: what it could send, and the estimated saving. Null otherwise.
   */
  preview: { markdown: string; tokens: number; truncated: boolean } | null;
}
