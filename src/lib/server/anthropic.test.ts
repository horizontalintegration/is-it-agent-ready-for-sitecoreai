import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  aiErrorResponse,
  DEFAULT_MODEL,
  failureResponse,
  getModel,
  LruCache,
  structuredCall,
} from "./anthropic";
import { fakeClient, fakeMessage, textMessage } from "./anthropic-test-utils";

const Schema = z.object({ rating: z.enum(["good", "bad"]) });

function call(client: Anthropic, model = "claude-opus-5-5") {
  return structuredCall({
    label: "test",
    model,
    effort: "low",
    schema: Schema,
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    client,
  });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("getModel", () => {
  it("defaults to Opus 5.5", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    vi.stubEnv("ANTHROPIC_MODEL_BULK", "");
    expect(getModel()).toBe(DEFAULT_MODEL);
    expect(getModel("bulk")).toBe(DEFAULT_MODEL);
  });

  it("uses ANTHROPIC_MODEL, and ANTHROPIC_MODEL_BULK for bulk only", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-opus-5");
    vi.stubEnv("ANTHROPIC_MODEL_BULK", "claude-sonnet-5-5");
    expect(getModel()).toBe("claude-opus-5");
    expect(getModel("bulk")).toBe("claude-sonnet-5-5");
  });

  it("falls back to ANTHROPIC_MODEL for bulk when ANTHROPIC_MODEL_BULK is unset", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-opus-5");
    vi.stubEnv("ANTHROPIC_MODEL_BULK", "");
    expect(getModel("bulk")).toBe("claude-opus-5");
  });
});

describe("structuredCall", () => {
  it("returns schema-valid data and sends effort, format and the refusal fallback", async () => {
    const { client, create } = fakeClient(textMessage('{"rating":"good"}'));
    const res = await call(client);
    expect(res).toMatchObject({ ok: true, data: { rating: "good" } });

    const params = create.mock.calls[0][0];
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
  });

  it("omits fallbacks for models that don't accept them", async () => {
    const { client, create } = fakeClient(textMessage('{"rating":"good"}'));
    await call(client, "claude-haiku-5-5");
    const params = create.mock.calls[0][0];
    expect(params.betas).toBeUndefined();
    expect(params.fallbacks).toBeUndefined();
  });

  it("reports a refusal without reading the content", async () => {
    const { client } = fakeClient(
      textMessage("partial", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: "declined" },
      }),
    );
    const res = await call(client);
    expect(res).toMatchObject({ ok: false, error: "refused", category: "cyber", explanation: "declined" });
    if (!res.ok) expect(failureResponse(res).status).toBe(422);
  });

  it("reports max_tokens", async () => {
    const { client } = fakeClient(textMessage('{"rat', { stop_reason: "max_tokens" }));
    expect(await call(client)).toMatchObject({ ok: false, error: "max_tokens" });
  });

  it("reports output that fails the schema, with the parsed JSON", async () => {
    const { client } = fakeClient(textMessage('{"rating":"meh"}'));
    const res = await call(client);
    expect(res).toMatchObject({ ok: false, error: "invalid_output", raw: { rating: "meh" } });
  });

  it("reads only the text written after a fallback block", async () => {
    const { client } = fakeClient(
      fakeMessage([
        { type: "text", text: "{not json from the declining model", citations: null },
        { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } },
        { type: "text", text: '{"rating":"bad"}', citations: null },
      ]),
    );
    expect(await call(client)).toMatchObject({ ok: true, data: { rating: "bad" } });
  });
});

describe("aiErrorResponse", () => {
  it("maps SDK errors by type", () => {
    const headers = new Headers();
    expect(aiErrorResponse(new Anthropic.RateLimitError(429, undefined, "slow down", headers)).status).toBe(429);
    expect(aiErrorResponse(new Anthropic.AuthenticationError(401, undefined, "bad key", headers)).body.error).toBe(
      "api_key_invalid",
    );
    expect(aiErrorResponse(new Error("boom"))).toMatchObject({ status: 502, body: { error: "ai_failed" } });
  });
});

describe("LruCache", () => {
  it("evicts the least recently used entry", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // a is now more recent than b
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });
});
