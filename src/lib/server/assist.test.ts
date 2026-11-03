import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandVoice } from "@/lib/brand/brand-voice";
import { fakeClient, textMessage } from "./anthropic-test-utils";
import { imageUrlForModel, runAssist, type AssistRequest } from "./assist";

const brand: BrandVoice = { name: "BrandX", document: "# BrandX voice", source: "test" };
const json = (v: unknown) => textMessage(JSON.stringify(v));
// Each test uses its own page text, so the shared result cache never answers for another test.
let n = 0;
const page = () => ({ pageTitle: "Banking Sector Earnings", mainText: `Banks reported healthy credit growth. #${++n}` });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runAssist", () => {
  it("caches the brand voice and the page text, then sends the task", async () => {
    const { client, create } = fakeClient(json({ summary: "Banks are resilient." }));
    const res = await runAssist({ kind: "summary", ...page() }, brand, client);
    expect(res).toMatchObject({ ok: true, cached: false, data: { kind: "summary", summary: "Banks are resilient." } });

    const params = create.mock.calls[0][0];
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.output_config.effort).toBe("low");
    const [pageBlock, task] = params.messages[0].content;
    expect(pageBlock.cache_control).toEqual({ type: "ephemeral" });
    expect(task.cache_control).toBeUndefined();
    expect(params.fallbacks).toBe("default");
  });

  it("answers the same request from the cache", async () => {
    const req: AssistRequest = { kind: "summary", ...page() };
    const { client, create } = fakeClient(json({ summary: "Once." }));
    await runAssist(req, brand, client);
    const again = await runAssist(req, brand, client);
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends the image by URL, and falls back to the file name when Claude can't fetch it", async () => {
    const { client, create } = fakeClient(json({ alt: "Analysts reviewing quarterly bank results on a laptop" }));
    create.mockReset();
    create
      .mockRejectedValueOnce(new Anthropic.BadRequestError(400, { type: "error" }, "Unable to download the image", new Headers()))
      .mockResolvedValueOnce(json({ alt: "People reviewing bank results" }));
    const res = await runAssist(
      { kind: "alt", ...page(), image: { src: "https://cm.example.com/-/media/Articles/campaign-creators-unsplash.jpg", currentAlt: "campaign-creators-unsplash" } },
      brand,
      client,
    );
    expect(res).toMatchObject({ ok: true, data: { kind: "alt", alt: "People reviewing bank results", sawImage: false, overLimit: false } });
    const first = create.mock.calls[0][0].messages[0].content;
    expect(first[1]).toEqual({ type: "image", source: { type: "url", url: "https://cm.example.com/-/media/Articles/campaign-creators-unsplash.jpg?mw=1024" } });
    const second = create.mock.calls[1][0].messages[0].content;
    expect(second.some((b: { type: string }) => b.type === "image")).toBe(false);
    expect(second.at(-1).text).toContain('"campaign-creators-unsplash.jpg"');
  });

  it("keeps only the FAQ answers it was asked for and flags lengths", async () => {
    const short = "Yes.";
    const good = "Yes. The first meeting is free, with no cost, no pressure and no obligation to continue.";
    const { client, create } = fakeClient(json({ answers: [{ id: "a", answer: good }, { id: "b", answer: short }, { id: "x", answer: good }] }));
    const res = await runAssist(
      { kind: "faq-answers", ...page(), pairs: [{ id: "a", question: "Is it free?", answer: "Yes." }, { id: "b", question: "How long?", answer: "1h" }] },
      brand,
      client,
    );
    expect(res.ok && res.data.kind === "faq-answers" && res.data.answers).toEqual([
      { id: "a", answer: good, inRange: true },
      { id: "b", answer: short, inRange: false },
    ]);
    expect(create.mock.calls[0][0].messages[0].content.at(-1).text).toContain("id: a\nQuestion: Is it free?");
  });

  it("asks for question headings at medium effort and drops unchanged or unknown ones", async () => {
    const { client, create } = fakeClient(
      json({ headings: [{ before: "Investor Considerations", after: "Should investors buy bank stocks now?" }, { before: "The Bottom Line", after: "The Bottom Line" }, { before: "Made up", after: "Why?" }] }),
    );
    const res = await runAssist({ kind: "question-headings", ...page(), headings: ["Investor Considerations", "The Bottom Line"] }, brand, client);
    expect(create.mock.calls[0][0].output_config.effort).toBe("medium");
    expect(res.ok && res.data.kind === "question-headings" && res.data.headings).toEqual([
      { before: "Investor Considerations", after: "Should investors buy bank stocks now?" },
    ]);
  });

  it("returns a refusal without caching it", async () => {
    const { client } = fakeClient(textMessage("", { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } }));
    const res = await runAssist({ kind: "summary", ...page() }, brand, client);
    expect(res).toMatchObject({ ok: false, error: "refused", category: "cyber" });
  });
});

describe("imageUrlForModel", () => {
  it("asks Sitecore media for a 1024 px version", () => {
    expect(imageUrlForModel("https://edge.sitecorecloud.io/t/media/Project/a.jpg")).toBe("https://edge.sitecorecloud.io/t/media/Project/a.jpg?mw=1024");
    expect(imageUrlForModel("https://example.com/img/a.jpg")).toBe("https://example.com/img/a.jpg");
  });
});
