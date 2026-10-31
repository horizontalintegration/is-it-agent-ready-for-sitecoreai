import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AiResults } from "@/lib/rule-engine/types";
import { AI_CHECK_VERSION, contentKey } from "@/lib/ai/content-key";
import {
  aiErrorResponse,
  aiResultCache,
  type Effort,
  failureResponse,
  getModel,
  hasApiKey,
  structuredCall,
  type StructuredResult,
} from "@/lib/server/anthropic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SYSTEM = "You are a content analyst. You assess web pages for how useful they are to readers and AI answer engines.";

const UniquenessSchema = z.object({
  rating: z.enum(["unique", "borderline", "commodity"]),
  explanation: z.string().describe("One sentence, max 120 characters"),
});

const GapsSchema = z.object({
  gaps: z
    .array(
      z.object({
        question: z.string(),
        covered: z.boolean().describe("Whether the page already answers this question"),
      }),
    )
    .describe("Exactly 5 follow-up questions"),
});

function pageBlock(pageTitle: string, bodyText: string): string {
  return `Page title: ${pageTitle}\nContent (first 3000 chars): ${bodyText}`;
}

/**
 * Runs one check, or returns its cached result. The key covers the check ID,
 * prompt version, model and the content the model sees.
 */
async function cachedCheck<S extends z.ZodType>(args: {
  checkId: string;
  effort: Effort;
  schema: S;
  prompt: string;
  pageTitle: string;
  bodyText: string;
  force: boolean;
}): Promise<StructuredResult<z.infer<S>> | { ok: true; data: z.infer<S>; cached: true }> {
  const model = getModel("bulk");
  const key = await contentKey([args.checkId, AI_CHECK_VERSION, model, args.pageTitle, args.bodyText]);
  const hit = args.force ? undefined : aiResultCache.get(key);
  if (hit !== undefined) {
    console.info(`[ai-check] ${args.checkId}: server cache hit ${key.slice(0, 8)}`);
    return { ok: true, data: hit as z.infer<S>, cached: true };
  }

  const result = await structuredCall({
    label: `ai-check:${args.checkId}`,
    model,
    effort: args.effort,
    schema: args.schema,
    system: SYSTEM,
    messages: [{ role: "user", content: `${args.prompt}\n\n${pageBlock(args.pageTitle, args.bodyText)}` }],
  });
  if (result.ok) aiResultCache.set(key, result.data);
  return result;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: { pageTitle?: string; bodyText?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }

  const pageTitle = body.pageTitle ?? "";
  const bodyText = (body.bodyText ?? "").slice(0, 3000);
  const force = body.force === true;
  console.info(
    `[ai-check] "${pageTitle.slice(0, 80)}": received ${body.bodyText?.length ?? 0} chars of body text, sending ${bodyText.length}`,
  );

  try {
    // Classification at low effort, question generation at medium (plan section 9)
    const [uniqueness, gaps] = await Promise.all([
      cachedCheck({
        checkId: "uniqueness",
        effort: "low",
        schema: UniquenessSchema,
        prompt:
          "Does this web page provide unique value — first-hand experience, original research, or expert insight beyond common knowledge? Or does it primarily restate widely available information? Rate it and explain in one sentence of at most 120 characters.",
        pageTitle,
        bodyText,
        force,
      }),
      cachedCheck({
        checkId: "follow-up-gaps",
        effort: "medium",
        schema: GapsSchema,
        prompt:
          "List the 5 most likely follow-up questions a reader would have after reading this page. For each, say whether the page already addresses it.",
        pageTitle,
        bodyText,
        force,
      }),
    ]);

    if (!uniqueness.ok) {
      const { status, body: errBody } = failureResponse(uniqueness);
      return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
    }
    if (!gaps.ok) {
      const { status, body: errBody } = failureResponse(gaps);
      return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
    }

    const result: AiResults = {
      uniquenessRating: uniqueness.data.rating,
      uniquenessExplanation: uniqueness.data.explanation,
      followUpGaps: gaps.data.gaps.slice(0, 5),
    };

    return NextResponse.json(result, { headers: CORS_HEADERS });
  } catch (err) {
    const { status, body: errBody } = aiErrorResponse(err);
    return NextResponse.json(errBody, { status, headers: CORS_HEADERS });
  }
}
