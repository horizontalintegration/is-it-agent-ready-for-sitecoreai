import { NextRequest, NextResponse } from "next/server";
import { getBrandVoice } from "@/lib/brand/brand-voice";
import { aiErrorResponse, failureResponse, hasApiKey } from "@/lib/server/anthropic";
import { AssistRequestSchema, isAssistCached, runAssist } from "@/lib/server/assist";
import { limitCall } from "@/lib/server/rate-limit";
import { refuseCrossOrigin } from "@/lib/server/same-origin";

// ────────────────────────────────────────────────────────────────────────────
// AI Assist suggestions: alt text, FAQ answers, question headings and a
// summary paragraph (logic in src/lib/server/assist.ts). Suggestions only:
// nothing here writes to Sitecore.
// ────────────────────────────────────────────────────────────────────────────

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const refused = refuseCrossOrigin(req, { requireOrigin: true });
  if (refused) return refused;
  if (!hasApiKey()) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = AssistRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });
  }
  if (!(await isAssistCached(parsed.data))) {
    const limited = await limitCall("assist", req);
    if (limited) return limited;
  }

  const brand = await getBrandVoice();
  console.info(`[assist] ${parsed.data.kind}: ${parsed.data.mainText.length} chars of page text, brand voice: ${brand.source}`);

  try {
    const result = await runAssist(parsed.data, brand);
    if (!result.ok) {
      const { status, body } = failureResponse(result);
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ ...result.data, cached: result.cached });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
