import type Anthropic from "@anthropic-ai/sdk";
import type { BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { BrandVoice } from "@/lib/brand/brand-voice";
import { getModel, structuredCall, type StructuredResult } from "@/lib/server/anthropic";

// ────────────────────────────────────────────────────────────────────────────
// Generate a single meta / social field, grounded in the page content and the
// configured brand voice (src/lib/brand/brand-voice.ts). Used by
// /api/generate-meta.
//
// Prompt caching: the brand voice (system) and the page content (first user
// block) are cache breakpoints, and the field instruction comes after them, so
// generating all four fields, or regenerating one, reuses the cached prefix.
// All fields share one output schema for the same reason: a different format
// per field could invalidate the cache.
//
// Length: structured outputs can't enforce maxLength, so the limit is checked
// here. An overrun gets one retry with the count fed back; if the retry is
// still over, the value is returned with overLimit: true (never truncated).
// ────────────────────────────────────────────────────────────────────────────

export type MetaField = "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription";

interface FieldSpec {
  label: string;
  /** Character limit, enforced here and shown in the UI. */
  maxChars: number;
  instruction: string;
}

export const FIELD_SPECS: Record<MetaField, FieldSpec> = {
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

export function isMetaField(v: unknown): v is MetaField {
  return v === "metaTitle" || v === "metaDescription" || v === "ogTitle" || v === "ogDescription";
}

const MetaSchema = z.object({
  value: z.string().describe("The generated text only, without surrounding quotes"),
});

export interface GenerateMetaInput {
  field: MetaField;
  pageTitle: string;
  bodyText: string;
  currentValue: string;
  brand: BrandVoice;
  client?: Anthropic;
}

export type GenerateMetaResult =
  | { ok: true; value: string; maxChars: number; overLimit: boolean; attempts: number }
  | Exclude<StructuredResult<unknown>, { ok: true }>
  | { ok: false; error: "empty_value" };

function systemPrompt(brand: BrandVoice): string {
  return `You are ${brand.name ? `${brand.name}'s` : "the site's"} content strategist. You write metadata and social copy that strictly follows the brand voice and compliance guardrails below.

BRAND KNOWLEDGE:
${brand.document}`;
}

function fieldTask(input: GenerateMetaInput, spec: FieldSpec): string {
  const brandRef = input.brand.name ?? "the brand";
  const brandNameLine =
    input.field === "metaTitle" && input.brand.name
      ? `\nInclude the brand name "${input.brand.name}" only if it fits naturally.`
      : "";
  return `Generate the ${spec.label} for the web page above.

${spec.instruction}${brandNameLine}
It must be at most ${spec.maxChars} characters, including spaces. Match ${brandRef}'s tone of voice. Do not invent statistics, proof points, or guarantees that are not supported by the page content.
Write it from the page content. The current ${spec.label} is for reference only: don't copy it.

Current ${spec.label}: ${input.currentValue || "(empty)"}`;
}

export async function generateMeta(input: GenerateMetaInput): Promise<GenerateMetaResult> {
  const spec = FIELD_SPECS[input.field];
  const system: BetaTextBlockParam[] = [
    { type: "text", text: systemPrompt(input.brand), cache_control: { type: "ephemeral" } },
  ];
  const content: BetaTextBlockParam[] = [
    {
      type: "text",
      text: `Page title: ${input.pageTitle || "(none)"}\nPage content (first 3000 chars): ${input.bodyText || "(none)"}`,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: fieldTask(input, spec) },
  ];

  let last: { value: string; attempts: number } | null = null;
  let retryNote: BetaTextBlockParam | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result: StructuredResult<z.infer<typeof MetaSchema>> = await structuredCall({
      label: `generate-meta:${input.field}${attempt > 1 ? ":retry" : ""}`,
      model: getModel(),
      effort: "low",
      schema: MetaSchema,
      system,
      messages: [{ role: "user", content: retryNote ? [...content, retryNote] : content }],
      client: input.client,
    });
    if (!result.ok) return result;

    const value = result.data.value.trim();
    if (!value) return { ok: false, error: "empty_value" };
    last = { value, attempts: attempt };
    if (value.length <= spec.maxChars) {
      return { ok: true, value, maxChars: spec.maxChars, overLimit: false, attempts: attempt };
    }

    console.info(
      `[generate-meta] ${input.field}: ${value.length} chars, over the ${spec.maxChars}-char limit${attempt === 1 ? "; retrying" : ""}`,
    );
    retryNote = {
      type: "text",
      text: `Your draft "${value}" is ${value.length} characters, over the ${spec.maxChars}-character limit. Write a shorter version of at most ${spec.maxChars} characters that keeps the meaning.`,
    };
  }

  return { ok: true, value: last!.value, maxChars: spec.maxChars, overLimit: true, attempts: last!.attempts };
}
