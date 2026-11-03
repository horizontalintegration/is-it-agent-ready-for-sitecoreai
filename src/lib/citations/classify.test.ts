import { describe, expect, it } from "vitest";
import { citedDelta, classify, matchesHosts, normaliseHost, probeTotals } from "./classify";
import { appendRun, readCachedProbe, RUNS_MAX, siteHostsFor, writeCachedProbe } from "./storage";
import { PROBE_CACHE_MS, type ProbeEvidence, type ProbeRun } from "./types";
import { memoryHistoryStore } from "@/lib/history/store";

const PAGE = "https://www.site.example/blog/post";
const HOSTS = ["site.example"];

function evidence(over: Partial<ProbeEvidence> = {}): ProbeEvidence {
  return {
    question: "Q?",
    searched: true,
    resultUrls: [],
    citedUrls: [],
    queries: [],
    searchErrors: [],
    excerpt: "",
    refused: false,
    retried: false,
    model: "claude-opus-5-5",
    ranAt: "2026-11-02T10:00:00.000Z",
    ...over,
  };
}

describe("hosts", () => {
  it("normalises hosts and matches subdomains, ignoring www", () => {
    expect(normaliseHost(" https://WWW.Site.example/x ")).toBe("site.example");
    expect(normaliseHost("site.example")).toBe("site.example");
    expect(matchesHosts("https://blog.site.example/a", HOSTS)).toBe(true);
    expect(matchesHosts("https://notsite.example/a", HOSTS)).toBe(false);
    expect(matchesHosts("not a url", HOSTS)).toBe(false);
    expect(siteHostsFor("https://www.site.example", ["staging.site.example", "Site.example", ""])).toEqual(["site.example", "staging.site.example"]);
  });
});

describe("classify", () => {
  it("finds and cites from the evidence, and lists the other cited hosts", () => {
    const o = classify(
      evidence({
        resultUrls: ["https://site.example/blog/post/", "https://other.example/a"],
        citedUrls: ["https://other.example/a", "https://www.third.example/b", "https://other.example/c"],
      }),
      HOSTS,
      PAGE,
    );
    expect(o).toEqual({ found: true, cited: false, pageFound: true, pageCited: false, citedInstead: ["other.example", "third.example"] });
  });

  it("counts a hosts the user marks as their own as the site", () => {
    const e = evidence({ resultUrls: ["https://dev.brand.example/p"], citedUrls: ["https://dev.brand.example/p"] });
    expect(classify(e, HOSTS, PAGE)).toMatchObject({ found: false, cited: false, citedInstead: ["dev.brand.example"] });
    expect(classify(e, [...HOSTS, "dev.brand.example"], PAGE)).toMatchObject({ found: true, cited: true, citedInstead: [] });
  });

  it("reports a question that didn't search as unknown, not false", () => {
    expect(classify(evidence({ searched: false }), HOSTS, PAGE)).toMatchObject({ found: null, cited: null });
  });

  it("totals only the searched questions", () => {
    const outcomes = [
      classify(evidence({ resultUrls: [PAGE], citedUrls: [PAGE] }), HOSTS, PAGE),
      classify(evidence({ resultUrls: [PAGE], citedUrls: ["https://x.example/"] }), HOSTS, PAGE),
      classify(evidence({ citedUrls: ["https://x.example/", "https://y.example/"] }), HOSTS, PAGE),
      classify(evidence({ searched: false }), HOSTS, PAGE),
    ];
    expect(probeTotals(outcomes)).toEqual({
      searched: 3,
      notSearched: 1,
      cited: 1,
      found: 2,
      foundNotCited: 1,
      topInstead: { host: "x.example", count: 2 },
    });
  });
});

describe("runs", () => {
  const run = (setKey: string, citedCount: number, at: string): ProbeRun => ({
    at,
    setKey,
    country: "US",
    evidence: Array.from({ length: 3 }, (_, i) => evidence({ resultUrls: [PAGE], citedUrls: i < citedCount ? [PAGE] : [] })),
  });

  it("compares the cited count with the previous run of the same questions only", () => {
    expect(citedDelta([run("a", 1, "1")], HOSTS, PAGE)).toBeNull();
    expect(citedDelta([run("a", 0, "1"), run("a", 2, "2")], HOSTS, PAGE)).toBe(2);
    expect(citedDelta([run("a", 0, "1"), run("b", 1, "2"), run("a", 3, "3")], HOSTS, PAGE)).toBe(3);
    expect(citedDelta([run("a", 0, "1"), run("b", 2, "2")], HOSTS, PAGE)).toBeNull();
  });

  it("keeps the last 10 runs per page", () => {
    const store = memoryHistoryStore();
    let runs: ProbeRun[] = [];
    for (let i = 0; i < 12; i++) runs = appendRun(store, PAGE, run("a", 0, String(i)));
    expect(runs).toHaveLength(RUNS_MAX);
    expect(runs[0].at).toBe("2");
  });

  it("reuses a probe for 7 days from when it ran, then drops it", () => {
    const store = memoryHistoryStore();
    const e = evidence({ ranAt: new Date(1_000).toISOString() });
    writeCachedProbe(store, "k", e);
    expect(readCachedProbe(store, "k", 1_000 + PROBE_CACHE_MS - 1)).toEqual(e);
    expect(readCachedProbe(store, "k", 1_000 + PROBE_CACHE_MS)).toBeNull();
    expect(store.data.has("k")).toBe(false);
  });
});
