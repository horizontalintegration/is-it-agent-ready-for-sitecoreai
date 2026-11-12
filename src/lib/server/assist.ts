import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { contentKey } from "@/lib/ai/content-key";
import type { BrandVoice } from "@/lib/brand/brand-voice";
import { aiResultCache, getModel, structuredCall, type StructuredResult } from "./anthropic";

// ────────────────────────────────────────────────────────────────────────────
// AI Assist suggestions besides meta and social copy (that stays in
// generate-meta.ts): image alt text, quotable FAQ answers, question headings
// and a summary paragraph (plan section 6.3, Phase 9). Used by /api/assist.
//
// - The brand voice (system) and the page text (first user block) are cache
//   breakpoints; the task comes after them, so every kind on the same page
//   reuses the cached prefix.
// - Structured outputs for every answer; effort low, medium for question
//   headings (plan section 9).
// - Results are cached by a hash of the inputs, so asking again for an
//   unchanged page costs nothing.
// - Alt text looks at the image (by URL). If Claude can't fetch it, it falls
//   back to the file name and the page text, and says so.
// ────────────────────────────────────────────────────────────────────────────

/** Bump when a prompt or a response shape changes. */
export const ASSIST_VERSION = "2026-11-03.1";

export const ALT_MAX = 125;
export const FAQ_MIN = 40;
export const FAQ_MAX = 300;
const PAGE_TEXT_MAX = 6000;

export const AssistRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("alt"),
    pageTitle: z.string().max(300),
    mainText: z.string(),
    image: z.object({ src: z.string().url().max(2000), currentAlt: z.string().max(500).nullable() }),
  }),
  z.object({
    kind: z.literal("faq-answers"),
    pageTitle: z.string().max(300),
    mainText: z.string(),
    pairs: z.array(z.object({ id: z.string().max(100), question: z.string().max(500), answer: z.string().max(3000) })).min(1).max(15),
  }),
  z.object({
    kind: z.literal("question-headings"),
    pageTitle: z.string().max(300),
    mainText: z.string(),
    headings: z.array(z.string().max(300)).min(1).max(15),
  }),
  z.object({
    kind: z.literal("summary"),
    pageTitle: z.string().max(300),
    mainText: z.string(),
  }),
]);

export type AssistRequest = z.infer<typeof AssistRequestSchema>;
export type AssistKind = AssistRequest["kind"];

const AltSchema = z.object({ alt: z.string().describe("The alt text only") });
const FaqSchema = z.object({
  answers: z.array(z.object({ id: z.string(), answer: z.string().describe("The rewritten answer, plain text") })),
});
const HeadingsSchema = z.object({
  headings: z.array(
    z.object({
      before: z.string().describe("The heading as it is now, copied exactly"),
      after: z.string().describe("The heading phrased as the question the section answers"),
    }),
  ),
});
const SummarySchema = z.object({ summary: z.string().describe("The summary paragraph, plain text") });

export type AssistData =
  | { kind: "alt"; alt: string; sawImage: boolean; overLimit: boolean }
  | { kind: "faq-answers"; answers: Array<{ id: string; answer: string; inRange: boolean }> }
  | { kind: "question-headings"; headings: Array<{ before: string; after: string }> }
  | { kind: "summary"; summary: string };

export type AssistResult = { ok: true; data: AssistData; cached: boolean } | Exclude<StructuredResult<unknown>, { ok: true }>;

function systemPrompt(brand: BrandVoice): string {
  return `You are ${brand.name ? `${brand.name}'s` : "the site's"} content editor. You improve web pages so AI assistants and search engines can understand, quote and cite them, while keeping strictly to the brand voice and guardrails below. Write in plain language. Never invent facts, figures, people or claims that the page doesn't support.

BRAND KNOWLEDGE:
${brand.document}`;
}

function pageBlock(req: AssistRequest): BetaTextBlockParam {
  return {
    type: "text",
    text: `Page title: ${req.pageTitle || "(none)"}\nPage text (first ${PAGE_TEXT_MAX} characters):\n${req.mainText.slice(0, PAGE_TEXT_MAX) || "(none)"}`,
    cache_control: { type: "ephemeral" },
  };
}

/** Sitecore media URLs are resized on request, so the model gets a smaller image. */
export function imageUrlForModel(src: string): string {
  try {
    const url = new URL(src);
    if (/\/-\/media\/|\/media\//i.test(url.pathname) && !url.searchParams.has("mw")) url.searchParams.set("mw", "1024");
    return url.toString();
  } catch {
    return src;
  }
}

function fileName(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "");
  } catch {
    return src.split("/").pop() ?? "";
  }
}

const ALT_TASK = (currentAlt: string | null, src: string, sawImage: boolean) =>
  `Write alt text for ${sawImage ? "the image above" : `the image "${fileName(src)}" (you can't see it: describe it from the file name and the page text, and keep it general)`}, as it appears on this page.
Describe what the image shows and why it's on this page, in at most ${ALT_MAX} characters. Don't start with "Image of" or "Picture of". Don't repeat the page title word for word.
Current alt text: ${currentAlt || "(none)"}`;

const FAQ_TASK = (pairs: Array<{ id: string; question: string; answer: string }>) =>
  `Rewrite each FAQ answer below so an AI assistant can quote it on its own: answer the question directly in the first sentence, keep it self-contained (don't rely on the question or other answers), and keep it between ${FAQ_MIN} and ${FAQ_MAX} characters. Keep every fact from the original answer and add none. Return one answer per id.

${pairs.map((p) => `id: ${p.id}\nQuestion: ${p.question}\nAnswer: ${p.answer}`).join("\n\n")}`;

const HEADINGS_TASK = (headings: string[]) =>
  `People ask AI assistants questions. Rephrase the section headings below as the question each section answers, where that reads naturally. Keep them short. Leave out headings that are already questions or where a question would sound forced.

Headings:
${headings.map((h) => `- ${h}`).join("\n")}`;

const SUMMARY_TASK = `Write a summary paragraph to place at the top of the page: 40 to 70 words that answer the page's main question directly, so an AI assistant could quote it as the answer. Use only what the page says.`;

async function cacheKey(req: AssistRequest, model: string): Promise<string> {
  const { kind, pageTitle, mainText, ...rest } = req;
  return contentKey([ASSIST_VERSION, kind, model, pageTitle, mainText.slice(0, PAGE_TEXT_MAX), JSON.stringify(rest)]);
}

/** Whether runAssist would answer from the cache, with no Claude call (the route's rate limit skips those). */
export async function isAssistCached(req: AssistRequest): Promise<boolean> {
  return aiResultCache.get(`assist:${await cacheKey(req, getModel())}`) !== undefined;
}

export async function runAssist(req: AssistRequest, brand: BrandVoice, client?: Anthropic): Promise<AssistResult> {
  const model = getModel();
  const key = await cacheKey(req, model);
  const hit = aiResultCache.get(`assist:${key}`) as AssistData | undefined;
  if (hit) {
    console.info(`[assist] ${req.kind}: cache hit`);
    return { ok: true, data: hit, cached: true };
  }

  const system: BetaTextBlockParam[] = [{ type: "text", text: systemPrompt(brand), cache_control: { type: "ephemeral" } }];
  const page = pageBlock(req);
  const call = <S extends z.ZodType>(label: string, schema: S, content: BetaContentBlockParam[], effort: "low" | "medium" = "low") =>
    structuredCall({ label: `assist:${label}`, model, effort, schema, system, messages: [{ role: "user", content: [page, ...content] }], client });

  let data: AssistData;
  switch (req.kind) {
    case "alt": {
      const imageBlock: BetaContentBlockParam = { type: "image", source: { type: "url", url: imageUrlForModel(req.image.src) } };
      let sawImage = true;
      let res: StructuredResult<z.infer<typeof AltSchema>>;
      try {
        res = await call("alt", AltSchema, [imageBlock, { type: "text", text: ALT_TASK(req.image.currentAlt, req.image.src, true) }]);
      } catch (err) {
        // The image URL couldn't be fetched (e.g. a CM media URL that needs a login): describe it from the file name.
        if (!(err instanceof Anthropic.BadRequestError)) throw err;
        console.info(`[assist] alt: image not readable (${err.message}); using the file name`);
        sawImage = false;
        res = await call("alt:no-image", AltSchema, [{ type: "text", text: ALT_TASK(req.image.currentAlt, req.image.src, false) }]);
      }
      if (!res.ok) return res;
      const alt = res.data.alt.trim();
      data = { kind: "alt", alt, sawImage, overLimit: alt.length > ALT_MAX };
      break;
    }
    case "faq-answers": {
      const res = await call("faq-answers", FaqSchema, [{ type: "text", text: FAQ_TASK(req.pairs) }]);
      if (!res.ok) return res;
      const ids = new Set(req.pairs.map((p) => p.id));
      data = {
        kind: "faq-answers",
        answers: res.data.answers
          .filter((a) => ids.has(a.id))
          .map((a) => {
            const answer = a.answer.trim();
            return { id: a.id, answer, inRange: answer.length >= FAQ_MIN && answer.length <= FAQ_MAX };
          }),
      };
      break;
    }
    case "question-headings": {
      const res = await call("question-headings", HeadingsSchema, [{ type: "text", text: HEADINGS_TASK(req.headings) }], "medium");
      if (!res.ok) return res;
      const asked = new Set(req.headings);
      data = { kind: "question-headings", headings: res.data.headings.filter((h) => asked.has(h.before) && h.after.trim() && h.after !== h.before) };
      break;
    }
    case "summary": {
      const res = await call("summary", SummarySchema, [{ type: "text", text: SUMMARY_TASK }]);
      if (!res.ok) return res;
      data = { kind: "summary", summary: res.data.summary.trim() };
      break;
    }
  }

  aiResultCache.set(`assist:${key}`, data);
  return { ok: true, data, cached: false };
}
