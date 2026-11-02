// ─────────────────────────────────────────────────────────────────────────────
// Compares the sanitised draft (getPageHTML) with the live server HTML, block
// by block. P3 uses it to find content that only exists after JavaScript runs;
// the panel uses it for the "Draft differs from live" banner.
//
// Text alone can't tell a client-rendered block from an unpublished edit, so:
// - a draft block found in the live HTML is server-rendered;
// - a draft block that closely matches a live block missing from the draft is
//   an edit of server-rendered content;
// - any other draft block is client-only (or new, not yet published).
// ─────────────────────────────────────────────────────────────────────────────

import { isEmptyStateMessage } from "@/lib/html/sanitise-draft";
import { wordCount } from "@/lib/rule-engine/helpers";
import type { BodyBlock } from "@/lib/rule-engine/types";

/**
 * Template tokens that JavaScript fills in, e.g. `© {{year}}` in the draft and
 * `© 2026` on the live page. A token matches any one word.
 */
const TEMPLATE_TOKEN = /\{\{[^{}]*\}\}/g;
const TOKEN = "{{}}";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for a block with template tokens; null without. */
function tokenPattern(norm: string): RegExp | null {
  if (!norm.includes(TOKEN)) return null;
  return new RegExp(norm.split(TOKEN).map(escapeRegExp).join("\\S*"));
}

/** Whether a normalised block appears in the joined text, tokens matching any word. */
function appearsIn(norm: string, joined: string): boolean {
  return tokenPattern(norm)?.test(joined) ?? joined.includes(norm);
}

/** Blocks shorter than this (dates, "Read more", labels) are too short to judge. */
export const MIN_BLOCK_WORDS = 4;
/** Word overlap (Dice) at which an unmatched draft block counts as an edit of a live block. */
const EDIT_SIMILARITY = 0.5;

export interface DraftDiff {
  /** Words in draft blocks that are in the live HTML, or edits of blocks that are. */
  serverWords: number;
  /** Draft blocks with no counterpart in the live HTML. */
  clientOnly: BodyBlock[];
  clientOnlyWords: number;
  /** Draft blocks that look like edits of a live block. */
  edited: Array<{ draft: string; live: string }>;
  /** Live blocks (of 2+ words) that aren't in the draft: removed or changed. */
  liveOnly: BodyBlock[];
}

/** Case, Unicode form, quotes and dashes don't count as differences; tokens become `{{}}`. */
export function normaliseBlock(s: string): string {
  return s
    .normalize("NFC")
    .replace(TEMPLATE_TOKEN, TOKEN)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const wordSet = (s: string) => new Set(s.split(" ").filter(Boolean));

function similarity(a: string, b: string): number {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (2 * shared) / (wa.size + wb.size);
}

export function compareBlocks(draft: BodyBlock[], live: BodyBlock[]): DraftDiff {
  const liveNorm = live.map((b) => ({ block: b, norm: normaliseBlock(b.text) })).filter((b) => b.norm);
  const draftNorm = draft.map((b) => ({ block: b, norm: normaliseBlock(b.text) })).filter((b) => b.norm);
  // Joined, so a block split differently on each side still matches.
  const liveJoined = liveNorm.map((b) => b.norm).join("\n");
  const draftJoined = draftNorm.map((b) => b.norm).join("\n");

  const draftPatterns = draftNorm.map((b) => tokenPattern(b.norm)).filter((p): p is RegExp => p !== null);
  const inDraft = (norm: string) => draftJoined.includes(norm) || draftPatterns.some((p) => p.test(norm));
  const liveOnly = liveNorm.filter((b) => !inDraft(b.norm) && wordCount(b.norm) >= 2);

  const diff: DraftDiff = { serverWords: 0, clientOnly: [], clientOnlyWords: 0, edited: [], liveOnly: liveOnly.map((b) => b.block) };

  for (const { block, norm } of draftNorm) {
    if (isEmptyStateMessage(block.text)) continue;
    const words = wordCount(norm);
    if (appearsIn(norm, liveJoined)) {
      diff.serverWords += words;
      continue;
    }
    if (words < MIN_BLOCK_WORDS) continue;
    const counterpart = liveOnly.find((l) => similarity(norm, l.norm) >= EDIT_SIMILARITY);
    if (counterpart) {
      diff.serverWords += words;
      diff.edited.push({ draft: block.text, live: counterpart.block.text });
    } else {
      diff.clientOnly.push(block);
      diff.clientOnlyWords += words;
    }
  }
  return diff;
}

const lines = (text: string): BodyBlock[] =>
  text.split("\n").filter(Boolean).map((t) => ({ text: t, component: null }));

export interface DraftDifference {
  differs: boolean;
  /** Draft blocks that are edits of the live text. */
  changed: number;
  /** Live blocks that aren't in the draft. */
  removed: number;
}

/**
 * Whether the draft's main text differs from the live page's. Client-rendered
 * blocks (in the draft only, with no live counterpart) don't count, or every
 * page with a client-rendered listing would always differ.
 */
export function draftDiffersFromLive(draftMainText: string, liveMainText: string): DraftDifference {
  const diff = compareBlocks(lines(draftMainText), lines(liveMainText));
  const changed = diff.edited.length;
  const removed = diff.liveOnly.length - new Set(diff.edited.map((e) => e.live)).size;
  return { differs: changed > 0 || removed > 0, changed, removed: Math.max(0, removed) };
}
