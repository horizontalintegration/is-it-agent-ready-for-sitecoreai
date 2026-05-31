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
  const [includeBlog, setIncludeBlog] = useState(true);
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeUtility, setIncludeUtility] = useState(true);
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);

  // The score filter is an opt-in refinement — only meaningful once some pages
  // have been scanned. It never gates the file: generation runs off enumeration.
  const hasAnyScore = useMemo(() => pages.some((p) => p.score != null), [pages]);
  const hasAnyDescription = useMemo(
    () => pages.some((p) => (p.metaDescription ?? "").trim().length > 0),
    [pages],
  );
  const scoreThreshold = filterByScore && hasAnyScore ? threshold : null;

  const { content, includedCount, excludedCount } = useMemo(
    () =>
      buildLlmsTxt(pages, {
        siteDomain,
        siteName,
        tagline,
        includeDescriptions,
        includeBlog,
        includeProducts,
        includeUtility,
        scoreThreshold,
      }),
    [
      pages,
      siteDomain,
      siteName,
      tagline,
      includeDescriptions,
      includeBlog,
      includeProducts,
      includeUtility,
      scoreThreshold,
    ],
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
    try {
      await navigator.clipboard.writeText(content);
      flash("Copied ✓");
    } catch {
      flash("Copy failed");
    }
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-900">Not required for Google AI features</p>
          <p className="text-sm text-amber-800 mt-1">
            Google&apos;s official AI optimisation guide explicitly states that LLMs.txt files have no effect on AI
            Overviews or AI Mode. This file is an emerging convention for non-Google AI systems (Perplexity, Claude
            browsing, open-source agents). Treat it as a low-effort courtesy — not an SEO priority.
          </p>
        </div>
      </div>

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

        <fieldset className="text-sm text-gray-700">
          <legend className="font-medium text-gray-900 mb-1.5">Sections</legend>
          <label className="flex items-center gap-2 mb-1">
            <input type="checkbox" checked={includeBlog} onChange={(e) => setIncludeBlog(e.target.checked)} />
            Blog posts
          </label>
          <label className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={includeProducts}
              onChange={(e) => setIncludeProducts(e.target.checked)}
            />
            Product / solutions pages
          </label>
          <label className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={includeUtility}
              onChange={(e) => setIncludeUtility(e.target.checked)}
            />
            Utility pages (as <code>## Optional</code>: /contact, /privacy, /terms, /404, /sitemap)
          </label>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeDescriptions}
            onChange={(e) => setIncludeDescriptions(e.target.checked)}
          />
          Include meta description as summary
        </label>
        {includeDescriptions && !hasAnyDescription && (
          <p className="text-xs text-amber-700 -mt-1">
            No meta descriptions found on these pages — links will use the title only.
          </p>
        )}

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
