// ─────────────────────────────────────────────────────────────────────────────
// robots.txt parsing and matching (RFC 9309). Shared by the agent-access route
// (which skips live requests robots.txt asks a bot not to make), the site
// checks S2 and S9, and the Files tab's robots.txt helper.
//
// - A group is one or more User-agent lines followed by rules.
// - A bot obeys every group naming its product token (case-insensitive),
//   merged; only when none names it does it obey the `*` groups.
// - The longest matching rule wins; on a tie, Allow wins. `*` and `$` work as
//   in the RFC. An empty Disallow is no rule.
// - Sitemap lines aren't tied to a group. Content-Signal lines
//   (contentsignals.org) belong to the group they're in.
// ─────────────────────────────────────────────────────────────────────────────

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  /** Lower-cased product tokens, `*` included. */
  agents: string[];
  rules: RobotsRule[];
  /** Raw Content-Signal values in this group, e.g. "search=yes, ai-train=no". */
  contentSignals: string[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  // True while User-agent lines are still being collected for `current`.
  let collectingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [], contentSignals: [] };
        groups.push(current);
        collectingAgents = true;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    collectingAgents = false;
    if (!current) {
      // Rules before any User-agent line apply to no one (RFC 9309), but a
      // Content-Signal there is meant for everyone.
      if (key !== "content-signal") continue;
      current = { agents: ["*"], rules: [], contentSignals: [] };
      groups.push(current);
    }
    if (key === "allow" || key === "disallow") {
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "content-signal") {
      if (value) current.contentSignals.push(value);
    }
  }
  return { groups, sitemaps };
}

/** True when a User-agent value names this product token ("GPTBot" or "GPTBot/1.1"). */
function namesToken(agent: string, token: string): boolean {
  return agent === token || agent.startsWith(`${token}/`);
}

/** The groups a bot obeys: those naming it, otherwise the `*` groups. */
export function groupsFor(robots: ParsedRobots, token: string): RobotsGroup[] {
  const t = token.toLowerCase();
  const named = robots.groups.filter((g) => g.agents.some((a) => namesToken(a, t)));
  return named.length > 0 ? named : robots.groups.filter((g) => g.agents.includes("*"));
}

/** True when the bot is named in a group of its own (not only covered by `*`). */
export function isNamed(robots: ParsedRobots, token: string): boolean {
  const t = token.toLowerCase();
  return robots.groups.some((g) => g.agents.some((a) => namesToken(a, t)));
}

function patternRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Whether robots.txt lets this bot fetch the path (e.g. "/"). */
export function isAllowed(robots: ParsedRobots, token: string, path: string): boolean {
  let best: RobotsRule | null = null;
  for (const group of groupsFor(robots, token)) {
    for (const rule of group.rules) {
      if (!patternRegex(rule.path).test(path)) continue;
      if (
        !best ||
        rule.path.length > best.path.length ||
        (rule.path.length === best.path.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
  }
  return best === null || best.allow;
}

/** Every Content-Signal line, with the agents it applies to. */
export function contentSignals(robots: ParsedRobots): Array<{ agents: string[]; value: string }> {
  return robots.groups.flatMap((g) => g.contentSignals.map((value) => ({ agents: g.agents, value })));
}

/** "search=yes, ai-train=no" → { search: "yes", "ai-train": "no" }. */
export function parseContentSignal(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim().toLowerCase());
    if (k && v) out[k] = v;
  }
  return out;
}
