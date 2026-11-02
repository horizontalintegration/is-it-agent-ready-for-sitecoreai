// ─────────────────────────────────────────────────────────────────────────────
// The bot × status grid (plan section 6.4, Agent access): one row per agent,
// with what robots.txt says and what a live request as that agent got,
// compared with a browser. S1 and S2 grade the same rows the dashboard shows.
// ─────────────────────────────────────────────────────────────────────────────

import { BOTS, isAnswerBot, type Bot } from "./bots";
import { isAllowed, parseRobots, type ParsedRobots } from "./robots";
import type { AgentAccessData, PageProbe } from "./types";

/** What robots.txt means for a bot's access to the home page. */
export type RobotsVerdict = "allowed" | "disallowed" | "no-file" | "unreadable";

export type BotOutcome =
  | "can-read"
  | "blocked" // 4xx/5xx where a browser gets the page
  | "challenge" // a challenge page, or a page far smaller than the browser's
  | "error" // the request failed or timed out
  | "robots" // not requested: robots.txt asks it to stay out
  | "token-only" // a robots.txt token with no crawler of its own
  | "not-checked"; // the browser couldn't load the page either, so there's nothing to compare

export interface BotRow {
  bot: Bot;
  robots: RobotsVerdict;
  /** The "Live request" column: "200", "403", "200 · 403 on /about", "Not requested", … */
  live: string;
  outcome: BotOutcome;
  /** The "Result" column. */
  result: string;
  /** pass / fix, or info for a legitimate choice, or not-checked. */
  status: "pass" | "fix" | "info" | "not-checked";
  /** The worst HTTP status seen, e.g. 403. Null when none was worse than the browser's. */
  failStatus: number | null;
}

export const ROBOTS_TEXT: Record<RobotsVerdict, string> = {
  allowed: "Allowed",
  disallowed: "Disallowed",
  "no-file": "No robots.txt",
  unreadable: "Couldn't read",
};

/** robots.txt parsed, or why it couldn't be: a 4xx means "no rules" (RFC 9309). */
export function readRobots(access: AgentAccessData): { parsed: ParsedRobots | null; state: "ok" | "no-file" | "server-error" | "unreadable" } {
  const { probe, text } = access.robots;
  if (probe.status === 200 && text !== null) return { parsed: parseRobots(text), state: "ok" };
  if (probe.status !== null && probe.status >= 400 && probe.status < 500) return { parsed: null, state: "no-file" };
  if (probe.status !== null && probe.status >= 500) return { parsed: null, state: "server-error" };
  return { parsed: null, state: "unreadable" };
}

export function robotsVerdict(robots: ReturnType<typeof readRobots>, token: string): RobotsVerdict {
  if (robots.parsed) return isAllowed(robots.parsed, token, "/") ? "allowed" : "disallowed";
  return robots.state === "no-file" ? "no-file" : "unreadable";
}

type PageOutcome = "ok" | "blocked" | "challenge" | "error" | "no-baseline";

// A bot page under this share of the browser's size is treated as a stub or challenge page.
const STUB_RATIO = 0.2;
const MIN_COMPARABLE_BYTES = 5_000;

function comparePage(bot: PageProbe, browser: PageProbe): PageOutcome {
  if (browser.status === null || browser.status >= 400) return "no-baseline";
  if (bot.status === null) return "error";
  if (bot.status >= 400) return "blocked";
  if (bot.challenge && !browser.challenge) return "challenge";
  if (browser.bytes >= MIN_COMPARABLE_BYTES && bot.bytes < browser.bytes * STUB_RATIO) return "challenge";
  return "ok";
}

const RANK: PageOutcome[] = ["blocked", "challenge", "error", "ok", "no-baseline"];

export function botGrid(access: AgentAccessData): BotRow[] {
  const robots = readRobots(access);
  return BOTS.map((bot): BotRow => {
    const verdict = robotsVerdict(robots, bot.name);
    const answer = isAnswerBot(bot);
    const entry = access.bots.find((b) => b.name === bot.name);
    const base = { bot, robots: verdict, failStatus: null };

    if (!entry || entry.skipped === "token-only") {
      return verdict === "disallowed"
        ? { ...base, live: "robots.txt rule only", outcome: "token-only", result: "Opted out (your choice)", status: "info" }
        : { ...base, live: "robots.txt rule only", outcome: "token-only", result: "No separate crawler", status: "info" };
    }
    if (entry.skipped === "robots") {
      return answer
        ? { ...base, live: "Not requested", outcome: "robots", result: "Blocked by robots.txt", status: "fix" }
        : { ...base, live: "Not requested", outcome: "robots", result: "Opted out (your choice)", status: "info" };
    }

    const pages = entry.results.map((probe, i) => ({
      probe,
      path: access.pages[i]?.path ?? "/",
      outcome: access.pages[i] ? comparePage(probe, access.pages[i].browser) : ("no-baseline" as const),
    }));
    const worst = [...pages].sort((a, b) => RANK.indexOf(a.outcome) - RANK.indexOf(b.outcome))[0];
    const home = pages[0];
    const label = ({ probe, outcome }: { probe: PageProbe; outcome: PageOutcome }) =>
      outcome === "challenge"
        ? "Challenge page"
        : probe.status !== null
          ? String(probe.status)
          : probe.error === "timeout" || probe.error === "deadline"
            ? "Timed out"
            : "No response";
    let live = home ? label(home) : "—";
    if (worst && home && worst !== home && worst.outcome !== "ok" && worst.outcome !== "no-baseline" && worst.outcome !== home.outcome) {
      live += ` · ${label(worst)} on ${worst.path}`;
    }
    const failStatus = worst && (worst.outcome === "blocked" || worst.outcome === "challenge") ? worst.probe.status : null;

    switch (worst?.outcome) {
      case "ok":
        return { ...base, live, outcome: "can-read", result: "Can read", status: "pass" };
      case "blocked":
        return { ...base, live, failStatus, outcome: "blocked", result: answer ? "Blocked by firewall" : "Blocked by firewall (your choice)", status: answer ? "fix" : "info" };
      case "challenge":
        return { ...base, live, failStatus, outcome: "challenge", result: answer ? "Gets a challenge page" : "Gets a challenge page (your choice)", status: answer ? "fix" : "info" };
      case "error":
        return { ...base, live, outcome: "error", result: "Couldn't check", status: "not-checked" };
      default:
        return { ...base, live, outcome: "not-checked", result: "Couldn't compare: the page didn't load for a browser either", status: "not-checked" };
    }
  });
}
