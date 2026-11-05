// ─────────────────────────────────────────────────────────────────────────────
// Collects the evidence for P5 and P6 for /api/markdown-check: the page
// requested twice in parallel, as an agent (`Accept: text/markdown`, the same
// header S3 sends) and as a browser (`Accept: text/html`). Every request goes
// through safeFetch (SSRF protection). When no Markdown comes back, the
// published HTML is converted here for the preview and the estimated saving.
// The HTML page's tokens are broken down by category for the Agent View's
// Before view (plan Phase 13), with its first 16 KB when the panel asks.
// ─────────────────────────────────────────────────────────────────────────────

import { gradeNegotiation, MARKDOWN_ACCEPT, mediaType } from "@/lib/checks/markdown-negotiation";
import { analyseHtml, EXCERPT_MAX_CHARS } from "@/lib/markdown/anatomy";
import { estimateTokens, toAgentMarkdown } from "@/lib/markdown/convert";
import type { MarkdownCheckData, MarkdownProbe } from "@/lib/markdown/types";
import { safeFetch as appSafeFetch, SafeFetchError, validateUrl } from "./safe-fetch";

export const REQUEST_TIMEOUT_MS = 10_000;
/** Kept of a served Markdown body (and of the preview). */
export const MARKDOWN_BODY_MAX_CHARS = 50_000;
/** Kept of any other body: enough to tell Markdown from HTML. */
const OTHER_BODY_MAX_CHARS = 2_000;

type Fetcher = typeof appSafeFetch;

export interface MarkdownCheckOptions {
  fetch?: Fetcher;
  timeoutMs?: number;
  /** Hosts that skip the address check (tests; SAFE_FETCH_ALLOW_HOSTS otherwise). */
  allowHosts?: ReadonlySet<string>;
  /** Return the HTML's first 16 KB, classified (the panel's Before view). The dashboard doesn't ask. */
  excerpt?: boolean;
}

/** One GET. Never throws, except for a URL safeFetch refuses up front. */
async function request(fetcher: Fetcher, url: string, accept: string, timeoutMs: number): Promise<{ probe: MarkdownProbe; text: string | null }> {
  try {
    const res = await fetcher(url, { publicHeaders: { accept }, timeoutMs });
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(buf);
    return {
      probe: {
        finalUrl: res.url || url,
        status: res.status,
        error: null,
        contentType: res.headers.get("content-type"),
        vary: res.headers.get("vary"),
        bytes: buf.byteLength,
        tokens: estimateTokens(text),
      },
      text,
    };
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) throw err;
    return {
      probe: {
        finalUrl: null,
        status: null,
        error: err instanceof SafeFetchError ? err.code : "fetch_failed",
        contentType: null,
        vary: null,
        bytes: 0,
        tokens: 0,
      },
      text: null,
    };
  }
}

const cut = (text: string, max: number) => ({ text: text.slice(0, max), truncated: text.length > max });

export async function collectMarkdownCheck(url: string, options: MarkdownCheckOptions = {}): Promise<MarkdownCheckData> {
  const fetcher = options.fetch ?? appSafeFetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const pageUrl = validateUrl(url, options.allowHosts).href;

  const [md, html] = await Promise.all([
    request(fetcher, pageUrl, MARKDOWN_ACCEPT, timeoutMs),
    request(fetcher, pageUrl, "text/html", timeoutMs),
  ]);

  const isMarkdownType = mediaType(md.probe.contentType) === "text/markdown";
  const body = md.text === null ? null : cut(md.text, isMarkdownType ? MARKDOWN_BODY_MAX_CHARS : OTHER_BODY_MAX_CHARS);
  const g = gradeNegotiation({ markdown: { ...md.probe, body: body?.text ?? null }, html: html.probe });

  const isHtmlPage = html.probe.status === 200 && mediaType(html.probe.contentType) === "text/html" && Boolean(html.text);
  let preview: MarkdownCheckData["preview"] = null;
  if (!g.servesMarkdown && isHtmlPage) {
    const converted = toAgentMarkdown(html.text!, { url: html.probe.finalUrl ?? pageUrl });
    const kept = cut(converted, MARKDOWN_BODY_MAX_CHARS);
    preview = { markdown: kept.text, tokens: estimateTokens(converted), truncated: kept.truncated };
  }
  const analysed = isHtmlPage ? analyseHtml(html.text!, { excerptChars: options.excerpt ? EXCERPT_MAX_CHARS : undefined }) : null;

  return {
    url: pageUrl,
    checkedAt: new Date().toISOString(),
    markdown: { ...md.probe, body: body?.text ?? null, truncated: body?.truncated ?? false },
    html: { ...html.probe, anatomy: analysed?.anatomy ?? null, excerpt: analysed?.excerpt ?? null },
    preview,
  };
}
