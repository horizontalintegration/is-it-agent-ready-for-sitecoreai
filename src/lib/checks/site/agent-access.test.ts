import { describe, expect, it } from "vitest";
import { botGrid } from "@/lib/agent-access/grid";
import type { AgentAccessData } from "@/lib/agent-access/types";
import { makeTestAgentAccess, makeTestSiteContext } from "@/lib/rule-engine/test-fixture";
import { runSiteChecks } from "../engine";
import { gradeNegotiation } from "../markdown-negotiation";
import type { SiteContext, SiteType } from "../types";
import { parseLinkHeader } from "./read";

function run(mutate: (a: AgentAccessData) => void = () => {}, siteType: SiteType = "content") {
  const ctx: SiteContext = makeTestSiteContext();
  mutate(ctx.access!);
  return runSiteChecks({ ...ctx, siteType });
}

const outcome = (report: ReturnType<typeof run>, id: string) => {
  const o = report.outcomes.find((x) => x.check.id === id);
  if (!o) throw new Error(`no ${id}`);
  return o.result;
};

const page = (status: number, bytes: number, extra: Partial<AgentAccessData["pages"][number]["browser"]> = {}) => ({
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status,
  error: null,
  contentType: "text/html",
  bytes,
  challenge: false,
  ...extra,
});

describe("the demo fixture (Phase 6 accept-when)", () => {
  const report = run();

  it("lists S1–S12 in plan order", () => {
    expect(report.outcomes.map((o) => o.check.ref)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"]);
  });

  it("S1 fails: ChatGPT-User gets 403 from the firewall", () => {
    const s1 = outcome(report, "reach.ai-bot-access");
    expect(s1.status).toBe("fail");
    expect(s1.message).toBe("ChatGPT-User and Perplexity-User get HTTP 403 from your firewall.");
    expect(s1.credit).toBeCloseTo(5 / 7);
    expect(s1.value).toBe("5 of 7 search and user agents can read");
  });

  it("the grid shows ChatGPT-User blocked, GPTBot opted out and Google-Extended as a robots.txt rule", () => {
    const rows = Object.fromEntries(botGrid(makeTestAgentAccess()).map((r) => [r.bot.name, r]));
    expect(rows["ChatGPT-User"]).toMatchObject({ live: "403", result: "Blocked by firewall", status: "fix", robots: "allowed", failStatus: 403 });
    expect(rows["GPTBot"]).toMatchObject({ live: "Not requested", result: "Opted out (your choice)", status: "info", robots: "disallowed" });
    expect(rows["Google-Extended"]).toMatchObject({ live: "robots.txt rule only", result: "No separate crawler", status: "info" });
    expect(rows["Claude-User"]).toMatchObject({ live: "200", result: "Can read", status: "pass" });
  });

  it("S2 passes and notes the training opt-out", () => {
    const s2 = outcome(report, "reach.robots-ai-rules");
    expect(s2.credit).toBe(1);
    expect(s2.message).toBe("Search and user agents are allowed. GPTBot (training) is disallowed, which is your choice and doesn't lower the score.");
  });

  it("grades the rest as in the mockup", () => {
    expect(outcome(report, "read.markdown-site")).toMatchObject({ credit: 0, status: "fail", message: "The home page returned text/html for Accept: text/markdown." });
    expect(outcome(report, "reach.sitemap")).toMatchObject({ credit: 1, message: "128 URLs, all with lastmod. Listed in robots.txt." });
    expect(outcome(report, "read.llms-txt")).toMatchObject({ credit: 0, status: "warning" });
    expect(outcome(report, "trust.trust-pages")).toMatchObject({ credit: 1, message: "All three respond with 200. The privacy page has 4,100 characters." });
    expect(outcome(report, "reach.not-found")).toMatchObject({ credit: 1, message: "A random URL returned 404." });
    expect(outcome(report, "reach.content-signals")).toMatchObject({ state: "scored", credit: 0, status: "info" });
    expect(outcome(report, "read.link-headers")).toMatchObject({ state: "scored", credit: 0, status: "info" });
    expect(outcome(report, "read.agent-protocols").state).toBe("not-applicable");
    expect(outcome(report, "read.commerce-protocols").state).toBe("not-applicable");
  });

  it("gives a site score without touching page scores", () => {
    expect(report.score).not.toBeNull();
  });
});

describe("S1 live requests", () => {
  it("is not checked without a scan, or when the home page fails for a browser too", () => {
    const ctx = makeTestSiteContext();
    expect(outcome(runSiteChecks({ ...ctx, access: null }), "reach.ai-bot-access").state).toBe("not-checked");
    const r = run((a) => {
      a.home.probe = { ...a.home.probe, status: 503 };
    });
    expect(outcome(r, "reach.ai-bot-access").state).toBe("not-checked");
  });

  it("says so when robots.txt keeps every search and user agent out (BrandX, 2026-11-02)", () => {
    const r = run((a) => {
      a.robots.text = "User-agent: *\nDisallow: /\n";
      for (const b of a.bots) if (b.skipped === null) b.skipped = "robots";
    });
    expect(outcome(r, "reach.ai-bot-access")).toMatchObject({ state: "not-checked", message: expect.stringContaining("robots.txt asks every search and user agent to stay out") });
    expect(outcome(r, "reach.robots-ai-rules")).toMatchObject({ credit: 0, status: "fail" });
  });

  it("flags a challenge page and a stub page, and reports the worst sample", () => {
    const access = makeTestAgentAccess();
    const claude = access.bots.find((b) => b.name === "Claude-User")!;
    claude.results[2] = { ...claude.results[2], challenge: true };
    const oai = access.bots.find((b) => b.name === "OAI-SearchBot")!;
    oai.results[0] = { ...oai.results[0], bytes: 3_000 };
    const rows = Object.fromEntries(botGrid(access).map((r) => [r.bot.name, r]));
    expect(rows["Claude-User"]).toMatchObject({ outcome: "challenge", live: "200 · Challenge page on /services", status: "fix" });
    expect(rows["OAI-SearchBot"]).toMatchObject({ outcome: "challenge", live: "Challenge page" });
  });

  it("shows a sample-page block next to the home page status", () => {
    const access = makeTestAgentAccess();
    const amazon = access.bots.find((b) => b.name === "Amazonbot")!;
    amazon.results[1] = { ...amazon.results[1], status: 403, bytes: 900 };
    const row = botGrid(access).find((r) => r.bot.name === "Amazonbot")!;
    expect(row).toMatchObject({ outcome: "blocked", live: "200 · 403 on /insights", failStatus: 403 });
  });

  it("doesn't count a blocked training agent against the score", () => {
    const r = run((a) => {
      for (const b of a.bots) {
        if (b.name === "ClaudeBot" || b.name === "meta-externalagent") b.results = b.results.map((p) => ({ ...p, status: 403 }));
        if (b.name === "ChatGPT-User" || b.name === "Perplexity-User") b.results = b.results.map((p) => ({ ...p, status: 200, bytes: 180_000 }));
      }
    });
    const s1 = outcome(r, "reach.ai-bot-access");
    expect(s1.credit).toBe(1);
    expect(s1.status).toBe("pass");
    expect(s1.message).toContain("ClaudeBot and meta-externalagent (training) are blocked too");
  });

  it("treats a timed-out agent as not checked rather than blocked", () => {
    const access = makeTestAgentAccess();
    const bot = access.bots.find((b) => b.name === "Claude-SearchBot")!;
    bot.results = bot.results.map((p) => ({ ...p, status: null, error: "timeout", bytes: 0 }));
    expect(botGrid(access).find((r) => r.bot.name === "Claude-SearchBot")).toMatchObject({ outcome: "error", live: "Timed out", status: "not-checked" });
  });
});

describe("S2 robots.txt", () => {
  it("fails when search or user agents are disallowed", () => {
    const r = run((a) => {
      a.robots.text = "User-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\nDisallow: /\n";
    });
    const s2 = outcome(r, "reach.robots-ai-rules");
    expect(s2.status).toBe("fail");
    expect(s2.credit).toBeCloseTo(5 / 7);
    expect(s2.message).toBe("robots.txt blocks OAI-SearchBot and ChatGPT-User.");
  });

  it("passes with no robots.txt, fails on a 5xx, and isn't checked when unreachable", () => {
    expect(outcome(run((a) => { a.robots = { probe: { ...a.robots.probe, status: 404 }, text: null }; }), "reach.robots-ai-rules")).toMatchObject({ credit: 1, value: "No robots.txt" });
    expect(outcome(run((a) => { a.robots = { probe: { ...a.robots.probe, status: 503 }, text: null }; }), "reach.robots-ai-rules")).toMatchObject({ credit: 0, status: "fail" });
    expect(outcome(run((a) => { a.robots = { probe: { ...a.robots.probe, status: null, error: "timeout" }, text: null }; }), "reach.robots-ai-rules").state).toBe("not-checked");
  });
});

describe("S3 Markdown (accept.md)", () => {
  it("gives full credit for Markdown with an HTML fallback, Vary: Accept and a size saving", () => {
    const g = gradeNegotiation({
      markdown: { status: 200, contentType: "text/markdown; charset=utf-8", vary: "Accept-Encoding, Accept", body: "# BrandX\n\nPlan your future.", bytes: 9_000 },
      html: { status: 200, contentType: "text/html", bytes: 180_000 },
    });
    expect(g).toMatchObject({ servesMarkdown: true, htmlFallback: true, varyAccept: true, smaller: true, savingPct: 95, credit: 1 });
  });

  it("gives partial credit without Vary: Accept, and none for HTML labelled as Markdown", () => {
    expect(gradeNegotiation({
      markdown: { status: 200, contentType: "text/markdown", vary: null, body: "# Hi", bytes: 10 },
      html: { status: 200, contentType: "text/html", bytes: 100 },
    }).credit).toBeCloseTo(0.5 + 0.5 * (2 / 3));
    expect(gradeNegotiation({
      markdown: { status: 200, contentType: "text/markdown", vary: "Accept", body: "<!doctype html><html>", bytes: 10 },
      html: { status: 200, contentType: "text/html", bytes: 100 },
    }).credit).toBe(0);
  });
});

describe("S4, S5, S6, S8", () => {
  it("S4: a sitemap not listed in robots.txt and without lastmod gets half credit", () => {
    const r = run((a) => {
      a.sitemap = { ...a.sitemap!, source: "default", lastmodCount: 0 };
    });
    expect(outcome(r, "reach.sitemap")).toMatchObject({ credit: 0.5, message: "128 URLs, none with lastmod. Not listed in robots.txt." });
  });

  it("S5: grades an llms.txt by its parts", () => {
    const full = "# BrandX\n\n> Financial planning.\n\n## When to use this site\nFor planning.\n\n## Insights\n- [Retirement](https://example.com/r): How much to save\n";
    const ok = (text: string) => run((a) => { a.llmsTxt = { probe: { ...a.llmsTxt.probe, status: 200, contentType: "text/plain" }, text }; });
    expect(outcome(ok(full), "read.llms-txt")).toMatchObject({ credit: 1, status: "pass" });
    expect(outcome(ok("# BrandX\n\n- [A](https://e.com/a)\n"), "read.llms-txt")).toMatchObject({ credit: 0.65, status: "warning" });
    expect(outcome(ok("<!doctype html><html></html>"), "read.llms-txt")).toMatchObject({ credit: 0, message: "/llms.txt returns a web page, not a text file." });
  });

  it("S6: a missing contact link and a short privacy page", () => {
    const r = run((a) => {
      a.trustPages[1] = { kind: "contact", href: null, probe: null, textChars: 0 };
      a.trustPages[2] = { ...a.trustPages[2], textChars: 230 };
    });
    expect(outcome(r, "trust.trust-pages")).toMatchObject({
      credit: 1 / 3,
      message: "No link to a contact page. The privacy page has only 230 characters (a policy needs 500 or more).",
    });
  });

  it("S8: a soft 404 that redirects home fails", () => {
    const r = run((a) => {
      a.notFound = { ...a.notFound, status: 200, finalUrl: "https://example.com/" };
    });
    expect(outcome(r, "reach.not-found")).toMatchObject({ credit: 0, message: "A random URL redirects to the home page instead of returning 404 (a soft 404)." });
  });
});

describe("Bonus: S9, S10, S11, S12", () => {
  it("S9 passes with a Content-Signal line", () => {
    const r = run((a) => { a.robots.text = "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n"; });
    expect(outcome(r, "reach.content-signals")).toMatchObject({ credit: 1, message: "robots.txt declares: search=yes, ai-input=yes, ai-train=no." });
  });

  it("S10 reads Link headers that point to discovery files", () => {
    expect(parseLinkHeader('</llms.txt>; rel="describedby", </index.md>; rel=alternate; type="text/markdown"')).toEqual([
      { url: "/llms.txt", rel: ["describedby"], type: null },
      { url: "/index.md", rel: ["alternate"], type: "text/markdown" },
    ]);
    const r = run((a) => { a.home.linkHeader = '</llms.txt>; rel="describedby"'; });
    expect(outcome(r, "read.link-headers")).toMatchObject({ credit: 1, message: "Link headers point agents to /llms.txt." });
    const none = run((a) => { a.home.linkHeader = '<https://cdn.example.com>; rel=preconnect'; });
    expect(outcome(none, "read.link-headers")).toMatchObject({ credit: 0, status: "info" });
  });

  it("S11 applies to App/API sites and counts protocols found", () => {
    const r = run((a) => {
      for (const w of a.wellKnown) if (w.id === "a2a-agent-card" || w.id === "api-catalog") w.json = true;
    }, "app");
    expect(outcome(r, "read.agent-protocols")).toMatchObject({ credit: 1, message: "Found: A2A agent card and API catalog." });
    expect(outcome(run(() => {}, "app"), "read.agent-protocols")).toMatchObject({ credit: 0, status: "info" });
  });

  it("S12 applies to Commerce sites; MPP needs x-payment-info", () => {
    const r = run((a) => {
      for (const w of a.wellKnown) if (w.id === "openapi") w.json = true;
    }, "commerce");
    expect(outcome(r, "read.commerce-protocols").credit).toBe(0);
    const ucp = run((a) => {
      for (const w of a.wellKnown) if (w.id === "ucp") w.json = true;
    }, "commerce");
    expect(outcome(ucp, "read.commerce-protocols")).toMatchObject({ credit: 1, message: "Found: UCP business profile." });
  });
});

describe("grid edge cases", () => {
  it("can't compare a page that fails for a browser too", () => {
    const access = makeTestAgentAccess();
    access.pages = [{ path: "/", browser: page(500, 0) }];
    for (const b of access.bots) b.results = b.results.slice(0, 1).map(() => page(500, 0));
    const row = botGrid(access).find((r) => r.bot.name === "ClaudeBot")!;
    expect(row.outcome).toBe("not-checked");
  });
});
