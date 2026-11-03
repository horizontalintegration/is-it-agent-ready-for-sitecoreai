import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Shared Claude API setup for the AI routes (plan section 9).
//
// - Model from ANTHROPIC_MODEL; ai-check uses ANTHROPIC_MODEL_BULK when set.
// - Every call sets effort explicitly and returns JSON through structured
//   outputs (output_config.format), validated against a zod schema.
// - Server-side refusal fallback on the models that accept it. stop_reason is
//   checked before any content is read.
// - A small in-memory cache for AI results keyed by content hash. It lives as
//   long as the server instance; the browser keeps its own cache as well.
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Models that accept `fallbacks: "default"` on the Claude API. */
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-sonnet-5-5",
]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The refusal-fallback request fields for `model`; none for a model that doesn't accept them. */
export function fallbackParams(model: string): { betas?: string[]; fallbacks?: "default" } {
  return FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {};
}

export type ModelPurpose = "default" | "bulk";

/**
 * `default`: generate-meta and citation-probe. `bulk`: ai-check, which the
 * dashboard runs for every page. It is used in the panel too, so a page gets
 * the same rating (and cache entry) in both places.
 */
export function getModel(purpose: ModelPurpose = "default"): string {
  const main = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  if (purpose === "bulk") return process.env.ANTHROPIC_MODEL_BULK?.trim() || main;
  return main;
}

let client: Anthropic | null = null;

/**
 * Calls take 1–15 s. A 30 s timeout with one retry caps a stalled request at
 * about a minute, where the SDK default (10 min, 2 retries) would leave the
 * author waiting.
 */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 });
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Effort = "low" | "medium" | "high";

export interface StructuredCallOptions<S extends z.ZodType> {
  /** Label for logs, e.g. "ai-check:uniqueness". */
  label: string;
  model: string;
  effort: Effort;
  schema: S;
  system: string | BetaTextBlockParam[];
  messages: BetaMessageParam[];
  maxTokens?: number;
  client?: Anthropic;
}

export type StructuredResult<T> =
  | { ok: true; data: T; message: BetaMessage }
  | {
      ok: false;
      error: "refused";
      category: string | null;
      explanation: string | null;
      message: BetaMessage;
    }
  | { ok: false; error: "max_tokens"; message: BetaMessage }
  /** The JSON parsed but failed the schema (e.g. a length limit). `raw` is the parsed JSON. */
  | { ok: false; error: "invalid_output"; issues: z.core.$ZodIssue[]; raw: unknown; message: BetaMessage };

/** Text of the answer. After a fallback, only the blocks the fallback model wrote. */
function answerText(content: BetaContentBlock[]): string {
  let start = 0;
  content.forEach((b, i) => {
    if (b.type === "fallback") start = i + 1;
  });
  return content
    .slice(start)
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function logUsage(label: string, message: BetaMessage): void {
  const u = message.usage;
  const fellBack = (u.iterations ?? []).some((it) => it.type === "fallback_message");
  console.info(
    `[anthropic] ${label}: ${message.model}${fellBack ? " (fallback)" : ""}, stop=${message.stop_reason}, ` +
      `in=${u.input_tokens} out=${u.output_tokens} ` +
      `cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`,
  );
}

/**
 * One Messages call that must return JSON matching `schema`.
 * API errors (auth, rate limit, network) are thrown; see `aiErrorResponse`.
 */
export async function structuredCall<S extends z.ZodType>(
  opts: StructuredCallOptions<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const anthropic = opts.client ?? getAnthropic();

  const message = await anthropic.beta.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
    ...fallbackParams(opts.model),
  });
  logUsage(opts.label, message);

  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      error: "refused",
      category: message.stop_details?.category ?? null,
      explanation: message.stop_details?.explanation ?? null,
      message,
    };
  }
  if (message.stop_reason === "max_tokens") {
    return { ok: false, error: "max_tokens", message };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(answerText(message.content));
  } catch {
    return { ok: false, error: "invalid_output", issues: [], raw: null, message };
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_output", issues: parsed.error.issues, raw, message };
  }
  return { ok: true, data: parsed.data, message };
}

/** JSON body and status for a failed structured call. */
export function failureResponse(
  result: Exclude<StructuredResult<unknown>, { ok: true }>,
): { status: number; body: Record<string, unknown> } {
  switch (result.error) {
    case "refused":
      return {
        status: 422,
        body: { error: "refused", category: result.category, detail: result.explanation },
      };
    case "max_tokens":
      return { status: 502, body: { error: "ai_failed", detail: "max_tokens" } };
    case "invalid_output":
      return { status: 502, body: { error: "parse_error" } };
  }
}

/** JSON body and status for an error thrown by the SDK. */
export function aiErrorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 500, body: { error: "api_key_invalid" } };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, body: { error: "rate_limited" } };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, body: { error: "ai_failed", detail: `${err.status ?? ""} ${err.message}`.trim() } };
  }
  return { status: 502, body: { error: "ai_failed", detail: err instanceof Error ? err.message : "unknown_error" } };
}

/** Size-capped map that evicts the least recently used entry. */
export class LruCache<V> {
  private map = new Map<string, V>();
  constructor(private readonly max: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

/** Per-instance cache of AI results, keyed by content hash. */
export const aiResultCache = new LruCache<unknown>(1000);
