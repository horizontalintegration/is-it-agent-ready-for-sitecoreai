import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanQuestions,
  extractEvidence,
  generateQuestions,
  probeQuestion,
  readProbeCache,
  SiteRateLimiter,
  writeProbeCache,
} from "./citation-probe";
import { fakeClient, fakeMessage } from "./anthropic-test-utils";
import { PROBE_CACHE_MS, type ProbeEvidence } from "@/lib/citations/types";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const search = (query: string, id = "srv_1") => ({ type: "server_tool_use", id, name: "web_search", input: { query } });
const results = (urls: string[], id = "srv_1") => ({
  type: "web_search_tool_result",
  tool_use_id: id,
  caller: { type: "direct" },
  content: urls.map((url) => ({ type: "web_search_result", url, title: url, encrypted_content: "x", page_age: null })),
});
const searchError = (code: string) => ({ type: "web_search_tool_result", tool_use_id: "srv_e", content: { type: "web_search_tool_result_error", error_code: code } });
const cited = (text: string, urls: string[]) => ({
  type: "text",
  text,
  citations: urls.map((url) => ({ type: "web_search_result_location", url, title: url, cited_text: "…", encrypted_index: "x" })),
});
const usage = (searches: number) => ({
  input_tokens: 1000,
  output_tokens: 100,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  server_tool_use: { web_search_requests: searches },
});

const searchedAnswer = (urls: string[], citedUrls: string[]) =>
  fakeMessage([search("best content strategy"), results(urls), cited("Start with goals.", citedUrls)], { usage: usage(1) });
const memoryAnswer = () => fakeMessage([{ type: "text", text: "From memory.", citations: null }], { usage: usage(0) });

describe("extractEvidence", () => {
  it("keeps every result URL, the cited URLs and the queries", () => {
    const e = extractEvidence([searchedAnswer(["https://a.example/x", "https://www.site.example/p"], ["https://a.example/x"])], "Q?");
    expect(e).toMatchObject({
      question: "Q?",
      searched: true,
      resultUrls: ["https://a.example/x", "https://www.site.example/p"],
      citedUrls: ["https://a.example/x"],
      queries: ["best content strategy"],
      searchErrors: [],
      excerpt: "Start with goals.",
      refused: false,
      model: "claude-opus-5-5",
    });
  });

  it("treats an error object as a failed search, not results", () => {
    const e = extractEvidence([fakeMessage([search("q"), searchError("too_many_requests"), { type: "text", text: "Sorry.", citations: null }])], "Q?");
    expect(e.searched).toBe(false);
    expect(e.searchErrors).toEqual(["too_many_requests"]);
    expect(e.resultUrls).toEqual([]);
  });

  it("counts an empty result list as a search that found nothing", () => {
    const e = extractEvidence([fakeMessage([search("q"), results([]), { type: "text", text: "Nothing.", citations: null }])], "Q?");
    expect(e.searched).toBe(true);
    expect(e.resultUrls).toEqual([]);
  });

  it("reads citations only from the answer after a fallback", () => {
    const msg = fakeMessage([
      search("q"),
      results(["https://site.example/p"]),
      cited("Declined part", ["https://site.example/p"]),
      { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
      cited("Fallback answer", ["https://other.example/"]),
    ]);
    const e = extractEvidence([msg], "Q?");
    expect(e.resultUrls).toEqual(["https://site.example/p"]);
    expect(e.citedUrls).toEqual(["https://other.example/"]);
    expect(e.excerpt).toBe("Fallback answer");
  });

  it("flags a refusal", () => {
    const e = extractEvidence([fakeMessage([], { stop_reason: "refusal" })], "Q?");
    expect(e.refused).toBe(true);
  });
});

describe("probeQuestion", () => {
  it("sends one direct-mode web search request with low effort and the refusal fallback", async () => {
    const { client, create } = fakeClient(searchedAnswer(["https://a.example/"], []));
    const e = await probeQuestion({ question: "Q?", model: "claude-opus-5-5", country: "US", client });
    expect(e.retried).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0];
    expect(params.tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_callers: ["direct"], user_location: { type: "approximate", country: "US" } },
    ]);
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.tool_choice).toBeUndefined();
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages).toEqual([{ role: "user", content: "Q?" }]);
    expect(options).toMatchObject({ maxRetries: 0 });
  });

  it("asks once more when no search ran, and keeps the second answer", async () => {
    const { client, create } = fakeClient(memoryAnswer(), searchedAnswer(["https://site.example/"], ["https://site.example/"]));
    const e = await probeQuestion({ question: "Q?", model: "claude-opus-5-5", country: null, client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(e).toMatchObject({ retried: true, searched: true, citedUrls: ["https://site.example/"] });
    expect(create.mock.calls[0][0].tools[0].user_location).toBeUndefined();
  });

  it("reports not searched after the retry also answers from memory", async () => {
    const { client, create } = fakeClient(memoryAnswer(), memoryAnswer());
    const e = await probeQuestion({ question: "Q?", model: "claude-opus-5-5", country: null, client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(e).toMatchObject({ retried: true, searched: false });
  });

  it("doesn't retry a refusal", async () => {
    const { client, create } = fakeClient(fakeMessage([], { stop_reason: "refusal", usage: usage(0) }));
    const e = await probeQuestion({ question: "Q?", model: "claude-opus-5-5", country: null, client });
    expect(create).toHaveBeenCalledTimes(1);
    expect(e.refused).toBe(true);
  });

  it("continues a paused turn by sending it back unchanged", async () => {
    const paused = fakeMessage([search("q"), results(["https://a.example/"])], { stop_reason: "pause_turn", usage: usage(1) });
    const { client, create } = fakeClient(paused, fakeMessage([cited("Done.", ["https://a.example/"])], { usage: usage(0) }));
    const e = await probeQuestion({ question: "Q?", model: "claude-opus-5-5", country: null, client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages).toEqual([
      { role: "user", content: "Q?" },
      { role: "assistant", content: paused.content },
    ]);
    expect(e).toMatchObject({ searched: true, citedUrls: ["https://a.example/"], retried: false });
  });

  it("omits the fallback fields for a model that doesn't accept them", async () => {
    const { client, create } = fakeClient(searchedAnswer([], []));
    await probeQuestion({ question: "Q?", model: "claude-haiku-5-5", country: null, client });
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
  });
});

describe("questions", () => {
  it("cleans the list: trims, drops duplicates and over-long ones, keeps 10", () => {
    const long = "x".repeat(301);
    const many = Array.from({ length: 14 }, (_, i) => `Question ${i}?`);
    expect(cleanQuestions(["  How?  ", "how?", long, "What?"])).toEqual(["How?", "What?"]);
    expect(cleanQuestions(many)).toHaveLength(10);
  });

  it("asks at medium effort with structured output", async () => {
    const { client, create } = fakeClient(
      fakeMessage([{ type: "text", text: JSON.stringify({ questions: ["How do I plan content?", "How do I plan content?", "What is a pillar?"] }), citations: null }]),
    );
    const res = await generateQuestions({ url: "https://site.example/p", title: "T", headings: ["H"], mainText: "Body" }, "claude-opus-5-5", client);
    expect(res.ok && res.data.questions).toEqual(["How do I plan content?", "What is a pillar?"]);
    const params = create.mock.calls[0][0];
    expect(params.output_config.effort).toBe("medium");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.messages[0].content).toContain("never name the brand");
  });
});

describe("cache and rate limit", () => {
  const evidence = { question: "Q?" } as ProbeEvidence;

  it("serves a probe for 7 days", () => {
    writeProbeCache("k1", evidence, 1_000);
    expect(readProbeCache("k1", 1_000 + PROBE_CACHE_MS - 1)).toBe(evidence);
    expect(readProbeCache("k1", 1_000 + PROBE_CACHE_MS)).toBeNull();
    expect(readProbeCache("missing")).toBeNull();
  });

  it("limits probes per site per hour", () => {
    const limiter = new SiteRateLimiter(2, 1_000);
    expect(limiter.take("a.example", 0)).toBe(true);
    expect(limiter.take("a.example", 10)).toBe(true);
    expect(limiter.take("a.example", 20)).toBe(false);
    expect(limiter.take("b.example", 20)).toBe(true);
    expect(limiter.take("a.example", 1_001)).toBe(true);
  });
});
