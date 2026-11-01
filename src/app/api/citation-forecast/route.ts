import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contentKey } from "@/lib/ai/content-key";
import {
  aiErrorResponse,
  aiResultCache,
  failureResponse,
  getModel,
  hasApiKey,
  structuredCall,
} from "@/lib/server/anthropic";
import { extractParsedHtml } from "@/lib/server/extract-html";
import { safeFetch, SafeFetchError, validateUrl } from "@/lib/server/safe-fetch";
import { QUESTION_REGEX, wordCount } from "@/lib/rule-engine/helpers";
import { typesOnPage } from "@/lib/checks/json-ld";
import type { ParsedHtml } from "@/lib/rule-engine/types";
import type {
  CitationForecast,
  CitationSystem,
  CitationSystemForecast,
} from "@/types/citation";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Bump when the prompt or schema changes, so cached forecasts aren't reused. */
const FORECAST_VERSION = "2026-10-31.1";

const SYSTEM =
  "You are an AI-search visibility analyst. You estimate how likely specific AI answer engines are to cite a web page, based on the signals provided.";

const EngineForecastSchema = z.object({
  stars: z.number().int().describe("1 to 5"),
  reasoning: z.string().describe("One short, system-specific reason"),
});

const ForecastSchema = z.object({
  systems: z.object({
    chatgpt: EngineForecastSchema,
    perplexity: EngineForecastSchema,
    copilot: EngineForecastSchema,
    gemini: EngineForecastSchema,
  }),
  topRecommendation: z
    .string()
    .describe("One sentence: the single highest-leverage change to improve citation likelihood"),
});

// Which robots.txt user-agents gate each answer engine. An engine is treated as
// blocked only when *every* bot that feeds it is disallowed at the site root.
const ENGINE_CRAWLERS: Record<CitationSystem, string[]> = {
  chatgpt: ["gptbot", "oai-searchbot", "chatgpt-user"],
  perplexity: ["perplexitybot", "perplexity-user"],
  copilot: ["bingbot", "msnbot"], // Copilot leans on the Bing index
  gemini: ["google-extended", "googlebot"],
};

/**
 * Coarse per-engine crawl access from robots.txt. We only need to know whether an
 * engine's bots are blocked at the root (`Disallow: /`) — a hard cap on citability.
 * Returns `true` (allowed) when not explicitly blocked, which matches how a bot
 * actually behaves.
 */
function parseEngineAccess(robotsBody: string | null): Record<CitationSystem, boolean> {
  const allowed: Record<CitationSystem, boolean> = {
    chatgpt: true,
    perplexity: true,
    copilot: true,
    gemini: true,
  };
  if (!robotsBody) return allowed;

  // Build agent → disallow-paths map.
  const disallowsByAgent = new Map<string, string[]>();
  let currentAgents: string[] = [];
  let inAgentBlock = false;
  for (const rawLine of robotsBody.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (directive === "user-agent") {
      if (!inAgentBlock) currentAgents = [];
      inAgentBlock = true;
      currentAgents.push(value.toLowerCase());
      if (!disallowsByAgent.has(value.toLowerCase())) disallowsByAgent.set(value.toLowerCase(), []);
    } else {
      inAgentBlock = false;
      if (directive === "disallow") {
        for (const a of currentAgents) disallowsByAgent.get(a)?.push(value);
      }
    }
  }

  const blockedAtRoot = (agent: string): boolean => {
    const rules = disallowsByAgent.get(agent) ?? disallowsByAgent.get("*") ?? [];
    return rules.some((d) => d === "/" || d === "*");
  };

  for (const engine of Object.keys(ENGINE_CRAWLERS) as CitationSystem[]) {
    const bots = ENGINE_CRAWLERS[engine];
    // Blocked only when every feeding bot is blocked at root.
    allowed[engine] = !bots.every((b) => blockedAtRoot(b));
  }
  return allowed;
}

function schemaTypes(html: ParsedHtml | null): string[] {
  if (!html) return [];
  return typesOnPage(html.jsonLdScripts);
}

function buildPrompt(args: {
  pageUrl: string;
  page: ParsedHtml;
  homepage: ParsedHtml | null;
  engineAccess: Record<CitationSystem, boolean>;
}): string {
  const { pageUrl, page, homepage, engineAccess } = args;
  const bodyText = page.paragraphs.join("\n\n").slice(0, 2500);
  const totalWords = page.paragraphs.reduce((s, p) => s + wordCount(p), 0);
  const questionH2s = page.headings.filter(
    (h) => h.level === 2 && QUESTION_REGEX.test(h.text.trim()),
  );
  const pageSchemas = schemaTypes(page);
  const siteSchemas = schemaTypes(homepage);
  const freshness = page.articleModifiedTimeMeta ?? page.lastModifiedMeta ?? "unknown";

  const accessLine = (Object.keys(engineAccess) as CitationSystem[])
    .map((e) => `${e}: ${engineAccess[e] ? "allowed" : "BLOCKED in robots.txt"}`)
    .join(", ");

  return `Estimate how likely each AI answer engine is to CITE the page below when answering a relevant user query. Score each engine 1–5 stars (1 = very unlikely, 5 = very likely) and give one short, system-specific reason.

Account for each engine's known behaviour:
- ChatGPT (OpenAI): favours original, substantive, well-structured content; needs GPTBot access.
- Perplexity: favours clear Q&A formatting, direct answers, and citable passages.
- Copilot (Microsoft): leans on the Bing index and benefits from Organization/WebSite schema and entity clarity.
- Gemini (Google): favours Article/FAQ schema, freshness, and content that maps to AI Overviews.

If an engine is BLOCKED in robots.txt, it cannot cite the page at all — cap that engine at 1 star and say so.

PAGE: ${pageUrl}
Title: ${page.title ?? "(none)"}
Meta description: ${page.metaDescription ?? "(none)"}
Word count: ${totalWords}
Question-style H2s: ${questionH2s.length}${questionH2s.length ? ` (e.g. "${questionH2s[0].text.trim().slice(0, 80)}")` : ""}
Page schema types: ${pageSchemas.length ? pageSchemas.join(", ") : "(none)"}
Last modified: ${freshness}
Content excerpt (first 2500 chars):
${bodyText || "(no body text extracted)"}

SITE-LEVEL SIGNALS:
Homepage schema types: ${siteSchemas.length ? siteSchemas.join(", ") : "(none)"}
AI crawler access: ${accessLine}

Finish with the single highest-leverage change to improve citation likelihood, in one sentence.`;
}

function clampStars(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: { pageUrl?: string; siteDomain?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }

  const pageUrl = body.pageUrl;
  if (!pageUrl) {
    return NextResponse.json({ error: "missing_pageUrl" }, { status: 400, headers: CORS_HEADERS });
  }
  try {
    validateUrl(pageUrl);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: "blocked_url", detail }, { status: 400, headers: CORS_HEADERS });
  }

  const fetchHeaders: Record<string, string> = {};
  if (body.token) fetchHeaders["x-prerender-revalidate"] = body.token;

  // Derive the site origin for homepage + robots.txt lookups.
  let origin = "";
  try {
    origin = new URL(body.siteDomain?.startsWith("http") ? body.siteDomain : `https://${body.siteDomain ?? pageUrl}`).origin;
  } catch {
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      origin = "";
    }
  }

  // Fetch the page, the homepage (site-level schema), and robots.txt in parallel.
  const [pageRes, homeRes, robotsRes] = await Promise.allSettled([
    safeFetch(pageUrl, { headers: fetchHeaders, timeoutMs: 10_000 }).then((r) =>
      r.ok ? r.text() : Promise.reject(new Error(`page ${r.status}`)),
    ),
    origin
      ? safeFetch(origin, { headers: fetchHeaders, timeoutMs: 8_000 }).then((r) =>
          r.ok ? r.text() : null,
        )
      : Promise.resolve(null),
    origin
      ? safeFetch(`${origin}/robots.txt`, { timeoutMs: 5_000, maxBytes: 512 * 1024 }).then((r) =>
          r.ok ? r.text() : null,
        )
      : Promise.resolve(null),
  ]);

  if (pageRes.status !== "fulfilled") {
    const reason = pageRes.reason;
    const blocked = reason instanceof SafeFetchError && reason.isBadInput;
    return NextResponse.json(
      { error: blocked ? "blocked_url" : "page_fetch_failed", detail: String(reason) },
      { status: blocked ? 400 : 502, headers: CORS_HEADERS },
    );
  }

  const page = extractParsedHtml(pageRes.value);
  const homepage =
    homeRes.status === "fulfilled" && homeRes.value ? extractParsedHtml(homeRes.value) : null;
  const robotsBody = robotsRes.status === "fulfilled" ? robotsRes.value : null;
  const engineAccess = parseEngineAccess(robotsBody);

  const prompt = buildPrompt({ pageUrl, page, homepage, engineAccess });

  // The prompt carries every input (page content, schemas, robots access), so
  // its hash identifies the forecast.
  const model = getModel();
  const key = await contentKey(["citation-forecast", FORECAST_VERSION, model, prompt]);
  let parsed = aiResultCache.get(key) as z.infer<typeof ForecastSchema> | undefined;
  if (parsed) {
    console.info(`[citation-forecast] server cache hit ${key.slice(0, 8)}`);
  } else {
    try {
      const res = await structuredCall({
        label: "citation-forecast",
        model,
        effort: "low",
        schema: ForecastSchema,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      if (!res.ok) {
        const { status, body: errBody } = failureResponse(res);
        return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
      }
      parsed = res.data;
      aiResultCache.set(key, parsed);
    } catch (err) {
      const { status, body: errBody } = aiErrorResponse(err);
      return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
    }
  }

  const order: CitationSystem[] = ["chatgpt", "perplexity", "copilot", "gemini"];
  const systems: CitationSystemForecast[] = order.map((engine) => {
    const found = parsed.systems[engine];
    // Hard cap: a robots-blocked engine can never cite, regardless of the model.
    const stars = engineAccess[engine] ? clampStars(found.stars) : 1;
    const reasoning =
      found.reasoning.length > 0
        ? found.reasoning
        : engineAccess[engine]
          ? "No system-specific reasoning returned."
          : "Blocked in robots.txt — this engine cannot crawl or cite the page.";
    return { system: engine, stars, reasoning };
  });

  const result: Omit<CitationForecast, "generatedAt"> = {
    pageUrl,
    systems,
    topRecommendation: parsed.topRecommendation,
  };

  return NextResponse.json(result, { headers: CORS_HEADERS });
}
