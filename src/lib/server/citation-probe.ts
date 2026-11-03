// ─────────────────────────────────────────────────────────────────────────────
// Citation probes for /api/citation-probe (plan section 8, Layer 2).
//
// - Questions: Claude suggests 5–10 non-branded questions the page should
//   answer, from its main text (structured output, effort medium). The page is
//   fetched through safeFetch (SSRF protection).
// - Probe: one question to Claude with the server-side web search tool, in
//   direct mode (`allowed_callers: ["direct"]`): with the tool's default
//   dynamic filtering the answer carries no citations (SPIKE-FINDINGS §5).
//   Forced tool_choice isn't available on Opus 5.5, so the system prompt
//   requires a search and a question that didn't search is asked once more.
// - What comes back is evidence (result and cited URLs), not verdicts:
//   classify.ts computes Found and Cited from it.
// - Results are cached for 7 days per page, question and country, and uncached
//   probes are rate-limited per site. Both live in this server instance's
//   memory (plan section 12, decision 2: no shared storage yet).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { contentKey, normaliseText } from "@/lib/ai/content-key";
import { hostOf } from "@/lib/citations/classify";
import { PROBE_CACHE_MS, QUESTION_MAX, QUESTION_MAX_CHARS, type ProbeEvidence } from "@/lib/citations/types";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { fallbackParams, getAnthropic, LruCache, structuredCall, type StructuredResult } from "./anthropic";
import { safeFetch as appSafeFetch } from "./safe-fetch";

/** Bump when a prompt or the evidence shape changes, so cached results aren't reused. */
export const PROBE_VERSION = "2026-11-02.1";

/** pause_turn: the paused assistant turn is sent back unchanged, at most this often. */
const MAX_CONTINUATIONS = 3;
/** A web search turn takes about 20 s; the SDK's 30 s default would cut some off. */
const PROBE_TIMEOUT_MS = 60_000;
/** No new continuation or retry starts after this, so the route finishes within maxDuration. */
const PROBE_DEADLINE_MS = 80_000;
const EXCERPT_CHARS = 600;

// USD list prices per MTok, for the logs (checked 2026-10-23, SPIKE-FINDINGS §5).
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};
const PRICE_PER_SEARCH = 10 / 1000;

export const PROBE_SYSTEM =
  "You are an AI search assistant. For every question, you must search the web with the web_search tool before answering, even when you think you know the answer: never answer from memory alone. Then answer the question helpfully and concisely, citing the sources you used.";

// ── Evidence from the response blocks ────────────────────────────────────────

/** The blocks after the last fallback block: the answer the user sees. */
function answerBlocks(content: BetaContentBlock[]): BetaContentBlock[] {
  let start = 0;
  content.forEach((b, i) => {
    if (b.type === "fallback") start = i + 1;
  });
  return content.slice(start);
}

/**
 * Found comes from every search result, whichever model searched; Cited only
 * from the answer that was shown (after a fallback, the fallback's answer).
 */
export function extractEvidence(messages: BetaMessage[], question: string): Omit<ProbeEvidence, "retried" | "ranAt"> {
  const blocks = messages.flatMap((m) => m.content);
  const resultUrls: string[] = [];
  const queries: string[] = [];
  const searchErrors: string[] = [];
  let searched = false;
  for (const block of blocks) {
    if (block.type === "server_tool_use" && block.name === "web_search") {
      const q = (block.input as { query?: unknown } | null)?.query;
      if (typeof q === "string") queries.push(q);
    }
    if (block.type === "web_search_tool_result") {
      // Success is a list (possibly empty); an error is a single object.
      if (Array.isArray(block.content)) {
        searched = true;
        for (const r of block.content) resultUrls.push(r.url);
      } else {
        searchErrors.push(block.content.error_code);
      }
    }
  }

  const last = messages.at(-1);
  const citedUrls: string[] = [];
  let text = "";
  for (const block of answerBlocks(blocks)) {
    if (block.type !== "text") continue;
    text += block.text;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location") citedUrls.push(c.url);
    }
  }

  return {
    question,
    searched,
    resultUrls,
    citedUrls,
    queries,
    searchErrors,
    excerpt: normaliseText(text).slice(0, EXCERPT_CHARS),
    refused: last?.stop_reason === "refusal",
    model: last?.model ?? "",
  };
}

function estimateCost(messages: BetaMessage[]): number {
  let usd = 0;
  for (const m of messages) {
    const p = PRICES[m.model] ?? PRICES["claude-opus-5-5"];
    const u = m.usage;
    usd += (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead) / 1e6;
    usd += (u.server_tool_use?.web_search_requests ?? 0) * PRICE_PER_SEARCH;
  }
  return usd;
}

// ── One probe ────────────────────────────────────────────────────────────────

export interface ProbeOptions {
  question: string;
  model: string;
  /** ISO 3166-1 alpha-2, for web search's approximate location. */
  country: string | null;
  client?: Anthropic;
  /** For tests: the deadline clock. */
  now?: () => number;
}

/** One conversation, continued through pause_turn. */
async function ask(opts: ProbeOptions, deadline: number): Promise<BetaMessage[]> {
  const anthropic = opts.client ?? getAnthropic();
  const now = opts.now ?? Date.now;
  const conversation: BetaMessageParam[] = [{ role: "user", content: opts.question }];
  const messages: BetaMessage[] = [];
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const message = await anthropic.beta.messages.create(
      {
        model: opts.model,
        max_tokens: 16000,
        output_config: { effort: "low" },
        // Stable prefix (tools, then system) first; the question comes after it.
        system: [{ type: "text", text: PROBE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: conversation,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 3,
            allowed_callers: ["direct"],
            ...(opts.country ? { user_location: { type: "approximate" as const, country: opts.country } } : {}),
          },
        ],
        ...fallbackParams(opts.model),
      },
      // A retried timeout would pay for the searches twice; the user can re-run one question instead.
      { timeout: PROBE_TIMEOUT_MS, maxRetries: 0 },
    );
    messages.push(message);
    if (message.stop_reason !== "pause_turn" || now() > deadline) break;
    conversation.push({ role: "assistant", content: message.content });
  }
  return messages;
}

/** Asks the question, and once more when no search ran. API errors are thrown. */
export async function probeQuestion(opts: ProbeOptions): Promise<ProbeEvidence> {
  const now = opts.now ?? Date.now;
  const deadline = now() + PROBE_DEADLINE_MS;
  let messages = await ask(opts, deadline);
  let evidence = extractEvidence(messages, opts.question);
  let cost = estimateCost(messages);
  let retried = false;
  if (!evidence.searched && !evidence.refused && now() < deadline) {
    retried = true;
    messages = await ask(opts, deadline);
    evidence = extractEvidence(messages, opts.question);
    cost += estimateCost(messages);
  }
  const usage = messages.reduce(
    (acc, m) => ({
      searches: acc.searches + (m.usage.server_tool_use?.web_search_requests ?? 0),
      cacheRead: acc.cacheRead + (m.usage.cache_read_input_tokens ?? 0),
    }),
    { searches: 0, cacheRead: 0 },
  );
  console.info(
    `[citation-probe] ${evidence.model}: searched=${evidence.searched} searches=${usage.searches} results=${evidence.resultUrls.length} ` +
      `citations=${evidence.citedUrls.length} retried=${retried} refused=${evidence.refused} cache_read=${usage.cacheRead} ~$${cost.toFixed(3)}`,
  );
  return { ...evidence, retried, ranAt: new Date().toISOString() };
}

// ── Questions ────────────────────────────────────────────────────────────────

const QUESTIONS_SYSTEM =
  "You write the questions real people type into AI assistants such as ChatGPT, Claude or Perplexity. You never mention a brand, company or website by name.";

const QuestionsSchema = z.object({
  questions: z
    .array(z.string().describe("One question, as a person would ask it, under 200 characters"))
    .describe("8 different questions"),
});

export interface PageForQuestions {
  url: string;
  title: string | null;
  headings: string[];
  mainText: string;
}

const MAIN_TEXT_FOR_QUESTIONS = 8_000;

export function questionsPrompt(page: PageForQuestions): string {
  return `Here is a web page. Write 8 realistic, non-branded questions that someone might ask an AI assistant, which this page answers well. The aim is to test whether AI search cites this page.

Rules:
- Ask about the topic, not about the company: never name the brand, the company, its products by brand name, or the website.
- Mix question types: how-to, what-is, comparisons, costs, "should I", and specific details the page covers.
- Each question must be answerable from the page's content.
- Keep each question under 200 characters, in the page's language.

URL: ${page.url}
Title: ${page.title ?? "(none)"}
Headings: ${page.headings.slice(0, 30).join(" | ") || "(none)"}

Main text:
${page.mainText.slice(0, MAIN_TEXT_FOR_QUESTIONS) || "(no text found)"}`;
}

/** Trims, drops duplicates and over-long questions, and keeps at most QUESTION_MAX. */
export function cleanQuestions(questions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of questions) {
    const q = normaliseText(raw);
    const key = q.toLowerCase();
    if (!q || q.length > QUESTION_MAX_CHARS || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out.slice(0, QUESTION_MAX);
}

type Fetcher = typeof appSafeFetch;

/** The page's title, headings and main text. Throws SafeFetchError, or an Error for a non-200 page. */
export async function readPageForQuestions(url: string, fetcher: Fetcher = appSafeFetch): Promise<PageForQuestions> {
  const res = await fetcher(url, { publicHeaders: { accept: "text/html" }, timeoutMs: 10_000 });
  if (!res.ok) throw new Error(`page ${res.status}`);
  const html = extractParsedHtml(await res.text());
  return {
    url: res.url || url,
    title: html.title,
    headings: html.headings.map((h) => h.text),
    mainText: html.mainText,
  };
}

export async function generateQuestions(
  page: PageForQuestions,
  model: string,
  client?: Anthropic,
): Promise<StructuredResult<{ questions: string[] }>> {
  const res = await structuredCall({
    label: "citation-questions",
    model,
    effort: "medium",
    schema: QuestionsSchema,
    system: [{ type: "text", text: QUESTIONS_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: questionsPrompt(page) }],
    client,
  });
  return res.ok ? { ...res, data: { questions: cleanQuestions(res.data.questions) } } : res;
}

// ── Cache and rate limit (this instance only) ────────────────────────────────

interface CachedProbe {
  at: number;
  evidence: ProbeEvidence;
}

export const probeCache = new LruCache<CachedProbe>(1000);

export function probeKey(parts: { model: string; pageUrl: string; question: string; country: string | null }): Promise<string> {
  return contentKey(["citation-probe", PROBE_VERSION, parts.model, parts.pageUrl, parts.question, parts.country ?? ""]);
}

export function readProbeCache(key: string, now = Date.now()): ProbeEvidence | null {
  const hit = probeCache.get(key);
  return hit && now - hit.at < PROBE_CACHE_MS ? hit.evidence : null;
}

export function writeProbeCache(key: string, evidence: ProbeEvidence, now = Date.now()): void {
  probeCache.set(key, { at: now, evidence });
}

/** Uncached probes per site per hour. A page run is 5–10. */
export const PROBES_PER_SITE_PER_HOUR = 40;
const HOUR_MS = 60 * 60 * 1000;

export class SiteRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit = PROBES_PER_SITE_PER_HOUR, private readonly windowMs = HOUR_MS) {}

  /** Records a probe for the site and returns true, or returns false when the site is over the limit. */
  take(site: string, now = Date.now()): boolean {
    const recent = (this.hits.get(site) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(site, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(site, recent);
    return true;
  }
}

export const probeLimiter = new SiteRateLimiter();

/** The rate limit's key: the page's host without "www.". */
export const siteOf = (pageUrl: string) => hostOf(pageUrl);
