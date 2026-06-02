import { NextRequest, NextResponse } from "next/server";
import { extractParsedHtml, fetchWithTimeout } from "@/lib/server/extract-html";
import { QUESTION_REGEX, wordCount } from "@/lib/rule-engine/helpers";
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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Which robots.txt user-agents gate each answer engine. An engine is treated as
// blocked only when *every* bot that feeds it is disallowed at the site root.
const ENGINE_CRAWLERS: Record<CitationSystem, string[]> = {
  chatgpt: ["gptbot", "oai-searchbot", "chatgpt-user"],
  perplexity: ["perplexitybot", "perplexity-user"],
  copilot: ["bingbot", "msnbot"], // Copilot leans on the Bing index
  gemini: ["google-extended", "googlebot"],
};

function stripJsonFences(s: string): string {
  return s.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callAnthropic(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system:
      "You are an AI-search visibility analyst. You estimate how likely specific AI answer engines are to cite a web page, based on the signals provided. Respond ONLY with valid JSON — no markdown, no explanation, no code fences.",
    messages: [{ role: "user", content: prompt }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`anthropic ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as AnthropicMessageResponse;
    return stripJsonFences(data.content?.find((c) => c.type === "text")?.text ?? "");
  } finally {
    clearTimeout(timer);
  }
}

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
  return Array.from(new Set(html.jsonLdBlocks.map((b) => b.type).filter(Boolean)));
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

Respond with exactly this JSON shape:
{
  "systems": [
    { "system": "chatgpt", "stars": 3, "reasoning": "..." },
    { "system": "perplexity", "stars": 3, "reasoning": "..." },
    { "system": "copilot", "stars": 3, "reasoning": "..." },
    { "system": "gemini", "stars": 3, "reasoning": "..." }
  ],
  "topRecommendation": "one sentence, the single highest-leverage change to improve citation likelihood"
}`;
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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
    fetchWithTimeout(pageUrl, { headers: fetchHeaders, timeoutMs: 10_000 }).then((r) =>
      r.ok ? r.text() : Promise.reject(new Error(`page ${r.status}`)),
    ),
    origin
      ? fetchWithTimeout(origin, { headers: fetchHeaders, timeoutMs: 8_000 }).then((r) =>
          r.ok ? r.text() : null,
        )
      : Promise.resolve(null),
    origin
      ? fetchWithTimeout(`${origin}/robots.txt`, { timeoutMs: 5_000 }).then((r) =>
          r.ok ? r.text() : null,
        )
      : Promise.resolve(null),
  ]);

  if (pageRes.status !== "fulfilled") {
    return NextResponse.json(
      { error: "page_fetch_failed", detail: pageRes.status === "rejected" ? String(pageRes.reason) : "" },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const page = extractParsedHtml(pageRes.value);
  const homepage =
    homeRes.status === "fulfilled" && homeRes.value ? extractParsedHtml(homeRes.value) : null;
  const robotsBody = robotsRes.status === "fulfilled" ? robotsRes.value : null;
  const engineAccess = parseEngineAccess(robotsBody);

  const prompt = buildPrompt({ pageUrl, page, homepage, engineAccess });

  let raw: string;
  try {
    raw = await callAnthropic(apiKey, prompt, 600);
  } catch (err) {
    return NextResponse.json(
      { error: "ai_failed", detail: err instanceof Error ? err.message : "unknown_error" },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  let parsed: { systems?: Array<{ system?: string; stars?: unknown; reasoning?: unknown }>; topRecommendation?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "parse_error" }, { status: 502, headers: CORS_HEADERS });
  }

  const order: CitationSystem[] = ["chatgpt", "perplexity", "copilot", "gemini"];
  const byKey = new Map<string, { system?: string; stars?: unknown; reasoning?: unknown }>();
  for (const s of parsed.systems ?? []) {
    if (typeof s.system === "string") byKey.set(s.system.toLowerCase(), s);
  }

  const systems: CitationSystemForecast[] = order.map((key) => {
    const found = byKey.get(key);
    // Hard cap: a robots-blocked engine can never cite, regardless of the model.
    const stars = engineAccess[key] ? clampStars(found?.stars) : 1;
    const reasoning =
      typeof found?.reasoning === "string" && found.reasoning.length > 0
        ? found.reasoning
        : engineAccess[key]
          ? "No system-specific reasoning returned."
          : "Blocked in robots.txt — this engine cannot crawl or cite the page.";
    return { system: key, stars, reasoning };
  });

  const result: Omit<CitationForecast, "generatedAt"> = {
    pageUrl,
    systems,
    topRecommendation:
      typeof parsed.topRecommendation === "string" ? parsed.topRecommendation : "",
  };

  return NextResponse.json(result, { headers: CORS_HEADERS });
}
