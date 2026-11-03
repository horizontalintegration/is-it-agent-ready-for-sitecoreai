import { describe, expect, it } from "vitest";
import { botGrid } from "@/lib/agent-access/grid";
import { makeTestAgentAccess, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import type { PageScoreSummary } from "@/lib/checks/view-model";
import { engineEstimates } from "./readiness";

const byEngine = (list: ReturnType<typeof engineEstimates>) => Object.fromEntries(list.map((e) => [e.engine, e]));

describe("engineEstimates", () => {
  it("reads the demo's firewall blocks as Limited, as in the mockup", () => {
    const e = byEngine(engineEstimates({ rows: botGrid(makeTestAgentAccess()), page: null }));
    expect(e.chatgpt.readiness).toBe("limited");
    expect(e.chatgpt.reasons[0]).toBe("The search crawler can read it, but ChatGPT-User gets 403 from the firewall.");
    expect(e.perplexity.readiness).toBe("limited");
    expect(e.claude.readiness).toBe("ready");
    expect(e.gemini.readiness).toBe("ready");
    expect(e.copilot.readiness).toBe("ready");
  });

  it("is Blocked when robots.txt shuts out both the search and the user agent", () => {
    const access = makeTestAgentAccess();
    access.robots.text = "User-agent: *\nDisallow: /\n";
    for (const b of access.bots) if (b.results.length) Object.assign(b, { skipped: "robots", results: [] });
    const e = byEngine(engineEstimates({ rows: botGrid(access), page: null }));
    expect(e.claude.readiness).toBe("blocked");
    expect(e.claude.reasons[0]).toBe("Claude-SearchBot is blocked by robots.txt, and Claude-User is blocked by robots.txt.");
    expect(e.gemini.readiness).toBe("limited");
  });

  it("blocks every engine for a noindex page", () => {
    const noindex = makeTestSitePages().find((p) => p.score?.blocked)!.score!;
    expect(engineEstimates({ rows: botGrid(makeTestAgentAccess()), page: noindex }).every((x) => x.readiness === "blocked")).toBe(true);
  });

  it("limits a Not ready page or one whose content needs JavaScript, but not a page that only lacks Markdown", () => {
    const pages = makeTestSitePages();
    const rows = botGrid(makeTestAgentAccess());
    const almost = pages.find((p) => p.id === "p8")!.score!;
    expect(almost.issues.some((i) => i.id === "read.markdown-page")).toBe(true);
    expect(byEngine(engineEstimates({ rows, page: almost })).claude.readiness).toBe("ready");

    const notReady = pages.find((p) => p.score?.label === "not-ready")!.score!;
    const e = byEngine(engineEstimates({ rows, page: notReady }));
    expect(e.claude.readiness).toBe("limited");
    expect(e.claude.reasons[0]).toContain(`scores ${notReady.score}/100 (Not ready)`);
    expect(e.copilot.readiness).toBe("limited");

    const jsOnly: PageScoreSummary = { ...almost, issues: [...almost.issues, { id: "read.no-js-content", status: "fail", gain: 5 }] };
    expect(byEngine(engineEstimates({ rows, page: jsOnly })).gemini.reasons[0]).toContain("needs JavaScript");
  });

  it("waits for the agent-access scan", () => {
    const e = byEngine(engineEstimates({ rows: null, page: null }));
    expect(e.chatgpt.readiness).toBe("unknown");
    expect(e.copilot.readiness).toBe("ready");
  });
});
