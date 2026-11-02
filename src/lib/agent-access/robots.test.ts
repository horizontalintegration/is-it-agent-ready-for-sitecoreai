import { describe, expect, it } from "vitest";
import { contentSignals, groupsFor, isAllowed, isNamed, parseContentSignal, parseRobots } from "./robots";
import { buildRobotsLines } from "./robots-helper";

describe("parseRobots", () => {
  it("groups consecutive User-agent lines and keeps Sitemap lines global", () => {
    const r = parseRobots(`# comment
User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

Sitemap: https://example.com/sitemap.xml
User-agent: *
Allow: /
`);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].agents).toEqual(["gptbot", "claudebot"]);
    expect(r.groups[1].agents).toEqual(["*"]);
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("ignores rules before any User-agent line, but keeps a Content-Signal there for everyone", () => {
    const r = parseRobots("Disallow: /\nContent-Signal: search=yes, ai-train=no\nUser-agent: *\nAllow: /\n");
    expect(isAllowed(r, "GPTBot", "/")).toBe(true);
    expect(contentSignals(r)).toEqual([{ agents: ["*"], value: "search=yes, ai-train=no" }]);
  });
});

describe("isAllowed (RFC 9309)", () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/public

User-agent: GPTBot
Disallow: /

User-agent: Claude-User
Allow: /
Disallow: /checkout$

User-agent: PerplexityBot/1.0
Disallow: /
`);

  it("uses the bot's own group over *", () => {
    expect(isAllowed(robots, "GPTBot", "/")).toBe(false);
    expect(isAllowed(robots, "gptbot", "/about")).toBe(false);
    expect(isAllowed(robots, "ClaudeBot", "/")).toBe(true);
  });

  it("lets the longest match win, and Allow win a tie", () => {
    expect(isAllowed(robots, "ClaudeBot", "/private/x")).toBe(false);
    expect(isAllowed(robots, "ClaudeBot", "/private/public/x")).toBe(true);
    expect(isAllowed(parseRobots("User-agent: *\nDisallow: /a\nAllow: /a\n"), "x", "/a")).toBe(true);
  });

  it("supports $ and * patterns", () => {
    expect(isAllowed(robots, "Claude-User", "/checkout")).toBe(false);
    expect(isAllowed(robots, "Claude-User", "/checkout/step")).toBe(true);
    const wild = parseRobots("User-agent: *\nDisallow: /*.pdf$\n");
    expect(isAllowed(wild, "x", "/files/a.pdf")).toBe(false);
    expect(isAllowed(wild, "x", "/files/a.pdf?x=1")).toBe(true);
  });

  it("matches a User-agent value with a version (PerplexityBot/1.0)", () => {
    expect(isAllowed(robots, "PerplexityBot", "/")).toBe(false);
    expect(isNamed(robots, "PerplexityBot")).toBe(true);
    expect(isNamed(robots, "Amazonbot")).toBe(false);
  });

  it("treats an empty Disallow as no rule, and no groups as allow-all", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "GPTBot", "/")).toBe(true);
    expect(isAllowed(parseRobots(""), "GPTBot", "/")).toBe(true);
    expect(groupsFor(parseRobots(""), "GPTBot")).toEqual([]);
  });
});

describe("parseContentSignal", () => {
  it("reads key=value pairs", () => {
    expect(parseContentSignal("search=yes, ai-input=Yes,ai-train=no")).toEqual({ search: "yes", "ai-input": "yes", "ai-train": "no" });
  });
});

describe("buildRobotsLines", () => {
  it("writes a group per purpose, the Content-Signal line and the Sitemap line", () => {
    const text = buildRobotsLines({
      allow: { search: true, user: true, training: false },
      contentSignal: true,
      sitemapUrl: "https://example.com/sitemap.xml",
    });
    const parsed = parseRobots(text);
    expect(isAllowed(parsed, "OAI-SearchBot", "/")).toBe(true);
    expect(isAllowed(parsed, "ChatGPT-User", "/")).toBe(true);
    expect(isAllowed(parsed, "GPTBot", "/")).toBe(false);
    expect(isAllowed(parsed, "meta-externalagent", "/")).toBe(false);
    expect(text).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
    expect(parsed.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("leaves the Content-Signal line out when unticked", () => {
    const text = buildRobotsLines({ allow: { search: true, user: true, training: true }, contentSignal: false, sitemapUrl: "https://e.com/sitemap.xml" });
    expect(text).not.toContain("Content-Signal");
  });
});
