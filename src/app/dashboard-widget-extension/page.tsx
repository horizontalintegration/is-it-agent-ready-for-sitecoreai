"use client";

import { useMemo, useState } from "react";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { useSitePages } from "@/hooks/useSitePages";
import { useDemoMode } from "@/hooks/useDemoMode";
import { MatrixView } from "@/components/MatrixView";
import { LlmsTxtGenerator } from "@/components/LlmsTxtGenerator";
import { RobotsTxtPanel } from "@/components/RobotsTxtPanel";
import { FooterTrustPanel } from "@/components/FooterTrustPanel";
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

  // Fixture data is opt-in via `?demo=1` in the URL.
  const useFixture = useDemoMode();
  const fixturePages = useMemo<PageMatrixRow[]>(
    () => (useFixture ? makeTestSitePages() : []),
    [useFixture],
  );

  const pages = useFixture ? fixturePages : live.pages;
  const siteContext = useFixture ? DEMO_SITE_CONTEXT : live.siteContext;
  const isLoading = useFixture ? false : live.isLoading;
  const error = useFixture ? null : live.error;
  const scanningCount = useFixture ? 0 : live.scanningCount;

  const [activeTab, setActiveTab] = useState<"matrix" | "llms" | "robots" | "footer">("matrix");
  const [filter, setFilter] = useState<MatrixFilter>("critical");
  const [sortBy, setSortBy] = useState<MatrixSort>("score-asc");

  const filteredSorted = useMemo(() => {
    let out = pages;
    if (filter !== "all") {
      // Unscanned rows are excluded from label filters; visible only under "all".
      out = out.filter((p) => p.score?.label === filter);
    }
    // Sort by normalized readiness (total / maxTotal), matching the percentage
    // shown in the matrix — raw totals aren't comparable since maxTotal varies per page.
    const pctOf = (p: (typeof out)[number]) =>
      p.score && p.score.maxTotal > 0 ? p.score.total / p.score.maxTotal : -1;
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "score-asc":
          return pctOf(a) - pctOf(b);
        case "score-desc":
          return pctOf(b) - pctOf(a);
        case "modified":
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [pages, filter, sortBy]);

  const handleScanRow = (row: PageMatrixRow) => {
    if (useFixture) return;
    live.scanRow(row.id);
  };

  const handleScanAll = () => {
    if (useFixture) return;
    live.scanAll();
  };

  const handleClearAndRefresh = () => {
    if (useFixture) return;
    live.clearAndRefresh();
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
          {(["matrix", "llms", "robots", "footer"] as const).map((tab) => {
            const active = activeTab === tab;
            const label =
              tab === "matrix"
                ? "Page matrix"
                : tab === "llms"
                  ? "LLMs.txt"
                  : tab === "robots"
                    ? "Robots.txt"
                    : "Footer trust";
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
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* The page-enumeration error only blocks the Page matrix tab. Robots,
            Footer, and LLMs.txt rely on siteContext.domain (set before the
            GraphQL call), so they stay usable even when enumeration fails. */}
        {activeTab === "matrix" ? (
          error && !useFixture ? (
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
          ) : (
            <MatrixView
              pages={filteredSorted}
              allPages={pages}
              filter={filter}
              sortBy={sortBy}
              isLoading={isLoading}
              scanningCount={scanningCount}
              onFilterChange={setFilter}
              onSortChange={setSortBy}
              onScanRow={handleScanRow}
              onScanAll={handleScanAll}
              onClearAndRefresh={handleClearAndRefresh}
            />
          )
        ) : activeTab === "llms" ? (
          <LlmsTxtGenerator
            pages={pages}
            siteDomain={siteContext.domain}
            siteName={siteContext.name}
          />
        ) : activeTab === "robots" ? (
          <RobotsTxtPanel siteDomain={siteContext.domain} />
        ) : (
          <FooterTrustPanel siteDomain={siteContext.domain} />
        )}
      </main>
    </div>
  );
}
