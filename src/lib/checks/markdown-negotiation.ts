// ─────────────────────────────────────────────────────────────────────────────
// The accept.md checks (plan section 5.2, P5): does a URL serve Markdown when
// an agent asks for it? S3 runs them on the home page, P5 on each page.
//   (a) 200 + `text/markdown` + a Markdown body for `Accept: text/markdown`
//   (b) HTML still served for `text/html` (browsers keep working)
//   (c) `Vary: Accept`, so caches keep the two versions apart
//   (d) the Markdown is smaller than the HTML (it isn't the page re-sent)
// Without (a) the credit is 0; with it, 0.5 plus an equal share of (b)–(d).
// ─────────────────────────────────────────────────────────────────────────────

/** The Accept header for the Markdown request, as an agent that also takes HTML sends it. S3 and P5 both use it. */
export const MARKDOWN_ACCEPT = "text/markdown, text/html;q=0.5";

export interface NegotiationInput {
  markdown: { status: number | null; contentType: string | null; vary: string | null; body: string | null; bytes: number };
  html: { status: number | null; contentType: string | null; bytes: number };
}

export interface NegotiationResult {
  /** False when neither request got a response. */
  checked: boolean;
  servesMarkdown: boolean;
  htmlFallback: boolean;
  varyAccept: boolean;
  smaller: boolean;
  /** How much smaller the Markdown is, in %. Null without Markdown. */
  savingPct: number | null;
  credit: number;
}

/** "text/html; charset=utf-8" → "text/html". */
export const mediaType = (contentType: string | null) => (contentType ?? "").split(";")[0].trim().toLowerCase();

export function looksLikeMarkdown(body: string | null): boolean {
  const text = (body ?? "").trim();
  if (!text || text.startsWith("<")) return false;
  return /^#{1,6}\s|\]\(|^\s*[-*+]\s|^\s*\d+\.\s|^---\s*$/m.test(text);
}

export function gradeNegotiation({ markdown, html }: NegotiationInput): NegotiationResult {
  const checked = markdown.status !== null || html.status !== null;
  const servesMarkdown = markdown.status === 200 && mediaType(markdown.contentType) === "text/markdown" && looksLikeMarkdown(markdown.body);
  const htmlFallback = html.status === 200 && mediaType(html.contentType) === "text/html";
  const varyAccept = (markdown.vary ?? "").split(",").some((v) => ["accept", "*"].includes(v.trim().toLowerCase()));
  const smaller = servesMarkdown && html.bytes > 0 && markdown.bytes < html.bytes;
  const savingPct = servesMarkdown && html.bytes > 0 ? Math.max(0, Math.round((1 - markdown.bytes / html.bytes) * 100)) : null;
  const extras = [htmlFallback, varyAccept, smaller].filter(Boolean).length;
  return {
    checked,
    servesMarkdown,
    htmlFallback,
    varyAccept,
    smaller,
    savingPct,
    credit: servesMarkdown ? 0.5 + (0.5 * extras) / 3 : 0,
  };
}

/** What the Markdown request got back, in words: "text/html", "HTTP 404 (application/json)" or "no response (timeout)". */
export function markdownResponseType(markdown: { status: number | null; contentType: string | null; error?: string | null }): string {
  if (markdown.status === null) return `no response (${markdown.error ?? "failed"})`;
  const type = mediaType(markdown.contentType);
  // An endpoint that's there but fails (accept-md on Vercel answered 404 JSON) shouldn't read as a content type.
  if (markdown.status !== 200) return type ? `HTTP ${markdown.status} (${type})` : `HTTP ${markdown.status}`;
  return type || `HTTP ${markdown.status}`;
}

export interface NegotiationTile {
  id: "markdown" | "html" | "vary" | "distinct";
  label: string;
  status: "pass" | "fail" | "na";
  text: string;
}

/** The four checks as the Agent View's status tiles show them. (d) waits for (a). */
export function negotiationTiles(g: NegotiationResult, markdownType: string, htmlType: string): NegotiationTile[] {
  return [
    {
      id: "markdown",
      label: "Markdown response",
      status: g.servesMarkdown ? "pass" : "fail",
      text: g.servesMarkdown ? "Returned text/markdown" : `Returned ${markdownType}`,
    },
    {
      id: "html",
      label: "HTML fallback",
      status: g.htmlFallback ? "pass" : "fail",
      text: g.htmlFallback ? "Browsers still get HTML" : `Browsers got ${htmlType}`,
    },
    {
      id: "vary",
      label: "Vary: Accept",
      status: g.varyAccept ? "pass" : "fail",
      text: g.varyAccept ? "Caches keep the two apart" : "Header missing, so caches may mix versions",
    },
    {
      id: "distinct",
      label: "Distinct versions",
      status: !g.servesMarkdown ? "na" : g.smaller ? "pass" : "fail",
      text: !g.servesMarkdown
        ? "Checked once Markdown is served"
        : g.smaller
          ? `${g.savingPct}% smaller than the HTML`
          : "Not smaller than the HTML",
    },
  ];
}
