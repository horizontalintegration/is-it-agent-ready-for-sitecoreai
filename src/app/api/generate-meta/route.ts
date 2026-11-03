import { NextRequest, NextResponse } from "next/server";
import { getBrandVoice } from "@/lib/brand/brand-voice";
import { contentKey } from "@/lib/ai/content-key";
import { aiErrorResponse, aiResultCache, failureResponse, getModel, hasApiKey } from "@/lib/server/anthropic";
import { readPageForQuestions } from "@/lib/server/citation-probe";
import { generateMeta, isMetaField } from "@/lib/server/generate-meta";
import { SafeFetchError } from "@/lib/server/safe-fetch";

/** Bump when the meta prompt changes, so cached bulk results aren't reused. */
const META_CACHE_VERSION = "2026-11-03.1";

export const maxDuration = 60;

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
    /** Dashboard "Generate for all": the published page, read here instead of bodyText. */
    pageUrl?: string;
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
  let pageTitle = (body.pageTitle ?? "").slice(0, 300);
  let bodyText = (body.bodyText ?? "").slice(0, 3000);
  const currentValue = (body.currentValue ?? "").slice(0, 500);

  // The dashboard has no draft: it sends the page URL, and the page is read
  // here (SSRF-safe), the same way the citation probe reads it.
  const fromUrl = Boolean(body.pageUrl && !bodyText);
  if (fromUrl) {
    try {
      const page = await readPageForQuestions(body.pageUrl!);
      pageTitle ||= page.title ?? "";
      bodyText = page.mainText.slice(0, 3000);
    } catch (err) {
      const blocked = err instanceof SafeFetchError;
      return NextResponse.json(
        { error: blocked ? "url_not_allowed" : "page_unreadable", detail: err instanceof Error ? err.message : undefined },
        { status: blocked ? 400 : 502, headers: CORS_HEADERS },
      );
    }
    if (!bodyText) {
      return NextResponse.json({ error: "page_unreadable", detail: "no text on the page" }, { status: 502, headers: CORS_HEADERS });
    }
  }

  const brand = await getBrandVoice();
  console.info(
    `[generate-meta] ${field}: ${bodyText.length} chars of body text${fromUrl ? " (read from the page URL)" : ""}, brand voice: ${brand.source}`,
  );

  // Bulk runs are cached by content, so running "Generate for all" again on
  // unchanged pages costs nothing. The panel's Regenerate always asks again.
  const key = fromUrl ? `meta:${await contentKey([META_CACHE_VERSION, field, getModel(), pageTitle, bodyText, currentValue, brand.source])}` : null;
  const hit = key ? (aiResultCache.get(key) as { value: string; maxChars: number; overLimit: boolean } | undefined) : undefined;
  if (hit) {
    console.info(`[generate-meta] ${field}: cache hit`);
    return NextResponse.json({ field, ...hit, cached: true }, { headers: CORS_HEADERS });
  }

  try {
    const result = await generateMeta({ field, pageTitle, bodyText, currentValue, brand });
    if (result.ok && key) aiResultCache.set(key, { value: result.value, maxChars: result.maxChars, overLimit: result.overLimit });
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
