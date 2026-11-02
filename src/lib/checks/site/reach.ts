// Site checks — Reach (S1, S2, S4, S8, S9). They grade the evidence from
// /api/agent-access (src/lib/server/agent-access.ts).

import { BOTS, isAnswerBot, PURPOSE_TEXT } from "@/lib/agent-access/bots";
import { botGrid, readRobots, robotsVerdict, ROBOTS_TEXT, type BotRow } from "@/lib/agent-access/grid";
import { contentSignals } from "@/lib/agent-access/robots";
import { notChecked, scored } from "../result";
import type { CheckDef, SiteContext } from "../types";
import { listText, notScanned } from "./shared";

const is = (n: number) => (n === 1 ? "is" : "are");
const gets = (n: number) => (n === 1 ? "gets" : "get");

/** Said wherever a live bot result is shown: we can't send requests from the AI companies' networks. */
export const SPOOF_CAVEAT =
  "We send these requests from our server, not from each AI company's network. A firewall that verifies bots by IP address may treat the real agents differently.";

function blockedSentence(rows: BotRow[]): string {
  const byStatus = new Map<string, string[]>();
  for (const r of rows.filter((r) => r.outcome === "blocked")) {
    const key = r.failStatus !== null ? String(r.failStatus) : "an error";
    byStatus.set(key, [...(byStatus.get(key) ?? []), r.bot.name]);
  }
  const parts = [...byStatus].map(([status, names]) =>
    status === "an error" ? `${listText(names)} ${gets(names.length)} an error` : `${listText(names)} ${gets(names.length)} HTTP ${status}`,
  );
  return parts.length > 0 ? `${listText(parts)} from your firewall.` : "";
}

/** S1 — live requests as each agent, compared with a browser. Catches firewall and CDN blocks robots.txt doesn't show. */
export const aiBotAccess: CheckDef<SiteContext> = {
  id: "reach.ai-bot-access",
  ref: "S1",
  title: "AI agents can open your site",
  why: "A firewall or CDN that blocks AI agents keeps your pages out of AI answers, whatever robots.txt says.",
  category: "reach",
  tier: "essential",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const home = access.home.probe;
    if (home.status === null || home.status >= 400) {
      return notChecked("Couldn't check", `The home page didn't load for a browser either (${home.status ?? home.error}), so there's nothing to compare with.`);
    }
    const rows = botGrid(access);
    const tested = rows.filter((r) => isAnswerBot(r.bot) && ["can-read", "blocked", "challenge"].includes(r.outcome));
    if (tested.length === 0) {
      const robotsOnly = rows.filter((r) => isAnswerBot(r.bot)).every((r) => r.outcome === "robots");
      return notChecked(
        "Couldn't check",
        robotsOnly
          ? "robots.txt asks every search and user agent to stay out, so we didn't request your pages as them. Fix robots.txt first (see the robots.txt check)."
          : "None of the search or user agents could be requested.",
      );
    }

    const canRead = tested.filter((r) => r.outcome === "can-read");
    const challenged = tested.filter((r) => r.outcome === "challenge").map((r) => r.bot.name);
    const training = rows.filter((r) => !isAnswerBot(r.bot) && (r.outcome === "blocked" || r.outcome === "challenge")).map((r) => r.bot.name);
    const trainingNote = training.length > 0
      ? ` ${listText(training)} (training) ${is(training.length)} blocked too, which is your choice and doesn't lower the score.`
      : "";
    const details = [...rows.map((r) => `${r.bot.name} (${PURPOSE_TEXT[r.bot.purpose]}): ${r.live}, ${r.result.toLowerCase()}`), SPOOF_CAVEAT];

    if (canRead.length === tested.length) {
      return scored(1, `${tested.length} of ${tested.length} search and user agents can read`, `Every search and user agent we tried gets your pages, as a browser does.${trainingNote}`, { details });
    }
    const message = [
      blockedSentence(tested),
      challenged.length > 0 ? `${listText(challenged)} ${gets(challenged.length)} a challenge page instead of your content.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return scored(canRead.length / tested.length, `${canRead.length} of ${tested.length} search and user agents can read`, `${message}${trainingNote}`, {
      status: "fail",
      fixSuggestion:
        "Allow these agents in your firewall or CDN bot rules. OpenAI, Anthropic and Perplexity publish the IP ranges their agents use, so the rule can be specific.",
      details,
    });
  },
};

/** S2 — robots.txt rules by purpose: blocking search or user agents fails; blocking only training agents is a choice. */
export const robotsAiRules: CheckDef<SiteContext> = {
  id: "reach.robots-ai-rules",
  ref: "S2",
  title: "robots.txt lets AI search in",
  why: "A Disallow for an AI search or user agent keeps your pages out of that assistant's answers.",
  category: "reach",
  tier: "essential",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const robots = readRobots(access);
    if (robots.state === "unreadable") return notChecked("Couldn't check", "robots.txt didn't respond.");
    if (robots.state === "server-error") {
      return scored(0, `HTTP ${access.robots.probe.status}`, `robots.txt returns HTTP ${access.robots.probe.status}. Crawlers treat that as "keep out" for the whole site.`, {
        fixSuggestion: "Make /robots.txt return 200 (or 404 if you have no rules).",
      });
    }
    const verdicts = BOTS.map((bot) => ({ bot, verdict: robotsVerdict(robots, bot.name) }));
    const details = verdicts.map(({ bot, verdict }) => `${bot.name} (${PURPOSE_TEXT[bot.purpose]}): ${ROBOTS_TEXT[verdict]}`);
    if (robots.state === "no-file") {
      return scored(1, "No robots.txt", "There's no robots.txt, so every AI agent is allowed.", { details });
    }
    const answer = verdicts.filter((v) => isAnswerBot(v.bot));
    const blocked = answer.filter((v) => v.verdict === "disallowed").map((v) => v.bot.name);
    const training = verdicts.filter((v) => !isAnswerBot(v.bot) && v.verdict === "disallowed").map((v) => v.bot.name);
    const trainingNote = training.length > 0
      ? ` ${listText(training)} (training) ${is(training.length)} disallowed, which is your choice and doesn't lower the score.`
      : "";
    if (blocked.length === 0) {
      return scored(1, "Search and user agents allowed", `Search and user agents are allowed.${trainingNote}`, { details });
    }
    return scored((answer.length - blocked.length) / answer.length, `${blocked.length} of ${answer.length} search and user agents blocked`, `robots.txt blocks ${listText(blocked)}.${trainingNote}`, {
      status: "fail",
      fixSuggestion: "Allow the AI search and user agents in robots.txt. The robots.txt helper in the Files tab writes the lines.",
      details,
    });
  },
};

/** S4 — the sitemap: published, valid XML, with lastmod, and listed in robots.txt. */
export const sitemap: CheckDef<SiteContext> = {
  id: "reach.sitemap",
  ref: "S4",
  title: "Sitemap is published and linked",
  why: "A sitemap with lastmod dates tells AI crawlers which pages exist and which changed.",
  category: "reach",
  tier: "recommended",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const s = access.sitemap;
    if (!s || s.probe.status === null) return notChecked("Couldn't check", `The sitemap didn't respond${s?.probe.error ? ` (${s.probe.error})` : ""}.`);
    const where = s.source === "robots" ? "The sitemap listed in robots.txt" : "/sitemap.xml";
    if (s.probe.status !== 200) {
      return scored(0, `HTTP ${s.probe.status}`, `${where} returns HTTP ${s.probe.status}.`, {
        fixSuggestion: "Publish a sitemap at /sitemap.xml and add a Sitemap: line to robots.txt.",
      });
    }
    if (!s.kind) {
      return scored(0, "Not a sitemap", `${where} isn't sitemap XML.`, { fixSuggestion: "Serve a valid XML sitemap (a <urlset> or a <sitemapindex>)." });
    }
    const listed = s.source === "robots";
    const share = s.urlCount > 0 ? s.lastmodCount / s.urlCount : 0;
    const credit = 0.5 + (share >= 0.8 ? 0.25 : share > 0 ? 0.125 : 0) + (listed ? 0.25 : 0);
    const lastmod = s.urlCount === 0 ? "" : share >= 1 ? "all with lastmod" : s.lastmodCount === 0 ? "none with lastmod" : `${s.lastmodCount} with lastmod`;
    const count = s.kind === "sitemapindex"
      ? s.child?.status === 200
        ? `A sitemap index of ${s.childCount} sitemaps; the first has ${s.urlCount} URLs${lastmod ? `, ${lastmod}` : ""}.`
        : `A sitemap index of ${s.childCount} sitemaps (the first couldn't be read).`
      : `${s.urlCount} URLs${lastmod ? `, ${lastmod}` : ""}.`;
    const fixes = [
      share < 0.8 && s.urlCount > 0 ? "Add <lastmod> to every URL." : "",
      listed ? "" : "Add a Sitemap: line to robots.txt.",
    ].filter(Boolean);
    return scored(credit, `${s.urlCount} URLs`, `${count} ${listed ? "Listed in robots.txt." : "Not listed in robots.txt."}`, {
      fixSuggestion: fixes.join(" "),
    });
  },
};

/** S8 — a page that can't exist must return 404, not a soft 404. */
export const notFound: CheckDef<SiteContext> = {
  id: "reach.not-found",
  ref: "S8",
  title: "Missing pages return a real 404",
  why: "When a missing page answers 200, agents can store your error page as content.",
  category: "reach",
  tier: "recommended",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const p = access.notFound;
    if (p.status === null) return notChecked("Couldn't check", `The test URL didn't respond (${p.error}).`);
    if (p.status === 404 || p.status === 410) return scored(1, `HTTP ${p.status}`, `A random URL returned ${p.status}.`);
    const toHome = p.finalUrl !== null && new URL(p.finalUrl).pathname === "/";
    const message = p.status === 200
      ? toHome
        ? "A random URL redirects to the home page instead of returning 404 (a soft 404)."
        : "A random URL returns 200 (a soft 404), so agents may store your error page as content."
      : `A random URL returned ${p.status}, not 404.`;
    return scored(0, `HTTP ${p.status}`, message, { fixSuggestion: "Make unknown URLs return HTTP 404 with your not-found page." });
  },
};

/** S9 — Content-Signal lines in robots.txt (contentsignals.org). Bonus: missing never lowers the score. */
export const contentSignalsCheck: CheckDef<SiteContext> = {
  id: "reach.content-signals",
  ref: "S9",
  title: "Content-use signals are declared",
  why: "A Content-Signal line says, in a machine-readable way, whether AI may use your content for search, answers or training.",
  category: "reach",
  tier: "bonus",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    const robots = readRobots(access);
    if (robots.state === "unreadable" || robots.state === "server-error") return notChecked("Couldn't check", "robots.txt couldn't be read.");
    const signals = robots.parsed ? contentSignals(robots.parsed) : [];
    if (signals.length === 0) {
      return scored(0, "Not set", "No Content-Signal line in robots.txt.", {
        status: "info",
        fixSuggestion: "Add a Content-Signal line. The robots.txt helper in the Files tab writes it.",
      });
    }
    return scored(1, "Declared", `robots.txt declares: ${signals.map((s) => s.value).join("; ")}.`, {
      details: signals.map((s) => `User-agent ${s.agents.join(", ")}: ${s.value}`),
    });
  },
};

