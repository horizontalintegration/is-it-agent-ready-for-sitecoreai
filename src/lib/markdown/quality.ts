// ─────────────────────────────────────────────────────────────────────────────
// P6 "The Markdown version is complete" (plan section 5.2): grades the
// Markdown a page serves against the same page's HTML and Sitecore fields.
//   - Front matter: title and description match the fields (1/6 each).
//   - Coverage: ≥ 90% of the page's headings, paragraphs and FAQ answers are
//     in the Markdown, by words (1/3; half at 75%).
//   - Chrome: menus, header and footer are < 25% of the Markdown (1/3; half
//     under 40%).
// ─────────────────────────────────────────────────────────────────────────────

import type { PageFields } from "@/lib/checks/types";
import type { ParsedHtml } from "@/lib/rule-engine/types";

export const COVERAGE_PASS = 0.9;
export const COVERAGE_HALF = 0.75;
export const CHROME_PASS = 0.25;
export const CHROME_HALF = 0.4;

/** Lower case, accents and punctuation removed, single spaces: for comparing text across formats. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface FrontMatter {
  present: boolean;
  data: Record<string, string>;
  /** The Markdown after the front matter. */
  body: string;
}

/** Reads `key: value` lines of a leading `---` block. Nested YAML is skipped. */
export function parseFrontMatter(markdown: string): FrontMatter {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!m) return { present: false, data: {}, body: markdown };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    data[kv[1].toLowerCase()] = value;
  }
  return { present: true, data, body: markdown.slice(m[0].length) };
}

/** Markdown → plain text lines: link and image syntax reduced to their text, reference definitions dropped. */
export function markdownLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((l) => !/^\s*\[[^\]]+\]:\s*\S+/.test(l))
    .map((l) =>
      l
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
        .replace(/<https?:[^>]+>/g, ""),
    )
    .map(normalise)
    .filter(Boolean);
}

const words = (s: string) => s.split(" ").filter(Boolean);

export interface QualityInput {
  /** The served Markdown (front matter included). */
  markdown: string;
  fields: PageFields | null;
  /** The same page's live HTML. */
  html: ParsedHtml;
}

export interface FieldMatch {
  /** In the front matter. */
  value: string | null;
  /** From the Sitecore field (or the HTML's head without fields). Null when it's empty. */
  expected: string | null;
  ok: boolean;
}

export interface QualityResult {
  frontMatter: { present: boolean; title: FieldMatch; description: FieldMatch };
  /** 0–1, by words. Null when the page has no text to compare. */
  coverage: number | null;
  /** Content items not found in the Markdown, as on the page. */
  missing: string[];
  /** 0–1: the share of the Markdown that is menus, header and footer. */
  chromeShare: number;
  credit: number;
}

function matchField(value: string | null, expected: string | null): FieldMatch {
  const v = value ? normalise(value) : "";
  const e = expected ? normalise(expected) : "";
  // Titles often get a suffix ("… | BrandX"): containment either way counts.
  const ok = v !== "" && (e === "" || v.includes(e) || e.includes(v));
  return { value: value || null, expected: expected || null, ok };
}

export function gradeMarkdownQuality({ markdown, fields, html }: QualityInput): QualityResult {
  const fm = parseFrontMatter(markdown);
  const title = matchField(fm.data.title ?? null, fields?.metaTitle ?? html.title);
  // An empty description field is a miss even when the converter found one elsewhere: authors set it.
  const description = fields && !fields.metaDescription
    ? { value: fm.data.description || null, expected: null, ok: false }
    : matchField(fm.data.description ?? null, fields?.metaDescription ?? html.metaDescription);

  const lines = markdownLines(fm.body);
  const text = ` ${lines.join(" ")} `;
  const vocabulary = new Set(words(text));

  // Coverage: each content item counts by its words. Headings come from the whole page, so only
  // those in the main text count: a footer's "Legal" isn't content a Markdown version should keep.
  const mainLines = new Set(html.mainText.split("\n").map(normalise).filter(Boolean));
  const headings = html.headings.map((h) => h.text).filter((t) => mainLines.has(normalise(t)));
  const items = [...new Set([...headings, ...html.paragraphs, ...html.qaPairs.map((q) => q.answer)])].filter(
    (s) => normalise(s) !== "",
  );
  let total = 0;
  let covered = 0;
  const missing: string[] = [];
  for (const item of items) {
    const n = normalise(item);
    const w = words(n);
    const found = text.includes(` ${n} `) || (w.length >= 6 && w.filter((x) => vocabulary.has(x)).length / w.length >= 0.9);
    total += w.length;
    if (found) covered += w.length;
    else missing.push(item);
  }
  const coverage = total > 0 ? covered / total : null;

  // Chrome: Markdown lines that are text from outside the main content.
  const main = new Set([...mainLines, ...[...items, ...html.qaPairs.map((q) => q.question)].map(normalise).filter(Boolean)]);
  const chrome = new Set(html.bodyBlocks.map((b) => normalise(b.text)).filter((t) => t && !main.has(t)));
  let all = 0;
  let chromeChars = 0;
  for (const line of lines) {
    all += line.length;
    if (!main.has(line) && chrome.has(line)) chromeChars += line.length;
  }
  const chromeShare = all > 0 ? chromeChars / all : 0;

  const coverageCredit = coverage === null ? 1 : coverage >= COVERAGE_PASS ? 1 : coverage >= COVERAGE_HALF ? 0.5 : 0;
  const chromeCredit = chromeShare < CHROME_PASS ? 1 : chromeShare < CHROME_HALF ? 0.5 : 0;
  const credit = (Number(title.ok) + Number(description.ok)) / 6 + coverageCredit / 3 + chromeCredit / 3;

  return {
    frontMatter: { present: fm.present, title, description },
    coverage,
    missing,
    chromeShare,
    credit: Math.round(credit * 1000) / 1000,
  };
}
