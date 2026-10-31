import { NextRequest, NextResponse } from "next/server";
import { getBrandVoice } from "@/lib/brand/brand-voice";

// ────────────────────────────────────────────────────────────────────────────
// Generate a single meta / social field, grounded in the page content and the
// configured brand voice (src/lib/brand/brand-voice.ts).
//
// Calls the Anthropic Messages API directly (same pattern as /api/ai-check).
// The request shape ({ field, pageTitle, bodyText, currentValue }) and the
// { value } response are what the UI and field write-back depend on.
// ────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

type MetaField = "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription";

interface FieldSpec {
  label: string;
  /** Soft character target communicated to the model and shown in the UI. */
  maxChars: number;
  instruction: string;
}

const FIELD_SPECS: Record<MetaField, FieldSpec> = {
  metaTitle: {
    label: "meta title",
    maxChars: 60,
    instruction:
      "Write an SEO meta title (the browser/SERP title). Lead with the page's primary topic and be specific. No quotation marks, no trailing punctuation.",
  },
  metaDescription: {
    label: "meta description",
    maxChars: 155,
    instruction:
      "Write an SEO meta description that summarizes the page and invites the click. Lead with the value to the reader. One or two sentences.",
  },
  ogTitle: {
    label: "Open Graph title",
    maxChars: 70,
    instruction:
      "Write an Open Graph title for social sharing. It can be slightly warmer/more engaging than the meta title while staying accurate and on-brand. No quotation marks.",
  },
  ogDescription: {
    label: "Open Graph description",
    maxChars: 200,
    instruction:
      "Write an Open Graph description for social sharing that makes people want to read the page. One or two sentences.",
  },
};

function isMetaField(v: unknown): v is MetaField {
  return v === "metaTitle" || v === "metaDescription" || v === "ogTitle" || v === "ogDescription";
}

function stripJsonFences(s: string): string {
  return s.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callAnthropic(
  apiKey: string,
  system: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
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

  let body: {
    field?: string;
    pageTitle?: string;
    bodyText?: string;
    currentValue?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!isMetaField(body.field)) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400, headers: CORS_HEADERS });
  }

  const spec = FIELD_SPECS[body.field];
  const pageTitle = (body.pageTitle ?? "").slice(0, 300);
  const bodyText = (body.bodyText ?? "").slice(0, 3000);
  const currentValue = (body.currentValue ?? "").slice(0, 500);

  const brand = await getBrandVoice();
  const brandRef = brand.name ?? "the brand";
  console.info(
    `[generate-meta] ${body.field}: ${bodyText.length} chars of body text, brand voice: ${brand.source}`,
  );

  const system = `You are ${brand.name ? `${brand.name}'s` : "the site's"} content strategist. You write metadata and social copy that strictly follows the brand voice and compliance guardrails below. Respond ONLY with valid JSON, no markdown, no explanation, no code fences.

BRAND KNOWLEDGE:
${brand.document}`;

  const brandNameLine =
    body.field === "metaTitle" && brand.name
      ? `\nInclude the brand name "${brand.name}" only if it fits naturally.`
      : "";

  const prompt = `Generate the ${spec.label} for the following web page.

${spec.instruction}${brandNameLine}
Keep it at or under ${spec.maxChars} characters. Match ${brandRef}'s tone of voice. Do not invent statistics, proof points, or guarantees that are not supported by the page content.
Write it from the page content below. The current ${spec.label} is for reference only: don't copy it.

Page title: ${pageTitle || "(none)"}
Current ${spec.label}: ${currentValue || "(empty)"}
Page content (first 3000 chars): ${bodyText || "(none)"}

Respond with exactly:
{
  "value": "the generated ${spec.label}, no surrounding quotes"
}`;

  try {
    const raw = await callAnthropic(apiKey, system, prompt, 400);

    let parsed: { value?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "parse_error" }, { status: 500, headers: CORS_HEADERS });
    }

    const value = typeof parsed.value === "string" ? parsed.value.trim() : "";
    if (!value) {
      return NextResponse.json({ error: "empty_value" }, { status: 502, headers: CORS_HEADERS });
    }

    return NextResponse.json(
      { field: body.field, value, maxChars: spec.maxChars },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: "ai_failed", detail: message }, { status: 502, headers: CORS_HEADERS });
  }
}
