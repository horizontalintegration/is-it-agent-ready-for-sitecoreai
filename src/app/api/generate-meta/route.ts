import { NextRequest, NextResponse } from "next/server";
import { getBrandVoice } from "@/lib/brand/brand-voice";
import { aiErrorResponse, failureResponse, hasApiKey } from "@/lib/server/anthropic";
import { generateMeta, isMetaField } from "@/lib/server/generate-meta";

// ────────────────────────────────────────────────────────────────────────────
// Generate a single meta / social field (logic in src/lib/server/generate-meta.ts).
// The request shape ({ field, pageTitle, bodyText, currentValue }) and the
// { value } response are what the UI and field write-back depend on.
// ────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  if (!hasApiKey()) {
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

  const field = body.field;
  const pageTitle = (body.pageTitle ?? "").slice(0, 300);
  const bodyText = (body.bodyText ?? "").slice(0, 3000);
  const currentValue = (body.currentValue ?? "").slice(0, 500);

  const brand = await getBrandVoice();
  console.info(
    `[generate-meta] ${field}: ${bodyText.length} chars of body text, brand voice: ${brand.source}`,
  );

  try {
    const result = await generateMeta({ field, pageTitle, bodyText, currentValue, brand });
    if (!result.ok) {
      if (result.error === "empty_value") {
        return NextResponse.json({ error: "empty_value" }, { status: 502, headers: CORS_HEADERS });
      }
      const { status, body: errBody } = failureResponse(result);
      return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
    }

    return NextResponse.json(
      { field, value: result.value, maxChars: result.maxChars, overLimit: result.overLimit },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const { status, body: errBody } = aiErrorResponse(err);
    return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
  }
}
