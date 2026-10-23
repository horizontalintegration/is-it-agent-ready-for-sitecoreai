// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 spike — one citation probe (plan section 8, Layer 2).
//
// Sends one non-branded question to Claude with the server-side web search
// tool and measures, from the response blocks (not the model's own claims):
//   found  — the domain appears in any web_search_tool_result
//   cited  — the domain appears in a web_search_result_location citation
//   citedInstead — the other cited domains
//
// Usage (Node 24 strips types natively):
//   ANTHROPIC_API_KEY=... node scripts/spikes/citation-probe.mts \
//     --domain example.com --question "How do I ...?" [--country US] [--out probe.json]
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
// USD list prices checked 2026-10-23 (platform.claude.com pricing + web search docs)
const PRICE = { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, perSearch: 10 / 1000 };
const MAX_CONTINUATIONS = 3;

const { values } = parseArgs({
  options: {
    domain: { type: "string" },
    question: { type: "string" },
    country: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.domain || !values.question) {
  console.error("Usage: --domain example.com --question \"...\" [--country US] [--out file.json]");
  process.exit(1);
}

const targetHost = values.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
const isTarget = (url: string) => {
  const h = hostOf(url);
  return h === targetHost || h.endsWith(`.${targetHost}`);
};

const client = new Anthropic();

async function run(): Promise<{ messages: BetaMessage[] }> {
  const conversation: BetaMessageParam[] = [{ role: "user", content: values.question! }];
  const responses: BetaMessage[] = [];

  // pause_turn: send the paused assistant turn back unchanged and continue
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "Answer the user's question the way a helpful AI search assistant would, using web search. Cite your sources.",
      messages: conversation,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 3,
          ...(values.country ? { user_location: { type: "approximate" as const, country: values.country } } : {}),
        },
      ],
    });
    responses.push(response);
    if (response.stop_reason !== "pause_turn") break;
    conversation.push({ role: "assistant", content: response.content });
  }
  return { messages: responses };
}

function measure(messages: BetaMessage[]) {
  const blocks: BetaContentBlock[] = messages.flatMap((m) => m.content);
  const searchResultUrls: string[] = [];
  const searchErrors: string[] = [];
  const queries: string[] = [];
  const citedUrls: string[] = [];
  let nestedResultBlocks = 0;

  for (const block of blocks) {
    if (block.type === "server_tool_use" && block.name === "web_search") {
      const q = (block.input as { query?: unknown })?.query;
      if (typeof q === "string") queries.push(q);
    }
    if (block.type === "web_search_tool_result") {
      if (block.caller && block.caller.type !== "direct") nestedResultBlocks++;
      // Success content is a list; an error is a single object
      if (Array.isArray(block.content)) {
        for (const r of block.content) searchResultUrls.push(r.url);
      } else {
        searchErrors.push(block.content.error_code);
      }
    }
    if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") citedUrls.push(c.url);
      }
    }
  }

  const last = messages.at(-1)!;
  const usage = messages.reduce(
    (acc, m) => ({
      input: acc.input + m.usage.input_tokens,
      output: acc.output + m.usage.output_tokens,
      cacheRead: acc.cacheRead + (m.usage.cache_read_input_tokens ?? 0),
      searches: acc.searches + (m.usage.server_tool_use?.web_search_requests ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, searches: 0 },
  );
  const costUsd =
    (usage.input * PRICE.inputPerMTok + usage.output * PRICE.outputPerMTok + usage.cacheRead * PRICE.cacheReadPerMTok) / 1e6 +
    usage.searches * PRICE.perSearch;

  const citedInstead = [...new Set(citedUrls.filter((u) => !isTarget(u)).map(hostOf))];

  return {
    model: last.model,
    stopReason: last.stop_reason,
    stopDetails: last.stop_details ?? null,
    continuations: messages.length - 1,
    domain: targetHost,
    question: values.question,
    found: searchResultUrls.some(isTarget),
    cited: citedUrls.some(isTarget),
    citedInstead,
    queries,
    searchResultCount: searchResultUrls.length,
    nestedResultBlocks,
    searchErrors,
    citedUrls: [...new Set(citedUrls)],
    usage,
    estimatedCostUsd: Number(costUsd.toFixed(4)),
    answer: blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""),
  };
}

try {
  const { messages } = await run();
  const result = measure(messages);
  if (result.stopReason === "refusal") console.warn("Request was refused:", result.stopDetails);
  console.log(JSON.stringify({ ...result, answer: result.answer.slice(0, 600) }, null, 2));
  if (values.out) {
    writeFileSync(values.out, JSON.stringify({ result, raw: messages }, null, 2));
    console.error(`Full result and raw responses written to ${values.out}`);
  }
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError) console.error("Authentication failed: set ANTHROPIC_API_KEY.");
  else if (err instanceof Anthropic.RateLimitError) console.error("Rate limited; retry later.");
  else if (err instanceof Anthropic.APIError) console.error(`API error ${err.status}: ${err.message}`);
  else throw err;
  process.exit(1);
}
