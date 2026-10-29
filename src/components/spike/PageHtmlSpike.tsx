"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY — Phase 0 spike for client.getPageHTML() (plan section 7).
// Shown only with `?spike=1` or NEXT_PUBLIC_SPIKE_DEBUG=1. Remove in Phase 4
// once usePageHtml replaces it. Findings go in docs/SPIKE-FINDINGS.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useSyncExternalStore } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { ParsedHtml } from "@/lib/rule-engine/types";

const STORAGE_KEY = "spike:getPageHTML:v1";

// Markers of Page Builder / Sitecore editing chrome we hope NOT to see
const EDITOR_PATTERNS: Array<[string, RegExp]> = [
  ["<code type=text/sitecore>", /<code[^>]+type=["']text\/sitecore/gi],
  ["chrome data", /chrome(type|data)|scChromeData/gi],
  ["sc-placeholder / data-sc-*", /\bdata-sc-[\w-]+|\bsc-placeholder/gi],
  ["contenteditable", /\bcontenteditable\b/gi],
  ["scEmpty* class", /\bscEmpty\w*/gi],
  ["[No text in field]", /\[No text in field\]/gi],
  ["placeholder class", /class=["'][^"']*placeholder[^"']*["']/gi],
  ["data-component*", /\bdata-component[\w-]*/gi],
];

type ScriptKind = "inline" | "external" | "json-ld" | "other-data";

interface SpikeReport {
  label: string;
  capturedAt: string;
  durationMs: number;
  page: { pageId: string | null; pageTitle: string | null; pageUrl: string };
  result: { typeofResult: string; objectKeys: string[] | null; error: string | null };
  html: {
    length: number;
    hasDoctype: boolean;
    hasHtmlTag: boolean;
    hasHead: boolean;
    hasBody: boolean;
  };
  head: {
    title: string | null;
    canonical: string | null;
    metaDescription: string | null;
    robots: string | null;
    ogTagCount: number;
    jsonLdTypes: string[];
    jsonLdParseErrors: number;
  } | null;
  scripts: Record<ScriptKind, number>;
  editorArtifacts: Record<string, number>;
  dataAttributes: Array<[string, number]>;
  marker: { text: string; found: boolean } | null;
  draft: { h1: string[]; headingCount: number; paragraphCount: number; wordCount: number };
  vsServer: {
    status: "ok" | "skipped" | "failed";
    note: string;
    headingsOnlyInDraft: string[];
    headingsOnlyInServer: string[];
    paragraphsOnlyInDraft: string[];
    paragraphsOnlyInServer: string[];
  };
  excerpt: { start: string; bodyStart: string };
}

interface PageHtmlSpikeProps {
  client: ClientSDK | null;
  pageId: string | null;
  pageTitle: string | null;
  pageUrl: string;
  editingToken: string | null;
}

const subscribe = () => () => {};
function spikeEnabledSnapshot(): boolean {
  if (process.env.NEXT_PUBLIC_SPIKE_DEBUG === "1") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("spike") === "1";
}

export function usePageHtmlSpikeEnabled(): boolean {
  return useSyncExternalStore(subscribe, spikeEnabledSnapshot, () => false);
}

function loadReports(): SpikeReport[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveReports(reports: SpikeReport[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // storage blocked in the iframe — reports stay in memory and the console
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function countMatches(html: string, re: RegExp): number {
  return html.match(re)?.length ?? 0;
}

function extractHtml(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    for (const key of ["html", "data", "value", "pageHtml"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return "";
}

function analyseDraft(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hasHead = /<head[\s>]/i.test(html);

  const jsonLdTypes: string[] = [];
  let jsonLdParseErrors = 0;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const parsed = JSON.parse(s.textContent ?? "");
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
      for (const item of items) jsonLdTypes.push(String(item?.["@type"] ?? "?"));
    } catch {
      jsonLdParseErrors++;
    }
  });

  const scripts: Record<ScriptKind, number> = { inline: 0, external: 0, "json-ld": 0, "other-data": 0 };
  doc.querySelectorAll("script").forEach((s) => {
    const type = (s.getAttribute("type") ?? "").toLowerCase();
    if (type === "application/ld+json") scripts["json-ld"]++;
    else if (type && !type.includes("javascript") && type !== "module") scripts["other-data"]++;
    else if (s.getAttribute("src")) scripts.external++;
    else scripts.inline++;
  });

  const dataAttrCounts = new Map<string, number>();
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("data-")) {
        dataAttrCounts.set(attr.name, (dataAttrCounts.get(attr.name) ?? 0) + 1);
      }
    }
  });

  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute("content") ?? null;
  const headings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
    (h) => `${h.tagName.toLowerCase()}: ${norm(h.textContent ?? "")}`,
  );
  const paragraphs = Array.from(doc.querySelectorAll("p"))
    .map((p) => norm(p.textContent ?? ""))
    .filter(Boolean);
  const bodyText = norm(doc.body?.textContent ?? "");

  return {
    hasHead,
    head: hasHead || doc.head.childElementCount > 0
      ? {
          title: doc.querySelector("title")?.textContent ?? null,
          canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
          metaDescription: meta('meta[name="description"]'),
          robots: meta('meta[name="robots"]'),
          ogTagCount: doc.querySelectorAll('meta[property^="og:"]').length,
          jsonLdTypes,
          jsonLdParseErrors,
        }
      : null,
    scripts,
    dataAttributes: Array.from(dataAttrCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25),
    headings,
    paragraphs,
    bodyText,
    h1: headings.filter((h) => h.startsWith("h1:")).map((h) => h.slice(4)),
  };
}

async function compareWithServer(
  pageUrl: string,
  editingToken: string | null,
  draftHeadings: string[],
  draftParagraphs: string[],
): Promise<SpikeReport["vsServer"]> {
  const empty = { headingsOnlyInDraft: [], headingsOnlyInServer: [], paragraphsOnlyInDraft: [], paragraphsOnlyInServer: [] };
  if (!pageUrl) return { status: "skipped", note: "No page URL", ...empty };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const tokenParam = editingToken ? `&token=${encodeURIComponent(editingToken)}` : "";
  try {
    const res = await fetch(`${base}/api/preview-fetch?url=${encodeURIComponent(pageUrl)}${tokenParam}`);
    if (!res.ok) return { status: "failed", note: `preview-fetch HTTP ${res.status}`, ...empty };
    const server = (await res.json()) as ParsedHtml;
    const serverHeadings = server.headings.map((h) => `h${h.level}: ${norm(h.text)}`);
    // preview-fetch only collects <p> inside <main>, so "only in server" is the stronger signal
    const serverParagraphs = server.paragraphs.map(norm).filter(Boolean);
    const diff = (a: string[], b: string[]) => {
      const set = new Set(b);
      return a.filter((x) => !set.has(x)).slice(0, 10);
    };
    return {
      status: "ok",
      note: `Server (${editingToken ? "preview token" : "published"}): ${serverHeadings.length} headings, ${serverParagraphs.length} <main> paragraphs`,
      headingsOnlyInDraft: diff(draftHeadings, serverHeadings),
      headingsOnlyInServer: diff(serverHeadings, draftHeadings),
      paragraphsOnlyInDraft: diff(draftParagraphs, serverParagraphs),
      paragraphsOnlyInServer: diff(serverParagraphs, draftParagraphs),
    };
  } catch (err) {
    return { status: "failed", note: err instanceof Error ? err.message : "fetch failed", ...empty };
  }
}

export function PageHtmlSpike({ client, pageId, pageTitle, pageUrl, editingToken }: PageHtmlSpikeProps) {
  const [reports, setReports] = useState<SpikeReport[]>(loadReports);
  const [label, setLabel] = useState("simple");
  const [marker, setMarker] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function capture() {
    if (!client) return;
    setBusy(true);
    const started = performance.now();
    let raw: unknown = null;
    let error: string | null = null;
    try {
      raw = await client.getPageHTML();
    } catch (err) {
      error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    const durationMs = Math.round(performance.now() - started);
    const html = extractHtml(raw);
    const draft = analyseDraft(html);
    const editorArtifacts = Object.fromEntries(
      EDITOR_PATTERNS.map(([name, re]) => [name, countMatches(html, re)]),
    );
    const vsServer = await compareWithServer(pageUrl, editingToken, draft.headings, draft.paragraphs);

    const report: SpikeReport = {
      label,
      capturedAt: new Date().toISOString(),
      durationMs,
      page: { pageId, pageTitle, pageUrl },
      result: {
        typeofResult: raw === null ? "null" : typeof raw,
        objectKeys: raw && typeof raw === "object" ? Object.keys(raw as object) : null,
        error,
      },
      html: {
        length: html.length,
        hasDoctype: /^\s*<!doctype/i.test(html),
        hasHtmlTag: /<html[\s>]/i.test(html),
        hasHead: draft.hasHead,
        hasBody: /<body[\s>]/i.test(html),
      },
      head: draft.head,
      scripts: draft.scripts,
      editorArtifacts,
      dataAttributes: draft.dataAttributes,
      marker: marker ? { text: marker, found: html.includes(marker) } : null,
      draft: {
        h1: draft.h1,
        headingCount: draft.headings.length,
        paragraphCount: draft.paragraphs.length,
        wordCount: draft.bodyText ? draft.bodyText.split(" ").length : 0,
      },
      vsServer,
      excerpt: {
        start: html.slice(0, 1500),
        bodyStart: html.slice(Math.max(0, html.search(/<body[\s>]/i)), Math.max(0, html.search(/<body[\s>]/i)) + 1500),
      },
    };

    console.groupCollapsed(`[spike:getPageHTML] ${label} — ${pageTitle ?? pageId}`);
    console.log("report", report);
    console.log("raw result", raw);
    console.log("html", html);
    console.groupEnd();

    const next = [...reports, report];
    setReports(next);
    saveReports(next);
    setBusy(false);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(reports, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function clearAll() {
    setReports([]);
    saveReports([]);
    setCopyState("idle");
  }

  const last = reports.at(-1);

  return (
    <section className="mx-3 mb-3 rounded-md border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-[13px]">
      <p className="font-semibold">getPageHTML spike (temporary)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Page kind"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded border border-gray-300 bg-white px-1 py-1"
        >
          <option value="simple">simple page</option>
          <option value="article">article</option>
          <option value="faq">FAQ page</option>
          <option value="unsaved-edit">after unsaved edit</option>
          <option value="client-rendered">client-rendered component</option>
          <option value="empty-placeholder">empty placeholder / datasource</option>
        </select>
        <input
          aria-label="Marker text to look for"
          placeholder="marker text (optional)"
          value={marker}
          onChange={(e) => setMarker(e.target.value)}
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={capture}
          disabled={!client || busy}
          className="rounded bg-amber-600 px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Capturing…" : "Capture getPageHTML"}
        </button>
        <button onClick={copyAll} disabled={!reports.length} className="rounded border border-gray-300 bg-white px-3 py-1 disabled:opacity-50">
          Copy {reports.length} report{reports.length === 1 ? "" : "s"}
        </button>
        <button onClick={clearAll} disabled={!reports.length} className="rounded border border-gray-300 bg-white px-3 py-1 disabled:opacity-50">
          Clear
        </button>
      </div>
      {copyState === "copied" && <p className="mt-1 text-green-700">Copied to clipboard.</p>}
      {copyState === "failed" && (
        <textarea
          readOnly
          aria-label="Spike reports JSON"
          className="mt-2 h-32 w-full rounded border border-gray-300 bg-white p-1 font-mono text-[11px]"
          value={JSON.stringify(reports, null, 2)}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {last && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt>Return</dt>
          <dd>
            {last.result.error ?? last.result.typeofResult}
            {last.result.objectKeys && ` {${last.result.objectKeys.join(", ")}}`} · {last.html.length.toLocaleString()} chars · {last.durationMs} ms
          </dd>
          <dt>&lt;head&gt;</dt>
          <dd>
            {last.head
              ? `title ${last.head.title ? "✓" : "✕"} · canonical ${last.head.canonical ? "✓" : "✕"} · description ${last.head.metaDescription ? "✓" : "✕"} · og ${last.head.ogTagCount} · JSON-LD [${last.head.jsonLdTypes.join(", ")}]`
              : "not included"}
          </dd>
          <dt>Scripts</dt>
          <dd>{Object.entries(last.scripts).map(([k, v]) => `${k} ${v}`).join(" · ")}</dd>
          <dt>Editor</dt>
          <dd>
            {Object.entries(last.editorArtifacts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(" · ") || "none found"}
          </dd>
          {last.marker && (
            <>
              <dt>Marker</dt>
              <dd>{last.marker.found ? "✓ found" : "✕ not found"}</dd>
            </>
          )}
          <dt>vs server</dt>
          <dd>
            {last.vsServer.note}; only in draft: {last.vsServer.headingsOnlyInDraft.length} headings,{" "}
            {last.vsServer.paragraphsOnlyInDraft.length} paragraphs
          </dd>
        </dl>
      )}
    </section>
  );
}
