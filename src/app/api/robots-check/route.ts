import { NextRequest, NextResponse } from "next/server";
import { safeFetch, SafeFetchError } from "@/lib/server/safe-fetch";
import type { CrawlerPermission, RobotsTxt } from "@/lib/rule-engine/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TARGET_AGENTS = [
  { key: "googleExtended", agent: "google-extended" },
  { key: "gptBot", agent: "gptbot" },
  { key: "claudeBot", agent: "claudebot" },
  { key: "perplexityBot", agent: "perplexitybot" },
  { key: "amazonBot", agent: "amazonbot" },
  { key: "appleBotExtended", agent: "applebot-extended" },
] as const;

function evaluatePermission(disallows: string[]): CrawlerPermission {
  if (disallows.some((d) => d === "/" || d === "*")) return "blocked";
  // Empty or missing Disallow means the agent is explicitly allowed
  return "allowed";
}

function parseRobotsTxt(body: string): RobotsTxt {
  const lines = body.split(/\r?\n/);

  const blocks: { agents: string[]; disallows: string[] }[] = [];
  let currentAgents: string[] = [];
  let currentDisallows: string[] = [];
  let inAgentBlock = false;

  const pushBlock = () => {
    if (currentAgents.length > 0) {
      blocks.push({ agents: currentAgents, disallows: currentDisallows });
    }
    currentAgents = [];
    currentDisallows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === "user-agent") {
      if (!inAgentBlock) {
        pushBlock();
        inAgentBlock = true;
      }
      currentAgents.push(value.toLowerCase());
    } else {
      inAgentBlock = false;
      if (directive === "disallow") {
        currentDisallows.push(value);
      }
    }
  }
  pushBlock();

  const disallowsFor = (agent: string): string[] => {
    const out: string[] = [];
    for (const b of blocks) {
      if (b.agents.includes(agent)) out.push(...b.disallows);
    }
    return out;
  };

  const wildcardDisallows = disallowsFor("*");
  const mentionedAgents = new Set(blocks.flatMap((b) => b.agents));

  const result: Partial<RobotsTxt> = {};
  for (const { key, agent } of TARGET_AGENTS) {
    if (mentionedAgents.has(agent)) {
      // Agent has an explicit User-agent block — evaluate its own Disallow rules
      result[key] = evaluatePermission(disallowsFor(agent));
    } else if (mentionedAgents.has("*")) {
      // No explicit block but wildcard exists — apply wildcard rules
      result[key] = evaluatePermission(wildcardDisallows);
    } else {
      // Not mentioned anywhere in robots.txt
      result[key] = "unknown";
    }
  }
  return result as RobotsTxt;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "missing_domain" }, { status: 400, headers: CORS_HEADERS });
  }

  const allUnknown: RobotsTxt = {
    googleExtended: "unknown",
    gptBot: "unknown",
    claudeBot: "unknown",
    perplexityBot: "unknown",
    amazonBot: "unknown",
    appleBotExtended: "unknown",
  };

  try {
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const url = `${base.replace(/\/+$/, "")}/robots.txt`;
    const res = await safeFetch(url, { timeoutMs: 5_000, maxBytes: 512 * 1024 });

    if (res.status === 404) {
      return NextResponse.json(allUnknown, { headers: CORS_HEADERS });
    }
    if (!res.ok) {
      return NextResponse.json(allUnknown, { headers: CORS_HEADERS });
    }

    const body = await res.text();
    return NextResponse.json(parseRobotsTxt(body), { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) {
      return NextResponse.json({ error: "blocked_url", detail: err.message }, { status: 400, headers: CORS_HEADERS });
    }
    return NextResponse.json(allUnknown, { headers: CORS_HEADERS });
  }
}
