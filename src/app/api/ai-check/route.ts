import { NextRequest, NextResponse } from "next/server";
import type { AiResults, UniquenessRating } from "@/lib/rule-engine/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

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
    system: "You are a content analyst. Respond ONLY with valid JSON, no markdown, no explanation, no code fences.",
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
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return stripJsonFences(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: { pageTitle?: string; bodyText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }

  const pageTitle = body.pageTitle ?? "";
  const bodyText = (body.bodyText ?? "").slice(0, 3000);
  console.info(
    `[ai-check] "${pageTitle.slice(0, 80)}": received ${body.bodyText?.length ?? 0} chars of body text, sending ${bodyText.length}`,
  );

  const uniquenessPrompt = `Does this web page provide unique value — first-hand experience, original research, or expert insight beyond common knowledge? Or does it primarily restate widely available information?

Page title: ${pageTitle}
Content (first 3000 chars): ${bodyText}

Respond with exactly:
{
  "rating": "unique" | "borderline" | "commodity",
  "explanation": "one sentence, max 120 characters"
}`;

  const gapsPrompt = `List the 5 most likely follow-up questions a reader would have after reading this page. For each, does the page already address it?

Page title: ${pageTitle}
Content (first 3000 chars): ${bodyText}

Respond with exactly:
{
  "gaps": [
    { "question": "...", "covered": true },
    { "question": "...", "covered": true },
    { "question": "...", "covered": true },
    { "question": "...", "covered": true },
    { "question": "...", "covered": true }
  ]
}`;

  try {
    // Run sequentially to avoid rate limits
    const uniquenessRaw = await callAnthropic(apiKey, uniquenessPrompt, 300);
    const gapsRaw = await callAnthropic(apiKey, gapsPrompt, 400);

    let uniqueness: { rating?: string; explanation?: string };
    let gaps: { gaps?: Array<{ question?: string; covered?: boolean }> };
    try {
      uniqueness = JSON.parse(uniquenessRaw);
      gaps = JSON.parse(gapsRaw);
    } catch {
      return NextResponse.json({ error: "parse_error" }, { status: 500, headers: CORS_HEADERS });
    }

    const rating: UniquenessRating =
      uniqueness.rating === "unique" || uniqueness.rating === "borderline" || uniqueness.rating === "commodity"
        ? uniqueness.rating
        : "borderline";

    const result: AiResults = {
      uniquenessRating: rating,
      uniquenessExplanation: typeof uniqueness.explanation === "string" ? uniqueness.explanation : "",
      followUpGaps: (gaps.gaps ?? []).slice(0, 5).map((g) => ({
        question: typeof g.question === "string" ? g.question : "",
        covered: Boolean(g.covered),
      })),
    };

    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: "ai_failed", detail: message }, { status: 502, headers: CORS_HEADERS });
  }
}
