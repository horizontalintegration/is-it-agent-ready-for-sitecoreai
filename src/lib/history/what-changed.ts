// ─────────────────────────────────────────────────────────────────────────────
// "What changed since last scan" on the Overview (plan section 6.4; replaces
// Scrunch Signals). Compares the last two snapshots of the site's pages and of
// its agent-access scan, plus citation probe runs:
//   - pages whose score dropped (after a publish, when it was published since)
//   - pages that became blocked (noindex / nosnippet)
//   - search and user agents newly blocked, or let back in
//   - pages that became agent-ready
//   - changes in how many probe answers cite a page
// Training agents are left out: blocking them is a legitimate choice.
// ─────────────────────────────────────────────────────────────────────────────

import type { BotOutcome, BotRow } from "@/lib/agent-access/grid";
import { isAnswerBot } from "@/lib/agent-access/bots";
import { PAGE_CHECKS } from "@/lib/checks/registry";
import type { ScoreLabel } from "@/lib/score-thresholds";
import type { PageMatrixRow } from "@/types/dashboard";

/** A drop smaller than this is noise (a re-scan, an AI rating moving a little). */
export const DROP_THRESHOLD = 5;

export interface PageSnap {
  route: string;
  score: number | null;
  label: ScoreLabel | null;
  blocked: boolean;
  /** Checks that need work (warning or fail). */
  issues: string[];
  /** When the page was last published, as of the snapshot. */
  lastModified: string;
}

export interface ScanSnapshot {
  at: string;
  score: number | null;
  /** By page id. Only scanned pages. */
  pages: Record<string, PageSnap>;
}

export interface BotSnap {
  status: BotRow["status"];
  outcome: BotOutcome;
  live: string;
  failStatus: number | null;
}

export interface AccessSnapshot {
  /** The scan's checkedAt: a cached read of the same scan isn't a new snapshot. */
  at: string;
  /** By bot name. Search and user agents only. */
  bots: Record<string, BotSnap>;
}

export function scanSnapshot(pages: PageMatrixRow[], score: number | null, at: string): ScanSnapshot {
  const snap: ScanSnapshot = { at, score, pages: {} };
  for (const p of pages) {
    if (!p.score) continue;
    snap.pages[p.id] = {
      route: p.route,
      score: p.score.score,
      label: p.score.label,
      blocked: p.score.blocked,
      issues: p.score.issues.map((i) => i.id),
      lastModified: p.lastModified,
    };
  }
  return snap;
}

export function accessSnapshot(rows: BotRow[], at: string): AccessSnapshot {
  const bots: AccessSnapshot["bots"] = {};
  for (const r of rows) {
    if (!isAnswerBot(r.bot)) continue;
    bots[r.bot.name] = { status: r.status, outcome: r.outcome, live: r.live, failStatus: r.failStatus };
  }
  return { at, bots };
}

/** A change in a page's cited count, from its last two runs of the same questions. */
export interface CitationChange {
  route: string;
  delta: number;
  at: string;
}

/** Plain text, or text to show in bold. */
export type ChangePart = string | { strong: string };

export interface ChangeItem {
  key: string;
  tone: "down" | "up";
  /** "▼ 18", "New", "▲ 6", "▲" */
  badge: string;
  parts: ChangePart[];
}

export interface WhatChanged {
  items: ChangeItem[];
  /** False until there are two snapshots of either kind (or a citation change) to compare. */
  comparable: boolean;
}

const CHECK_TITLES = new Map(PAGE_CHECKS.map((c) => [c.id, c.title]));
const titleOf = (id: string) => CHECK_TITLES.get(id) ?? id;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function pageChanges(prev: ScanSnapshot, cur: ScanSnapshot): { down: ChangeItem[]; up: ChangeItem[] } {
  const drops: Array<{ item: ChangeItem; size: number }> = [];
  const blocked: ChangeItem[] = [];
  const nowReady: Array<{ id: string; before: PageSnap; after: PageSnap }> = [];

  for (const [id, after] of Object.entries(cur.pages)) {
    const before = prev.pages[id];
    if (!before) continue;
    if (after.blocked && !before.blocked) {
      blocked.push({
        key: `blocked:${id}`,
        tone: "down",
        badge: "New",
        parts: [{ strong: after.route }, " is now noindex or nosnippet, so AI answers can't use it."],
      });
      continue;
    }
    if (before.score === null || after.score === null) continue;
    const change = after.score - before.score;
    if (change <= -DROP_THRESHOLD) {
      const published = Date.parse(after.lastModified) > Date.parse(prev.at);
      const failing = after.issues.filter((i) => !before.issues.includes(i)).map(titleOf);
      const parts: ChangePart[] = [{ strong: after.route }, ` dropped${published ? ` after the ${shortDate(after.lastModified)} publish` : ""}.`];
      if (failing.length > 0) parts.push(` Now needs work: ${listOf(failing.slice(0, 2))}${failing.length > 2 ? ` and ${failing.length - 2} more` : ""}.`);
      drops.push({ item: { key: `drop:${id}`, tone: "down", badge: `▼ ${-change}`, parts }, size: -change });
    }
    if (after.label === "agent-ready" && before.label !== "agent-ready") nowReady.push({ id, before, after });
  }

  const up: ChangeItem[] = [];
  if (nowReady.length > 0) {
    // A check every one of these pages fixed, e.g. "after FAQ structured data was fixed".
    const common = nowReady[0].before.issues.find((i) => nowReady.every((p) => p.before.issues.includes(i) && !p.after.issues.includes(i)));
    up.push({
      key: "ready",
      tone: "up",
      badge: `▲ ${nowReady.length}`,
      parts:
        nowReady.length === 1
          ? [{ strong: nowReady[0].after.route }, ` became agent-ready${common ? ` after "${titleOf(common)}" was fixed` : ""}.`]
          : [`${plural(nowReady.length, "page")} became agent-ready${common ? ` after "${titleOf(common)}" was fixed` : ""}.`],
    });
  }
  return { down: [...drops.sort((a, b) => b.size - a.size).map((d) => d.item), ...blocked], up };
}

function botChanges(prev: AccessSnapshot, cur: AccessSnapshot): { down: ChangeItem[]; up: ChangeItem[] } {
  const down: ChangeItem[] = [];
  const up: ChangeItem[] = [];
  for (const [name, after] of Object.entries(cur.bots)) {
    const before = prev.bots[name];
    if (!before) continue;
    if (after.status === "fix" && before.status === "pass") {
      const how: ChangePart[] =
        after.outcome === "robots"
          ? [" is now blocked by robots.txt"]
          : after.outcome === "challenge"
            ? [" now gets a challenge page from your firewall"]
            : after.failStatus
              ? [" now gets ", { strong: String(after.failStatus) }, " from your firewall"]
              : [" is now blocked by your firewall"];
      down.push({ key: `bot:${name}`, tone: "down", badge: "New", parts: [name, ...how, ` (it got ${before.live} last time).`] });
    } else if (after.status === "pass" && before.status === "fix") {
      up.push({ key: `bot:${name}`, tone: "up", badge: "▲", parts: [`${name} can read your pages again.`] });
    }
  }
  return { down, up };
}

function citationItems(changes: CitationChange[]): { down: ChangeItem[]; up: ChangeItem[] } {
  const items = changes
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((c): ChangeItem => {
      const n = Math.abs(c.delta);
      return {
        key: `cited:${c.route}`,
        tone: c.delta > 0 ? "up" : "down",
        badge: c.delta > 0 ? "▲" : "▼",
        parts: [`Cited in ${plural(n, "AI answer")} ${c.delta > 0 ? "more" : "fewer"} for `, { strong: c.route }, "."],
      };
    });
  return { down: items.filter((i) => i.tone === "down"), up: items.filter((i) => i.tone === "up") };
}

export interface WhatChangedInput {
  /** Oldest first; the last two are compared. */
  scans: ScanSnapshot[];
  access: AccessSnapshot[];
  citations: CitationChange[];
}

/** Worst news first: page drops, newly blocked pages and agents, fewer citations; then the good news. */
export function whatChanged({ scans, access, citations }: WhatChangedInput): WhatChanged {
  const pages = scans.length >= 2 ? pageChanges(scans[scans.length - 2], scans[scans.length - 1]) : { down: [], up: [] };
  const bots = access.length >= 2 ? botChanges(access[access.length - 2], access[access.length - 1]) : { down: [], up: [] };
  const cited = citationItems(citations);
  return {
    items: [...pages.down, ...bots.down, ...cited.down, ...pages.up, ...bots.up, ...cited.up],
    comparable: scans.length >= 2 || access.length >= 2 || citations.length > 0,
  };
}

/** Appends a snapshot, keeping the last two (all "What changed" compares). */
export function pushSnapshot<T extends { at: string }>(list: T[], snap: T): T[] {
  if (list.length > 0 && list[list.length - 1].at === snap.at) return list;
  return [...list, snap].slice(-2);
}
