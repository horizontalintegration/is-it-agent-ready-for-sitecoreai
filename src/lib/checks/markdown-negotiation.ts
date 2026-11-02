// ─────────────────────────────────────────────────────────────────────────────
// The accept.md checks (plan section 5.2, P5): does a URL serve Markdown when
// an agent asks for it? S3 runs them on the home page; Phase 7's P5 runs them
// on each page.
//   (a) 200 + `text/markdown` + a Markdown body for `Accept: text/markdown`
//   (b) HTML still served for `text/html` (browsers keep working)
//   (c) `Vary: Accept`, so caches keep the two versions apart
//   (d) the Markdown is smaller than the HTML (it isn't the page re-sent)
// Without (a) the credit is 0; with it, 0.5 plus an equal share of (b)–(d).
// ─────────────────────────────────────────────────────────────────────────────

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
