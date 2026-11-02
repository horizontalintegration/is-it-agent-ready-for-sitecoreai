// ─────────────────────────────────────────────────────────────────────────────
// Draft HTML sanitiser (plan section 7). `client.getPageHTML()` returns the
// Page Builder canvas, editor artifacts included (SPIKE-FINDINGS §3, item 5).
// Every capture goes through here before it's parsed, so no check ever sees
// raw editor output.
// ─────────────────────────────────────────────────────────────────────────────

import { parse, NodeType, type HTMLElement, type Node, type TextNode } from "node-html-parser";

/**
 * Messages a listing shows when it has nothing to list ("No articles found").
 * Client-fetched listings can show them in the editor while visitors see the
 * full list, so they aren't content.
 */
const EMPTY_STATE_PATTERNS = [
  /^(no|0)\s+(\w+\s+){0,2}(found|available|yet|to (show|display))[.!]?$/i,
  /^no (results|matches|items|articles|events|posts|news)[.!]?$/i,
  /^nothing (found|to (show|display))[.!]?$/i,
  /^loading(\.{3}|…)?$/i,
];

export function isEmptyStateMessage(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= 60 && EMPTY_STATE_PATTERNS.some((re) => re.test(t));
}

const EMPTY_FIELD = "[No text in field]";
const FALLBACK = "Fallback:";
// Page Builder's help text: "Placeholder: <name>" labels around placeholders,
// and "Fallback: <value>" next to fields that use a fallback. Seen in the
// BrandX FAQ capture (2026-11-01):
//   <h1><span …>Frequently Asked Questions</span><div class="undefined ee-help-text-block">Fallback:<!-- --> <span …>Frequently Asked Questions</span></div></h1>
const HELP_TEXT = ".ee-help-text-block";
// Editor-only classes: the empty-placeholder marker and the canvas wrapper.
const EDITOR_CLASS = /^(placeholder|editing-mode)$/;
// An empty field's placeholder element (class scEmptyImage, …), removed whole.
const EMPTY_FIELD_CLASS = /\bclass\s*=\s*["'][^"']*\bscEmpty\w*/;

export interface SanitisedDraft {
  /** The cleaned HTML, ready for extractParsedHtml. */
  html: string;
  /** Empty-state messages that were removed, for P3's "couldn't render in the editor" note. */
  emptyStates: string[];
  /** What was removed, for the console log. */
  removed: {
    fallbackHints: number;
    editorLabels: number;
    emptyFields: number;
    editorAttributes: number;
  };
}

function textNodes(node: Node, out: TextNode[] = []): TextNode[] {
  if (node.nodeType === NodeType.TEXT_NODE) out.push(node as TextNode);
  else for (const child of node.childNodes) textNodes(child, out);
  return out;
}

/** Text of an element, whitespace collapsed (entities decoded). */
const textOf = (el: HTMLElement) => el.text.replace(/\s+/g, " ").trim();

/** The outermost element that holds nothing but this text node, or the text node itself. */
function wrapperOf(node: TextNode): Node {
  const own = node.text.replace(/\s+/g, " ").trim();
  let current: Node = node;
  let parent = current.parentNode as HTMLElement | null;
  while (parent && parent.parentNode && textOf(parent) === own) {
    current = parent;
    parent = parent.parentNode as HTMLElement | null;
  }
  return current;
}

function remove(node: Node): void {
  (node.parentNode as HTMLElement | null)?.removeChild(node);
}

/**
 * Page Builder's help text. A "Fallback:" hint next to the field's value
 * goes. When the field is empty, the published page shows the fallback, so
 * the hint is replaced by its value without the "Fallback:" label. Any other
 * help text ("Placeholder: custom-headless-hero") goes.
 */
function removeHelpText(root: HTMLElement, removed: SanitisedDraft["removed"]): void {
  for (const block of root.querySelectorAll(HELP_TEXT)) {
    const text = textOf(block);
    const host = block.parentNode as HTMLElement | null;
    if (!text.startsWith(FALLBACK) || !host) {
      remove(block);
      removed.editorLabels++;
      continue;
    }
    removed.fallbackHints++;
    const fieldIsEmpty = textOf(host).replace(text, "").trim() === "";
    if (!fieldIsEmpty) {
      remove(block);
      continue;
    }
    const label = textNodes(block).find((n) => n.rawText.includes(FALLBACK));
    if (label) label.rawText = label.rawText.replace(FALLBACK, "");
    block.replaceWith(...block.childNodes);
  }
}

/**
 * Removes Page Builder artifacts from a `getPageHTML()` capture:
 * - Help text (`.ee-help-text-block`): "Placeholder: …" labels, and
 *   "Fallback: …" hints (see removeHelpText).
 * - `[No text in field]` placeholders, and empty fields' placeholder elements (`scEmptyImage`).
 * - Empty-state messages ("No articles found"), returned in `emptyStates`.
 * - `contenteditable` and editor-only classes.
 */
export function sanitiseDraftHtml(raw: string): SanitisedDraft {
  const root = parse(raw);
  const removed = { fallbackHints: 0, editorLabels: 0, emptyFields: 0, editorAttributes: 0 };
  const emptyStates: string[] = [];

  removeHelpText(root, removed);

  for (const node of textNodes(root)) {
    let rawText = node.rawText;

    if (rawText.includes(EMPTY_FIELD)) {
      rawText = rawText.split(EMPTY_FIELD).join("");
      removed.emptyFields++;
    }

    node.rawText = rawText;

    if (node.parentNode && isEmptyStateMessage(node.text)) {
      emptyStates.push(node.text.replace(/\s+/g, " ").trim());
      remove(wrapperOf(node));
    }
  }

  for (const el of root.querySelectorAll("*")) {
    // An empty field's placeholder (the grey `scEmptyImage` picture with
    // alt=""): the published page renders nothing there. Read from the raw
    // attributes: its src is an inline SVG containing `class=&quot;st3&quot;`,
    // which node-html-parser takes as the element's class.
    if (EMPTY_FIELD_CLASS.test(el.rawAttrs)) {
      remove(el);
      removed.emptyFields++;
      continue;
    }
    if (el.hasAttribute("contenteditable")) {
      el.removeAttribute("contenteditable");
      removed.editorAttributes++;
    }
    for (const cls of [...el.classList.values()]) {
      if (EDITOR_CLASS.test(cls)) {
        el.classList.remove(cls);
        removed.editorAttributes++;
      }
    }
  }

  return { html: root.toString(), emptyStates, removed };
}
