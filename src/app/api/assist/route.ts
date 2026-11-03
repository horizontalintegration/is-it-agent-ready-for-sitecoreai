import { NextRequest, NextResponse } from "next/server";
import { getBrandVoice } from "@/lib/brand/brand-voice";
import { aiErrorResponse, failureResponse, hasApiKey } from "@/lib/server/anthropic";
import { AssistRequestSchema, runAssist } from "@/lib/server/assist";

// ────────────────────────────────────────────────────────────────────────────
// AI Assist suggestions: alt text, FAQ answers, question headings and a
// summary paragraph (logic in src/lib/server/assist.ts). Suggestions only:
// nothing here writes to Sitecore.
// ────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const maxDuration = 60;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 500, headers: CORS_HEADERS });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }
  const parsed = AssistRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400, headers: CORS_HEADERS });
  }

  const brand = await getBrandVoice();
  console.info(`[assist] ${parsed.data.kind}: ${parsed.data.mainText.length} chars of page text, brand voice: ${brand.source}`);

  try {
    const result = await runAssist(parsed.data, brand);
    if (!result.ok) {
      const { status, body } = failureResponse(result);
      return NextResponse.json(body, { status, headers: CORS_HEADERS });
    }
    return NextResponse.json({ ...result.data, cached: result.cached }, { headers: CORS_HEADERS });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status, headers: CORS_HEADERS });
  }
}
