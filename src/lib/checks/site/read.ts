// Site checks — Read (S3, S5, S10, S11, S12). They grade the evidence from
// /api/agent-access (src/lib/server/agent-access.ts).

import type { WellKnownEvidence, WellKnownId } from "@/lib/agent-access/types";
import { gradeNegotiation, mediaType } from "../markdown-negotiation";
import { notApplicable, notChecked, scored } from "../result";
import type { CheckDef, SiteContext } from "../types";
import { listText, notScanned } from "./shared";

/** S3 — the accept.md checks on the home page. */
export const markdownSite: CheckDef<SiteContext> = {
  id: "read.markdown-site",
  ref: "S3",
  title: "Your site can serve Markdown to agents",
  why: "Markdown gives agents your content without the page's code, so they read more of it for less.",
  category: "read",
  tier: "essential",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const { markdown, home } = access;
    const g = gradeNegotiation({
      markdown: { ...markdown.probe, vary: markdown.vary, body: markdown.body },
      html: home.probe,
    });
    if (!g.checked) return notChecked("Couldn't check", "The home page didn't respond.");
    const details = [
      `Markdown for Accept: text/markdown: ${g.servesMarkdown ? "yes" : "no"}`,
      `HTML for browsers: ${g.htmlFallback ? "yes" : "no"}`,
      `Vary: Accept header: ${g.varyAccept ? "yes" : "no"}`,
      `Smaller than the HTML: ${g.savingPct !== null ? `yes, ${g.savingPct}% smaller` : "no"}`,
    ];
    const fixSuggestion =
      "Serve a Markdown version when a request asks for text/markdown (content negotiation), keep HTML for browsers, and send Vary: Accept so caches keep the two apart.";
    if (!g.servesMarkdown) {
      const type = markdown.probe.status === null ? `no response (${markdown.probe.error})` : mediaType(markdown.probe.contentType) || `HTTP ${markdown.probe.status}`;
      return scored(0, "No Markdown", `The home page returned ${type} for Accept: text/markdown.`, { fixSuggestion, details });
    }
    const missing = [!g.htmlFallback && "HTML for browsers", !g.varyAccept && "a Vary: Accept header", !g.smaller && "a Markdown version smaller than the HTML"].filter(
      (m): m is string => Boolean(m),
    );
    const saving = g.savingPct !== null ? ` ${g.savingPct}% smaller than the HTML.` : "";
    return scored(g.credit, "Serves Markdown", `The home page serves Markdown.${saving}${missing.length > 0 ? ` Missing: ${listText(missing)}.` : ""}`, {
      fixSuggestion: missing.length > 0 ? fixSuggestion : "",
      details,
    });
  },
};

/** S5 — /llms.txt, in the llmstxt.org format, with a "when to use" section. */
export const llmsTxt: CheckDef<SiteContext> = {
  id: "read.llms-txt",
  ref: "S5",
  title: "llms.txt is published",
  why: "llms.txt is a short guide for AI tools: what the site covers, when to use it, and its best pages.",
  category: "read",
  tier: "recommended",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const { probe, text } = access.llmsTxt;
    if (probe.status === null) return notChecked("Couldn't check", `/llms.txt didn't respond (${probe.error}).`);
    const fixSuggestion = "Generate one in the Files tab and publish it at /llms.txt.";
    // Missing is amber, not red: llms.txt is new and optional (as S7's "Not added yet").
    if (probe.status !== 200) {
      return scored(0, "Not published", `/llms.txt returns ${probe.status}. Generate one in the Files tab.`, { status: "warning", fixSuggestion });
    }
    if (!text || mediaType(probe.contentType) === "text/html" || text.trimStart().startsWith("<")) {
      return scored(0, "Not published", "/llms.txt returns a web page, not a text file.", { status: "warning", fixSuggestion });
    }
    const lines = text.split(/\r?\n/);
    const firstLine = lines.find((l) => l.trim()) ?? "";
    const parts = {
      title: /^#\s+\S/.test(firstLine),
      summary: lines.some((l) => /^>\s*\S/.test(l)),
      links: /^\s*[-*]\s*\[[^\]]+\]\([^)]+\)/m.test(text),
      whenToUse: /^#{2,3}\s.*when (to use|should)/im.test(text),
    };
    const credit = (parts.title ? 0.5 : 0) + (parts.summary ? 0.15 : 0) + (parts.links ? 0.15 : 0) + (parts.whenToUse ? 0.2 : 0);
    const missing = [
      !parts.title && "a # title on the first line",
      !parts.summary && "a > summary line",
      !parts.links && "lists of links to your pages",
      !parts.whenToUse && 'a "When to use this site" section',
    ].filter((m): m is string => Boolean(m));
    return scored(
      credit,
      "Published",
      missing.length === 0 ? 'Published, with a summary, links and a "When to use this site" section.' : `Published, but missing ${listText(missing)}.`,
      { fixSuggestion: missing.length > 0 ? "The generator in the Files tab writes every part." : "" },
    );
  },
};

const DISCOVERY_RELS = new Set(["describedby", "sitemap", "service-desc", "service-doc", "api-catalog", "agent-skills", "llms-txt"]);

/** The entries of an RFC 8288 Link header. */
export function parseLinkHeader(header: string): Array<{ url: string; rel: string[]; type: string | null }> {
  return [...header.matchAll(/<([^>]*)>([^,<]*)/g)].map((m) => {
    const params = m[2];
    const rel = /rel\s*=\s*"?([^";]+)"?/i.exec(params)?.[1].trim().toLowerCase().split(/\s+/) ?? [];
    const type = /type\s*=\s*"?([^";]+)"?/i.exec(params)?.[1].trim().toLowerCase() ?? null;
    return { url: m[1], rel, type };
  });
}

/** S10 — RFC 8288 Link headers on the home page that point agents to discovery files. */
export const linkHeaders: CheckDef<SiteContext> = {
  id: "read.link-headers",
  ref: "S10",
  title: "Discovery links in HTTP headers",
  why: "Link headers point agents to your llms.txt, sitemap or Markdown before they read a single page.",
  category: "read",
  tier: "bonus",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    if (access.home.probe.status === null) return notChecked("Couldn't check", "The home page didn't respond.");
    const fixSuggestion = 'Add a Link header to the home page, e.g. Link: </llms.txt>; rel="describedby", </sitemap.xml>; rel="sitemap".';
    const header = access.home.linkHeader;
    if (!header) return scored(0, "None", "The home page sends no Link header.", { status: "info", fixSuggestion });
    const entries = parseLinkHeader(header);
    const useful = entries.filter(
      (e) =>
        e.rel.some((r) => DISCOVERY_RELS.has(r)) ||
        (e.rel.includes("alternate") && e.type === "text/markdown") ||
        /llms\.txt|sitemap/i.test(e.url),
    );
    const details = entries.map((e) => `<${e.url}> rel=${e.rel.join(" ") || "(none)"}`);
    if (useful.length === 0) {
      return scored(0, "None for agents", "The home page sends Link headers, but none points agents to llms.txt, the sitemap or a Markdown version.", {
        status: "info",
        fixSuggestion,
        details,
      });
    }
    return scored(1, `${useful.length} discovery ${useful.length === 1 ? "link" : "links"}`, `Link headers point agents to ${listText(useful.map((e) => e.url))}.`, { details });
  },
};

// ── Agent and commerce protocols (well-known discovery files) ────────────────

const found = (evidence: WellKnownEvidence[], ...ids: WellKnownId[]) => evidence.filter((w) => ids.includes(w.id) && w.json);

/** Every well-known request failed (not a 404: no response at all). */
const allFailed = (evidence: WellKnownEvidence[], ids: WellKnownId[]) =>
  evidence.filter((w) => ids.includes(w.id)).every((w) => w.probe.status === null);

const AGENT_PROTOCOLS: Array<{ label: string; ids: WellKnownId[] }> = [
  { label: "MCP server card", ids: ["mcp-server-card", "mcp-json"] },
  { label: "A2A agent card", ids: ["a2a-agent-card", "a2a-agent-legacy"] },
  { label: "Agent skills index", ids: ["agent-skills"] },
  { label: "API catalog", ids: ["api-catalog"] },
  { label: "OAuth discovery", ids: ["oauth-protected-resource", "oauth-authorization-server"] },
];

/** S11 — agent protocols published by an app or API. App/API site type only. */
export const agentProtocols: CheckDef<SiteContext> = {
  id: "read.agent-protocols",
  ref: "S11",
  title: "Agent protocols published",
  why: "MCP, A2A and the other discovery files let agents use your product directly, not only read about it.",
  category: "read",
  tier: "bonus",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access, siteType }) {
    if (siteType !== "app") return notApplicable("Not applicable", "Only for App or API sites. Change the site type to include it.");
    if (!access) return notScanned();
    const ids = AGENT_PROTOCOLS.flatMap((p) => p.ids);
    if (allFailed(access.wellKnown, ids)) return notChecked("Couldn't check", "The /.well-known/ files didn't respond.");
    const results = [
      ...AGENT_PROTOCOLS.map((p) => {
        const hit = found(access.wellKnown, ...p.ids)[0];
        return { label: p.label, ok: Boolean(hit), where: hit?.path ?? p.ids.map((id) => access.wellKnown.find((w) => w.id === id)?.path).join(" or ") };
      }),
      { label: "WebMCP", ok: access.home.webMcp, where: "navigator.modelContext in the home page's inline scripts" },
    ];
    const ok = results.filter((r) => r.ok);
    const details = results.map((r) => `${r.label}: ${r.ok ? "found" : "not found"} (${r.where})`);
    if (ok.length === 0) {
      return scored(0, "None found", "None of the agent protocols was found.", {
        status: "info",
        fixSuggestion: "Publish the discovery files for the protocols your product supports, starting with an MCP server card or an A2A agent card.",
        details,
      });
    }
    return scored(Math.min(1, ok.length / 2), `${ok.length} found`, `Found: ${listText(ok.map((r) => r.label))}.`, { details });
  },
};

const COMMERCE_PROTOCOLS: Array<{ label: string; id: WellKnownId; test: (w: WellKnownEvidence) => boolean }> = [
  { label: "UCP business profile", id: "ucp", test: (w) => w.json },
  { label: "ACP discovery document", id: "acp", test: (w) => w.json },
  { label: "MPP payment discovery", id: "openapi", test: (w) => w.json && w.paymentInfo },
];

/** S12 — agentic checkout protocols. Commerce site type only. */
export const commerceProtocols: CheckDef<SiteContext> = {
  id: "read.commerce-protocols",
  ref: "S12",
  title: "Agentic checkout protocols",
  why: "Checkout protocols let AI agents buy from you on a user's behalf.",
  category: "read",
  tier: "bonus",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access, siteType }) {
    if (siteType !== "commerce") return notApplicable("Not applicable", "Only for Commerce sites. Change the site type to include it.");
    if (!access) return notScanned();
    if (allFailed(access.wellKnown, COMMERCE_PROTOCOLS.map((p) => p.id))) return notChecked("Couldn't check", "The discovery files didn't respond.");
    const results = COMMERCE_PROTOCOLS.map((p) => {
      const w = access.wellKnown.find((e) => e.id === p.id);
      return { label: p.label, ok: Boolean(w && p.test(w)), where: w?.path ?? "" };
    });
    const ok = results.filter((r) => r.ok);
    const details = [
      ...results.map((r) => `${r.label}: ${r.ok ? "found" : "not found"} (${r.where})`),
      "x402: can't be detected from outside; it answers HTTP 402 on a paid request.",
    ];
    if (ok.length === 0) {
      return scored(0, "None found", "None of the checkout protocols was found (UCP, ACP, MPP).", {
        status: "info",
        fixSuggestion: "If you sell online, ask your commerce platform which agentic checkout protocols it supports (UCP, ACP) and publish its discovery file.",
        details,
      });
    }
    return scored(1, `${ok.length} found`, `Found: ${listText(ok.map((r) => r.label))}.`, { details });
  },
};
