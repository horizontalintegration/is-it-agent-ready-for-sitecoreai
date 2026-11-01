// Site checks — Reach.

import { notChecked, scored } from "../result";
import type { CheckDef, SiteContext } from "../types";

/**
 * S2 — the dashboard's robots.txt crawler check, moved as it was (6 named
 * bots, from /api/robots-check). Phase 6 replaces it with bot groups by
 * purpose (search / user-fetch / training).
 */
export const robotsAiRules: CheckDef<SiteContext> = {
  id: "reach.robots-ai-rules",
  ref: "S2",
  title: "robots.txt lets AI search in",
  why: "A Disallow for an AI crawler keeps your pages out of that assistant's answers.",
  category: "reach",
  tier: "essential",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ robotsTxt }) {
    if (!robotsTxt) return notChecked("Not yet checked", "robots.txt hasn't been fetched yet, or couldn't be.");

    const bots: Array<[string, string]> = [
      ["Google-Extended", robotsTxt.googleExtended],
      ["GPTBot", robotsTxt.gptBot],
      ["ClaudeBot", robotsTxt.claudeBot],
      ["PerplexityBot", robotsTxt.perplexityBot],
      ["Amazonbot", robotsTxt.amazonBot],
      ["Applebot-Extended", robotsTxt.appleBotExtended],
    ];
    const blocked = bots.filter(([, p]) => p === "blocked");
    const credit = blocked.length === 0 ? 1 : blocked.length <= 2 ? 0.5 : 0;

    return scored(
      credit,
      `${bots.length - blocked.length} of ${bots.length} AI crawlers allowed`,
      blocked.length === 0
        ? "robots.txt doesn't block any of the named AI crawlers."
        : `robots.txt blocks ${blocked.map(([name]) => name).join(", ")}.`,
      {
        fixSuggestion: blocked.length === 0 ? "" : "Allow the AI crawlers you want answers from. The Robots.txt tab generates the rules.",
        details: bots.map(([name, p]) => `${name}: ${p}`),
      },
    );
  },
};

export const REACH_SITE_CHECKS = [robotsAiRules];
