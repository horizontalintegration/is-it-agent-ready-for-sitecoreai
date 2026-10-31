import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandVoice } from "@/lib/brand/brand-voice";
import { fakeClient, textMessage } from "./anthropic-test-utils";
import { generateMeta } from "./generate-meta";

const brand: BrandVoice = { name: "BrandX", document: "# BrandX voice", source: "test" };
const value = (v: string) => textMessage(JSON.stringify({ value: v }));

function run(client: Parameters<typeof generateMeta>[0]["client"]) {
  return generateMeta({
    field: "metaTitle",
    pageTitle: "Retirement planning",
    bodyText: "How to plan for retirement.",
    currentValue: "Old title",
    brand,
    client,
  });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("generateMeta", () => {
  it("puts cache breakpoints on the brand voice and the page content, before the field task", async () => {
    const { client, create } = fakeClient(value("Retirement Planning | BrandX"));
    await run(client);

    const params = create.mock.calls[0][0];
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[0].text).toContain("# BrandX voice");
    const [page, task] = params.messages[0].content;
    expect(page.cache_control).toEqual({ type: "ephemeral" });
    expect(page.text).toContain("How to plan for retirement.");
    expect(task.cache_control).toBeUndefined();
    expect(task.text).toContain("at most 60 characters");
  });

  it("returns a value within the limit after one call", async () => {
    const { client, create } = fakeClient(value("  Retirement Planning | BrandX  "));
    expect(await run(client)).toEqual({
      ok: true,
      value: "Retirement Planning | BrandX",
      maxChars: 60,
      overLimit: false,
      attempts: 1,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once with the character count when the value is too long", async () => {
    const long = "BrandX Financial Planning: Wealth, Tax & Retirement Strategies"; // 62 chars
    const { client, create } = fakeClient(value(long), value("BrandX Wealth, Tax & Retirement Planning"));
    const res = await run(client);
    expect(res).toMatchObject({ ok: true, overLimit: false, attempts: 2 });

    const retryContent = create.mock.calls[1][0].messages[0].content;
    expect(retryContent).toHaveLength(3);
    expect(retryContent[2].text).toContain("62 characters, over the 60-character limit");
    // The first request was not changed by the retry
    expect(create.mock.calls[0][0].messages[0].content).toHaveLength(2);
  });

  it("returns the retry with overLimit when it is still too long, without truncating", async () => {
    const tooLong = "x".repeat(65);
    const { client, create } = fakeClient(value("y".repeat(70)), value(tooLong));
    expect(await run(client)).toEqual({ ok: true, value: tooLong, maxChars: 60, overLimit: true, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("passes a refusal through", async () => {
    const { client } = fakeClient(
      textMessage("", { stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }),
    );
    expect(await run(client)).toMatchObject({ ok: false, error: "refused" });
  });

  it("rejects an empty value", async () => {
    const { client } = fakeClient(value("   "));
    expect(await run(client)).toEqual({ ok: false, error: "empty_value" });
  });
});
