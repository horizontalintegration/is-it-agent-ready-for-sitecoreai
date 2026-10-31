import { describe, expect, it } from "vitest";
import type { AiResults } from "@/lib/rule-engine/types";
import { aiResultKey, type KeyValueStore, readAiResult, writeAiResult } from "./ai-results-cache";
import { contentKey, normaliseText, sha256Hex } from "./content-key";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const result: AiResults = {
  uniquenessRating: "unique",
  uniquenessExplanation: "Original research.",
  followUpGaps: [{ question: "How much?", covered: false }],
};

describe("content keys", () => {
  it("hashes with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("ignores whitespace-only differences", async () => {
    expect(normaliseText("  a\n\tb  ")).toBe("a b");
    expect(await aiResultKey("Title", "Some  body\ntext")).toBe(await aiResultKey(" Title ", "Some body text"));
  });

  it("changes when the content or the part boundaries change", async () => {
    expect(await aiResultKey("Title", "Body A")).not.toBe(await aiResultKey("Title", "Body B"));
    expect(await contentKey(["ab", "c"])).not.toBe(await contentKey(["a", "bc"]));
  });
});

describe("browser AI result cache", () => {
  it("round-trips a result by key", () => {
    const store = memoryStore();
    expect(readAiResult("k1", store)).toBeNull();
    writeAiResult("k1", result, store);
    expect(readAiResult("k1", store)).toEqual(result);
  });

  it("is a no-op without storage (server render)", () => {
    expect(readAiResult("k1", null)).toBeNull();
    expect(() => writeAiResult("k1", result, null)).not.toThrow();
  });

  it("keeps at most 500 entries, dropping the oldest", () => {
    const store = memoryStore();
    for (let i = 0; i < 502; i++) writeAiResult(`k${i}`, result, store);
    expect(readAiResult("k0", store)).toBeNull();
    expect(readAiResult("k1", store)).toBeNull();
    expect(readAiResult("k2", store)).toEqual(result);
    expect(readAiResult("k501", store)).toEqual(result);
  });
});
