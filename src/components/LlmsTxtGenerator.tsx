"use client";

import { useMemo, useState } from "react";
import type { PageMatrixRow } from "@/types/dashboard";
import { buildLlmsTxt } from "@/lib/llms-txt/build";

interface LlmsTxtGeneratorProps {
  pages: PageMatrixRow[];
  siteDomain: string;
  siteName: string;
}

export function LlmsTxtGenerator({ pages, siteDomain, siteName }: LlmsTxtGeneratorProps) {
  const [tagline, setTagline] = useState("Digital experience platform");
  const [filterByScore, setFilterByScore] = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);

  // The score filter is an opt-in refinement — only meaningful once some pages
  // have been scanned. It never gates the file: generation runs off enumeration.
  const hasAnyScore = useMemo(() => pages.some((p) => p.score != null), [pages]);
  const scoreThreshold = filterByScore && hasAnyScore ? threshold : null;

  const { content, includedCount, excludedCount } = useMemo(
    () =>
      buildLlmsTxt(pages, {
        siteDomain,
        siteName,
        tagline,
        scoreThreshold,
      }),
    [pages, siteDomain, siteName, tagline, scoreThreshold],
  );

  const flash = (label: string) => {
    setFlashLabel(label);
    setTimeout(() => setFlashLabel(null), 1500);
  };

  const onDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(url);
    flash("Downloaded");
  };

  const onCopy = async () => {
    // Primary path: the async Clipboard API. This is often blocked inside the
    // Marketplace iframe (Permissions-Policy doesn't delegate `clipboard-write`),
    // so we fall back to a temporary <textarea> + execCommand, which works there.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        flash("Copied ✓");
        return;
      }
    } catch {
      // fall through to the legacy path
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      // Keep it out of view and avoid scroll jumps / mobile zoom.
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      flash(ok ? "Copied ✓" : "Copy failed");
    } catch {
      flash("Copy failed");
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">Site summary</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="One-line description of the site"
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
          />
          <p className="text-xs text-gray-500 mt-1">Shown as the blockquote summary under the title.</p>
        </div>

        <p className="text-xs text-gray-500">
          Pages are grouped into sections automatically based on their structure in the CMS content tree.
        </p>

        <div className="border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filterByScore}
              disabled={!hasAnyScore}
              onChange={(e) => setFilterByScore(e.target.checked)}
            />
            <span className={hasAnyScore ? "" : "text-gray-400"}>
              Only include pages with health score ≥
            </span>
            {filterByScore && hasAnyScore && (
              <span className="text-sm font-mono text-blue-600">{threshold}</span>
            )}
          </label>
          {filterByScore && hasAnyScore && (
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
              className="w-full mt-2"
            />
          )}
          {!hasAnyScore && (
            <p className="text-xs text-gray-500 mt-1">
              Run a page scan to filter by health score. Without it, all enumerated pages are listed.
            </p>
          )}
        </div>
      </div>

      <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs max-h-72 overflow-y-auto whitespace-pre-wrap">
        {content}
      </pre>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">
          {includedCount} page{includedCount === 1 ? "" : "s"} included
          {excludedCount > 0 ? ` · ${excludedCount} excluded` : ""}
        </span>
        <span className="flex-1" />
        <button
          onClick={onDownload}
          className="text-xs px-3 py-1.5 rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
        >
          Download .txt
        </button>
        <button
          onClick={onCopy}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
        >
          Copy
        </button>
        {flashLabel && <span className="text-xs text-green-600">{flashLabel}</span>}
      </div>

      <p className="text-xs text-gray-500">
        Deploy to your site root as <code>/llms.txt</code>. In a headless XM Cloud setup, add it as a static file in
        your head application&apos;s <code>/public</code> folder, or configure your CDN to serve it from the root path.
      </p>
    </div>
  );
}
