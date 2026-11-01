"use client";

import { useMemo, useState } from "react";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { useSitePages } from "@/hooks/useSitePages";
import { useDemoMode } from "@/hooks/useDemoMode";
import { useSiteType } from "@/hooks/useSiteType";
import { AllPagesView } from "@/components/AllPagesView";
import { SiteSummary } from "@/components/SiteSummary";
import { CategoryCards } from "@/components/CategoryCards";
import { WorstPages } from "@/components/WorstPages";
import { CitationView } from "@/components/CitationView";
import { LlmsTxtGenerator } from "@/components/LlmsTxtGenerator";
import { RobotsTxtPanel } from "@/components/RobotsTxtPanel";
import { FooterTrustPanel } from "@/components/FooterTrustPanel";
import { SiteChecks } from "@/components/SiteChecks";
import { makeTestSiteContext, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import { aggregateSite, pageScore, worstPages } from "@/lib/site-aggregate";
import { runSiteChecks } from "@/lib/checks/engine";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPagesEditorUrl } from "@/lib/pages-editor-url";
import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";

const WORST_LIMIT = 10;

const DEMO_SITE_CONTEXT = {
  id: "demo",
  domain: "https://example.com",
  name: "Demo Site",
  organization: "",
  tenantName: "",
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

  const [siteType, setSiteType] = useSiteType(siteContext.id);

  // Site checks (S2, S7): once per site, from robots.txt and the home page.
  const { siteInputs } = live;
  const siteReport = useMemo(() => {
    if (useFixture) return runSiteChecks({ ...makeTestSiteContext(), siteType });
    if (!siteContext.domain || !siteInputs.homeChecked) return null;
    return runSiteChecks({
      siteUrl: siteContext.domain,
      siteType,
      organization: getOrganizationInfo({ name: siteContext.name, url: siteContext.domain }),
      expectedOrganization: getConfiguredOrganization(),
      home: siteInputs.homeHtml,
      robotsTxt: siteInputs.robotsTxt,
    });
  }, [useFixture, siteType, siteContext.domain, siteContext.name, siteInputs]);

  const [activeTab, setActiveTab] = useState<"matrix" | "citation" | "llms" | "robots" | "footer">("matrix");
  const [filter, setFilter] = useState<MatrixFilter>("critical");
  const [sortBy, setSortBy] = useState<MatrixSort>("score-asc");
  const [showAllPages, setShowAllPages] = useState(false);

  // Site roll-up + "fix these first" list for the Overview.
  const aggregate = useMemo(() => aggregateSite(pages), [pages]);
  const worst = useMemo(() => worstPages(pages, WORST_LIMIT), [pages]);

  const filteredSorted = useMemo(() => {
    let out = pages;
    if (filter !== "all") {
      // Unscanned rows are excluded from label filters; visible only under "all".
      out = out.filter((p) => p.score?.label === filter);
    }
    // Unscanned and blocked pages have no score and sort last (score ↓) / first (score ↑).
    const pctOf = (p: (typeof out)[number]) => pageScore(p) ?? -1;
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

  // Hand off to the Pages editor for the chosen item. Falls back to the public
  // page URL when the deep-link params aren't available (e.g. demo mode).
  const handleOpenPage = async (row: PageMatrixRow) => {
    const editorUrl = buildPagesEditorUrl({
      tenantName: siteContext.tenantName,
      organization: siteContext.organization,
      itemId: row.id,
      site: siteContext.name,
      lang: "en",
    });
    console.log("[openPage] deep-link params →", {
      tenantName: siteContext.tenantName,
      organization: siteContext.organization,
      site: siteContext.name,
      itemId: row.id,
      editorUrl,
      fallbackPageUrl: row.pageUrl,
    });
    const target = editorUrl ?? row.pageUrl;
    if (!target) return;
    try {
      if (client && !useFixture) {
        await client.navigateToExternalUrl(target, true);
      } else {
        window.open(target, "_blank", "noopener");
      }
    } catch {
      window.open(target, "_blank", "noopener");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white shrink-0">
        <div className="px-4 py-2 flex items-center gap-3">
          <h1 className="text-sm font-semibold">Is this site agent-ready?</h1>
          {siteContext.name && (
            <span className="text-xs text-gray-500 truncate">{siteContext.name}</span>
          )}
        </div>
        <nav className="px-4 flex gap-1 border-t border-gray-100" role="tablist">
          {(["matrix", "citation", "llms", "robots", "footer"] as const).map((tab) => {
            const active = activeTab === tab;
            const label =
              tab === "matrix"
                ? "Overview"
                : tab === "citation"
                  ? "AI Citation"
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
        {/* The page-enumeration error only blocks the Overview tab. Robots,
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
            <>
              <div className="px-4 py-3 space-y-4">
                <SiteSummary aggregate={aggregate} isLoading={isLoading} />
                <CategoryCards categories={aggregate.categories} />
                <SiteChecks report={siteReport} siteType={siteType} onSiteTypeChange={setSiteType} />
                <WorstPages
                  pages={worst}
                  scannedCount={aggregate.scannedCount}
                  totalCount={aggregate.totalCount}
                  showingAll={showAllPages}
                  onOpenPage={handleOpenPage}
                  onToggleAll={() => setShowAllPages((v) => !v)}
                />
              </div>
              {showAllPages && (
                <div className="border-t border-gray-200">
                  <AllPagesView
                    pages={filteredSorted}
                    allPages={pages}
                    filter={filter}
                    sortBy={sortBy}
                    scanningCount={scanningCount}
                    onFilterChange={setFilter}
                    onSortChange={setSortBy}
                    onScanRow={handleScanRow}
                    onScanAll={handleScanAll}
                    onClearAndRefresh={handleClearAndRefresh}
                    onOpenPage={handleOpenPage}
                  />
                </div>
              )}
            </>
          )
        ) : activeTab === "citation" ? (
          <CitationView pages={pages} siteDomain={siteContext.domain} />
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
