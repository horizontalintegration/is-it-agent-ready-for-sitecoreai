// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: can each engine cite this page? (plan section 8). Instant, free and
// deterministic: no AI call, only the bot rows S1 and S2 grade (the Agent
// access tab's grid) and the page's own score.
//
// An engine needs its search agent (to find and cite the page) and its user
// agent (to open it when someone asks). Training agents don't matter here.
//   Blocked  both can't read the site, or the page is noindex / nosnippet
//   Limited  one of them can't, or the page's content needs JavaScript (P3),
//            or the page scores Not ready
// Missing Markdown alone doesn't limit an engine: they cite HTML pages.
//   Ready    otherwise
// Gemini and Copilot have no search agent we can request as: Gemini follows
// the Google-Extended robots.txt token, Copilot relies on Bing's index.
// ─────────────────────────────────────────────────────────────────────────────

import type { BotRow } from "@/lib/agent-access/grid";
import type { PageScoreSummary } from "@/lib/checks/view-model";
import { LABEL_TEXT } from "@/lib/score-thresholds";
import type { CitationEngine, EngineEstimate, Readiness } from "./types";


const AGENT_ENGINES: Record<"chatgpt" | "claude" | "perplexity", { company: string; search: string; user: string }> = {
  chatgpt: { company: "OpenAI", search: "OAI-SearchBot", user: "ChatGPT-User" },
  claude: { company: "Anthropic", search: "Claude-SearchBot", user: "Claude-User" },
  perplexity: { company: "Perplexity", search: "PerplexityBot", user: "Perplexity-User" },
};

export const ENGINES: CitationEngine[] = ["chatgpt", "claude", "perplexity", "gemini", "copilot"];

type Access = "can-read" | "blocked" | "unknown";

function access(row: BotRow | undefined): Access {
  if (!row) return "unknown";
  if (row.outcome === "can-read") return "can-read";
  if (row.outcome === "blocked" || row.outcome === "challenge" || row.outcome === "robots") return "blocked";
  return "unknown";
}

/** "is blocked by robots.txt", "gets 403 from the firewall", … */
function blockedText(row: BotRow): string {
  if (row.outcome === "robots") return "is blocked by robots.txt";
  if (row.outcome === "challenge") return "gets a challenge page from the firewall";
  return row.failStatus ? `gets ${row.failStatus} from the firewall` : "is blocked by the firewall";
}

function agentEstimate(engine: keyof typeof AGENT_ENGINES, rows: BotRow[]): { readiness: Readiness; reasons: string[] } {
  const { company, search, user } = AGENT_ENGINES[engine];
  const searchRow = rows.find((r) => r.bot.name === search);
  const userRow = rows.find((r) => r.bot.name === user);
  const s = access(searchRow);
  const u = access(userRow);
  if (s === "blocked" && u === "blocked") {
    return { readiness: "blocked", reasons: [`${search} ${blockedText(searchRow!)}, and ${user} ${blockedText(userRow!)}.`] };
  }
  if (s === "blocked") {
    return { readiness: "limited", reasons: [`${search} ${blockedText(searchRow!)}, so ${company}'s search can't find the page.`] };
  }
  if (u === "blocked") {
    return { readiness: "limited", reasons: [`The search crawler can read it, but ${user} ${blockedText(userRow!)}.`] };
  }
  if (s === "unknown" || u === "unknown") {
    return { readiness: "unknown", reasons: [`We couldn't check ${s === "unknown" ? search : user}.`] };
  }
  return { readiness: "ready", reasons: [`All ${company} agents that find and open pages can read it.`] };
}

function geminiEstimate(rows: BotRow[]): { readiness: Readiness; reasons: string[] } {
  const row = rows.find((r) => r.bot.name === "Google-Extended");
  if (row?.robots === "disallowed") {
    return {
      readiness: "limited",
      reasons: ["Google-Extended is disallowed in robots.txt, so Gemini won't use the page to ground its answers. Google Search's AI features still can."],
    };
  }
  return { readiness: "ready", reasons: ["Google-Extended is allowed. Gemini also relies on Google Search's index."] };
}

export interface ReadinessInput {
  /** botGrid(access); null while the agent-access scan is loading. */
  rows: BotRow[] | null;
  /** The page's score summary; null when no page is picked or it isn't scanned. */
  page: PageScoreSummary | null;
}

/** Why a reachable page is still a weak candidate for citing, if it is. */
function pageLimit(page: PageScoreSummary): string | null {
  if (page.issues.some((i) => i.id === "read.no-js-content" && i.status === "fail")) {
    return "Agents can reach it, but most of its content needs JavaScript, which AI crawlers don't run.";
  }
  if (page.label === "not-ready" && page.score !== null) {
    return `Agents can reach it, but the page scores ${page.score}/100 (${LABEL_TEXT["not-ready"]}), so engines are likely to prefer clearer sources.`;
  }
  return null;
}

export function engineEstimates({ rows, page }: ReadinessInput): EngineEstimate[] {
  return ENGINES.map((engine): EngineEstimate => {
    if (page?.blocked) {
      return { engine, readiness: "blocked", reasons: [page.gateReason || "The page asks not to be indexed or quoted."] };
    }
    let base: { readiness: Readiness; reasons: string[] };
    if (engine === "copilot") {
      base = page
        ? { readiness: "ready", reasons: ["Relies on Bing's index. The page is indexable."] }
        : { readiness: "ready", reasons: ["Relies on Bing's index. Pick a scanned page to check it's indexable."] };
    } else if (!rows) {
      base = { readiness: "unknown", reasons: ["Checking which AI agents can get in…"] };
    } else if (engine === "gemini") {
      base = geminiEstimate(rows);
    } else {
      base = agentEstimate(engine, rows);
    }
    const limit = page ? pageLimit(page) : null;
    if (base.readiness === "ready" && limit) return { engine, readiness: "limited", reasons: [limit] };
    return { engine, ...base };
  });
}
