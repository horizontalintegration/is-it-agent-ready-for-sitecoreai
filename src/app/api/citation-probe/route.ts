import { NextRequest, NextResponse } from "next/server";
import { aiErrorResponse, failureResponse, getModel, hasApiKey } from "@/lib/server/anthropic";
import {
  generateQuestions,
  probeKey,
  probeQuestion,
  readPageForQuestions,
  readProbeCache,
  siteOf,
  writeProbeCache,
} from "@/lib/server/citation-probe";
import { limitCall, limitResponse, rateLimiter } from "@/lib/server/rate-limit";
import { SafeFetchError, validateUrl } from "@/lib/server/safe-fetch";
import { refuseCrossOrigin } from "@/lib/server/same-origin";
import { normaliseText } from "@/lib/ai/content-key";
import { PROBE_COUNTRIES, QUESTION_MAX_CHARS } from "@/lib/citations/types";

// One probe: up to 80 s of Claude and web search (a retry included), then the answer.
export const maxDuration = 90;

const COUNTRY_CODES = new Set(PROBE_COUNTRIES.map((c) => c.code));

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Citation probes (plan section 8, Layer 2). POST JSON:
 * - `{ action: "questions", pageUrl }` → `{ questions, model }`
 * - `{ action: "run", pageUrl, question, country? }` → `{ evidence, cached }`
 *
 * One question per request, so the browser shows each row as it finishes and
 * a long run can't hit the function's time limit.
 */
export async function POST(req: NextRequest) {
  const refused = refuseCrossOrigin(req, { requireOrigin: true });
  if (refused) return refused;
  if (!hasApiKey()) return json({ error: "api_key_missing" }, 500);

  let body: { action?: unknown; pageUrl?: unknown; question?: unknown; country?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl : "";
  if (!pageUrl) return json({ error: "missing_pageUrl" }, 400);
  try {
    validateUrl(pageUrl);
  } catch (err) {
    return json({ error: "blocked_url", detail: err instanceof Error ? err.message : "" }, 400);
  }
  const model = getModel();

  if (body.action === "questions") {
    const limited = await limitCall("citation-probe", req);
    if (limited) return limited;
    try {
      const page = await readPageForQuestions(pageUrl);
      const res = await generateQuestions(page, model);
      if (!res.ok) {
        const { status, body: errBody } = failureResponse(res);
        return json(errBody, status);
      }
      return json({ questions: res.data.questions, model });
    } catch (err) {
      if (err instanceof SafeFetchError) {
        return json({ error: err.isBadInput ? "blocked_url" : "page_fetch_failed", detail: err.message }, err.isBadInput ? 400 : 502);
      }
      if (err instanceof Error && err.message.startsWith("page ")) {
        return json({ error: "page_fetch_failed", detail: err.message }, 502);
      }
      const { status, body: errBody } = aiErrorResponse(err);
      return json(errBody, status);
    }
  }

  if (body.action === "run") {
    const question = typeof body.question === "string" ? normaliseText(body.question) : "";
    if (!question || question.length > QUESTION_MAX_CHARS) return json({ error: "invalid_question" }, 400);
    const country = typeof body.country === "string" && COUNTRY_CODES.has(body.country) ? body.country : null;

    const key = await probeKey({ model, pageUrl, question, country });
    const cached = readProbeCache(key);
    if (cached) {
      console.info(`[citation-probe] server cache hit ${key.slice(0, 8)}`);
      return json({ evidence: cached, cached: true });
    }
    const limited = await limitCall("citation-probe", req);
    if (limited) return limited;
    const perSite = await rateLimiter.takeSite(siteOf(pageUrl));
    if (!perSite.ok) return limitResponse(perSite);

    try {
      const evidence = await probeQuestion({ question, model, country });
      // Only searched results are cached: a refusal or an answer from memory says
      // nothing about the site, and asking again may search.
      if (evidence.searched) writeProbeCache(key, evidence);
      return json({ evidence, cached: false });
    } catch (err) {
      const { status, body: errBody } = aiErrorResponse(err);
      return json(errBody, status);
    }
  }

  return json({ error: "invalid_action" }, 400);
}
