import { describe, expect, it } from "vitest";
import { makeTestAgentAccess, makeTestSitePages, makeTestWhatChanged } from "@/lib/rule-engine/test-fixture";
import { pushSnapshot, whatChanged, type AccessSnapshot, type ChangeItem, type PageSnap, type ScanSnapshot } from "./what-changed";

const text = (item: ChangeItem) => item.parts.map((p) => (typeof p === "string" ? p : p.strong)).join("");

const page = (over: Partial<PageSnap> = {}): PageSnap => ({
  route: "/services",
  score: 80,
  label: "agent-ready",
  blocked: false,
  issues: [],
  lastModified: "2026-10-01T00:00:00.000Z",
  ...over,
});
const scan = (at: string, pages: Record<string, PageSnap>): ScanSnapshot => ({ at, score: 70, pages });
const bots = (at: string, status: "pass" | "fix", live: string, failStatus: number | null): AccessSnapshot => ({
  at,
  bots: { "ChatGPT-User": { status, outcome: status === "pass" ? "can-read" : "blocked", live, failStatus } },
});

describe("whatChanged", () => {
  it("says nothing until there are two snapshots", () => {
    expect(whatChanged({ scans: [scan("2026-11-01", {})], access: [], citations: [] })).toEqual({ items: [], comparable: false });
    expect(whatChanged({ scans: [scan("1", {}), scan("2", {})], access: [], citations: [] })).toEqual({ items: [], comparable: true });
  });

  it("reports a drop after a publish, with the checks that newly need work", () => {
    const prev = scan("2026-10-20T00:00:00.000Z", { a: page({ score: 82, issues: ["trust.author"] }) });
    const cur = scan("2026-10-30T00:00:00.000Z", {
      a: page({ score: 64, label: "almost-there", issues: ["trust.author", "understand.headings"], lastModified: "2026-10-28T12:00:00.000Z" }),
    });
    const [item] = whatChanged({ scans: [prev, cur], access: [], citations: [] }).items;
    expect(item.badge).toBe("▼ 18");
    expect(text(item)).toBe("/services dropped after the Oct 28 publish. Now needs work: One clear H1 and logical headings.");
  });

  it("ignores small moves and doesn't mention a publish from before the last scan", () => {
    const prev = scan("2026-10-20T00:00:00.000Z", { a: page({ score: 82 }), b: page({ route: "/b", score: 70 }) });
    const cur = scan("2026-10-30T00:00:00.000Z", { a: page({ score: 78 }), b: page({ route: "/b", score: 60 }) });
    const items = whatChanged({ scans: [prev, cur], access: [], citations: [] }).items;
    expect(items.map(text)).toEqual(["/b dropped."]);
  });

  it("groups pages that became agent-ready and names the fix they share", () => {
    const before = page({ label: "almost-there", score: 74, issues: ["understand.json-ld"] });
    const prev = scan("1", { a: before, b: { ...before, route: "/b" } });
    const cur = scan("2", { a: page(), b: page({ route: "/b" }) });
    const [item] = whatChanged({ scans: [prev, cur], access: [], citations: [] }).items;
    expect(item).toMatchObject({ tone: "up", badge: "▲ 2" });
    expect(text(item)).toBe('2 pages became agent-ready after "Structured data is present and valid" was fixed.');
  });

  it("reports agents newly blocked and let back in, worst first", () => {
    const blocked = whatChanged({ scans: [], access: [bots("1", "pass", "200", null), bots("2", "fix", "403", 403)], citations: [] }).items;
    expect(blocked[0].badge).toBe("New");
    expect(text(blocked[0])).toBe("ChatGPT-User now gets 403 from your firewall (it got 200 last time).");
    const back = whatChanged({ scans: [], access: [bots("1", "fix", "403", 403), bots("2", "pass", "200", null)], citations: [] }).items;
    expect(text(back[0])).toBe("ChatGPT-User can read your pages again.");
  });

  it("orders bad news before good, citations included", () => {
    const prev = scan("1", { a: page({ score: 90 }) });
    const cur = scan("2", { a: page({ score: 70, label: "almost-there" }) });
    const items = whatChanged({
      scans: [prev, cur],
      access: [],
      citations: [
        { route: "/up", delta: 2, at: "2" },
        { route: "/down", delta: -1, at: "2" },
      ],
    }).items;
    expect(items.map((i) => i.badge)).toEqual(["▼ 20", "▼", "▲"]);
    expect(text(items[1])).toBe("Cited in 1 AI answer fewer for /down.");
    expect(text(items[2])).toBe("Cited in 2 AI answers more for /up.");
  });

  it("keeps two snapshots and skips a repeat of the same scan", () => {
    const a = { at: "1" };
    const b = { at: "2" };
    expect(pushSnapshot([a], a)).toEqual([a]);
    expect(pushSnapshot([a, b], { at: "3" })).toEqual([b, { at: "3" }]);
  });

  it("gives the demo the mockup's four kinds of change", () => {
    const pages = makeTestSitePages();
    const items = whatChanged(makeTestWhatChanged(pages, 60, makeTestAgentAccess())).items;
    expect(items.map((i) => i.badge)).toEqual(["▼ 18", "New", "▲ 2", "▲"]);
    expect(text(items[0])).toMatch(/dropped after the .+ publish\. Now needs work: /);
    expect(text(items[1])).toBe("ChatGPT-User now gets 403 from your firewall (it got 200 last time).");
    expect(text(items[3])).toBe("Cited in 2 AI answers more for /insights/retirement-planning-in-your-40s.");
  });
});
