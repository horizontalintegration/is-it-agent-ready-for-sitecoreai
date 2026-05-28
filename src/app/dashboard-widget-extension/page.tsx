"use client";

import { useMemo, useState } from "react";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { useSitePages } from "@/hooks/useSitePages";
import { useDemoMode } from "@/hooks/useDemoMode";
import { MatrixView } from "@/components/MatrixView";
import { LlmsTxtGenerator } from "@/components/LlmsTxtGenerator";
import { makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";

const DEMO_SITE_CONTEXT = {
  id: "demo",
  domain: "https://example.com",
  name: "Demo Site",
};

export default function DashboardWidgetPage() {
  const { client, isInitialized } = useMarketplaceClient();
  const live = useSitePages(client, isInitialized);

  // Fixture data is opt-in via `?demo=1` in the URL — never auto-activated
  // by the SDK's transient un-initialized state.
  const useFixture = useDemoMode();
  const fixturePages = useMemo<PageMatrixRow[]>(
    () => (useFixture ? makeTestSitePages() : []),
    [useFixture]
  );

  const pages = useFixture ? fixturePages : live.pages;
  const siteContext = useFixture ? DEMO_SITE_CONTEXT : live.siteContext;
  const isLoading = useFixture ? false : live.isLoading;
  const error = useFixture ? null : live.error;

  const [activeTab, setActiveTab] = useState<"matrix" | "llms">("matrix");
  const [filter, setFilter] = useState<MatrixFilter>("critical");
  const [sortBy, setSortBy] = useState<MatrixSort>("score-asc");

  const filteredSorted = useMemo(() => {
    let out = pages;
    if (filter !== "all") {
      out = out.filter((p) => p.score.label === filter);
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "score-asc":
          return a.score.total - b.score.total;
        case "score-desc":
          return b.score.total - a.score.total;
        case "modified":
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [pages, filter, sortBy]);

  const handleRescan = async (row: PageMatrixRow) => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const pageUrl = `${siteContext.domain.replace(/\/+$/, "")}${row.path}`;
    try {
      await fetch(`${base}/api/rescan-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl }),
      });
    } catch (err) {
      console.error("Rescan failed:", err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white shrink-0">
        <div className="px-4 py-2 flex items-center gap-3">
          <h1 className="text-sm font-semibold">Site content health</h1>
          {siteContext.name && (
            <span className="text-xs text-gray-500 truncate">{siteContext.name}</span>
          )}
        </div>
        <nav className="px-4 flex gap-1 border-t border-gray-100" role="tablist">
          {(["matrix", "llms"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-3 py-2 border-b-2 ${
                  active
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab === "matrix" ? "Page matrix" : "LLMs.txt"}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        {error && !useFixture ? (
          <div className="px-4 py-4">
            <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
              {error}
            </div>
            <button
              onClick={live.refresh}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        ) : activeTab === "matrix" ? (
          <MatrixView
            pages={filteredSorted}
            allPages={pages}
            filter={filter}
            sortBy={sortBy}
            isLoading={isLoading}
            siteDomain={siteContext.domain}
            onFilterChange={setFilter}
            onSortChange={setSortBy}
            onRescanPage={handleRescan}
          />
        ) : (
          <LlmsTxtGenerator
            pages={pages}
            siteDomain={siteContext.domain}
            siteName={siteContext.name}
          />
        )}
      </main>
    </div>
  );
}
