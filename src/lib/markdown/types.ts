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
  html: MarkdownProbe;
  /**
   * The local conversion of the published HTML, when the page doesn't serve
   * Markdown: what it could send, and the estimated saving. Null otherwise.
   */
  preview: { markdown: string; tokens: number; truncated: boolean } | null;
}
