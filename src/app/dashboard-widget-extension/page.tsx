"use client";

import { useEffect, useMemo, useState } from "react";
import { mdiChartLine } from "@mdi/js";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { useSitePages } from "@/hooks/useSitePages";
import { useDemoMode } from "@/hooks/useDemoMode";
import { SITE_TYPES, useSiteType } from "@/hooks/useSiteType";
import { useSiteHistory, type SiteSnapshot } from "@/hooks/useScoreHistory";
import { AppMark } from "@/components/shared/AppMark";
import { EmptyState } from "@/components/shared/EmptyState";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { PagesTab } from "@/components/dashboard/PagesTab";
import { AgentAccessTab } from "@/components/dashboard/AgentAccessTab";
import { FilesTab } from "@/components/dashboard/FilesTab";
import { CitationView } from "@/components/CitationView";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEMO_SITE_HISTORY_BEFORE,
  makeTestFooterTrust,
  makeTestSiteContext,
  makeTestSitePages,
} from "@/lib/rule-engine/test-fixture";
import { aggregateSite } from "@/lib/site-aggregate";
import { runSiteChecks } from "@/lib/checks/engine";
import { groupPageIssues, siteIssueGroups, type IssueGroup } from "@/lib/checks/view-model";
import type { SiteType } from "@/lib/checks/types";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPagesEditorUrl } from "@/lib/pages-editor-url";
import { timeAgo } from "@/lib/relative-time";
import type { PageMatrixRow } from "@/types/dashboard";

type DashboardTab = "overview" | "pages" | "agent-access" | "citations" | "files";

const TABS: DashboardTab[] = ["overview", "pages", "agent-access", "citations", "files"];

/** The tab named in the URL hash (e.g. #agent-access), if any. */
function hashTab(): DashboardTab | null {
  const hash = window.location.hash.slice(1) as DashboardTab;
  return TABS.includes(hash) ? hash : null;
}

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
  const fixtureSite = useMemo(() => (useFixture ? makeTestSiteContext() : null), [useFixture]);

  const pages = useFixture ? fixturePages : live.pages;
  const siteContext = useFixture ? DEMO_SITE_CONTEXT : live.siteContext;
  const isLoading = useFixture ? false : live.isLoading;
  const error = useFixture ? null : live.error;
  const scanningCount = useFixture ? 0 : live.scanningCount;
  const robotsTxt = fixtureSite ? fixtureSite.robotsTxt : live.siteInputs.robotsTxt;

  const [siteType, setSiteType] = useSiteType(siteContext.id);
  const [tab, setTab] = useState<DashboardTab>("overview");
  // Read after mount, so the server render and hydration agree.
  useEffect(() => {
    const t = hashTab();
    if (t) setTab(t);
  }, []);
  const [issueFilter, setIssueFilter] = useState<IssueGroup | null>(null);

  // Site checks (S2, S7): once per site, from robots.txt and the home page.
  const { siteInputs } = live;
  const siteReport = useMemo(() => {
    if (fixtureSite) return runSiteChecks({ ...fixtureSite, siteType });
    if (!siteContext.domain || !siteInputs.homeChecked) return null;
    return runSiteChecks({
      siteUrl: siteContext.domain,
      siteType,
      organization: getOrganizationInfo({ name: siteContext.name, url: siteContext.domain }),
      expectedOrganization: getConfiguredOrganization(),
      home: siteInputs.homeHtml,
      robotsTxt: siteInputs.robotsTxt,
    });
  }, [fixtureSite, siteType, siteContext.domain, siteContext.name, siteInputs]);

  const aggregate = useMemo(() => aggregateSite(pages), [pages]);
  const siteScore = aggregate.overallPct === null ? null : Math.round(aggregate.overallPct);

  // Fix first: site issues (they affect every page), then page issues by total gain.
  const issues = useMemo(
    () => [...(siteReport ? siteIssueGroups(siteReport.outcomes) : []), ...groupPageIssues(pages)],
    [siteReport, pages],
  );

  const demoHistory = useMemo<SiteSnapshot[] | undefined>(
    () => (useFixture && siteScore !== null
      ? [...DEMO_SITE_HISTORY_BEFORE, siteScore].map((score) => ({ at: "", score }))
      : undefined),
    [useFixture, siteScore],
  );
  const history = useSiteHistory(siteContext.id, siteScore, scanningCount, demoHistory);

  const lastScan = useMemo(() => {
    const times = pages.map((p) => (p.lastScannedAt ? Date.parse(p.lastScannedAt) : NaN)).filter(Number.isFinite);
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [pages]);

  const handleScanRow = (row: PageMatrixRow) => {
    if (useFixture) return;
    live.scanRow(row.id);
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

  const reviewPages = (issue: IssueGroup) => {
    setIssueFilter(issue);
    setTab("pages");
  };

  const siteHost = siteContext.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const tabContent = "min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset data-[state=inactive]:hidden";
  const trigger = "h-11 border-b-0 px-1 text-md font-semibold data-[state=active]:border-b-2";

  // The page list failed to load: Overview and Pages need it; the other tabs
  // only need the domain (set before the GraphQL call), so they stay usable.
  const loadError = error && !useFixture ? (
    <div className="mx-auto flex max-w-[1320px] flex-col items-start gap-3 p-4 sm:p-6">
      <p role="alert" className="rounded-lg border border-warning-bg-active bg-warning-bg px-3 py-2 text-md text-warning-fg">{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={live.refresh}>Retry</Button>
    </div>
  ) : null;

  return (
    <div className="flex h-screen flex-col bg-subtle-bg text-body-text">
      <Tabs value={tab} onValueChange={(v) => setTab(v as DashboardTab)} className="min-h-0 flex-1 gap-0">
        <header className="shrink-0 border-b bg-body-bg">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-1.5 px-4 pt-3.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <AppMark size={32} />
              <div className="flex min-w-0 flex-col">
                <h1 className="text-lg font-bold">Is It Agent-Ready?</h1>
                {siteContext.name && (
                  <span className="truncate text-sm text-subtle-text">
                    {siteContext.name}
                    {siteHost && ` · ${siteHost}`}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
                <span id="site-type-label" className="text-sm text-subtle-text">Site type</span>
                <Select value={siteType} onValueChange={(v) => setSiteType(v as SiteType)}>
                  <SelectTrigger aria-labelledby="site-type-label" className="h-10 text-sm font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-subtle-text">
                  {useFixture ? "Demo data" : scanningCount > 0 ? "Scanning…" : lastScan ? `Last scan ${timeAgo(lastScan)}` : "Not scanned yet"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="text-sm"
                  onClick={live.clearAndRefresh}
                  disabled={useFixture || scanningCount > 0 || isLoading}
                  title={useFixture ? "Scanning is off in demo mode" : "Rescan every page"}
                >
                  Scan site
                </Button>
              </div>
            </div>
            <TabsList aria-label="Dashboard sections" className="h-auto w-full justify-start gap-6 overflow-x-auto">
              <TabsTrigger value="overview" className={trigger}>Overview</TabsTrigger>
              <TabsTrigger value="pages" className={trigger}>Pages</TabsTrigger>
              <TabsTrigger value="agent-access" className={trigger}>Agent access</TabsTrigger>
              <TabsTrigger value="citations" className={trigger}>AI citations</TabsTrigger>
              <TabsTrigger value="files" className={trigger}>Files</TabsTrigger>
            </TabsList>
          </div>
        </header>

        <TabsContent value="overview" className={tabContent}>
          {loadError ?? (
            <OverviewTab
              aggregate={aggregate}
              pages={pages}
              siteUrl={siteContext.domain}
              isLoading={isLoading}
              issues={issues}
              history={history.map((h) => h.score)}
              onReviewPages={reviewPages}
            />
          )}
        </TabsContent>

        <TabsContent value="pages" className={tabContent}>
          {loadError ?? (
            <PagesTab
              pages={pages}
              issue={issueFilter}
              onClearIssue={() => setIssueFilter(null)}
              onOpenPage={handleOpenPage}
              onScanRow={handleScanRow}
            />
          )}
        </TabsContent>

        <TabsContent value="agent-access" className={tabContent}>
          <AgentAccessTab
            siteUrl={siteContext.domain}
            report={siteReport}
            robotsTxt={robotsTxt}
            demoFooter={useFixture ? makeTestFooterTrust() : null}
            onOpenFiles={() => setTab("files")}
          />
        </TabsContent>

        <TabsContent value="citations" className={tabContent}>
          <div className="mx-auto max-w-[1320px] p-2 sm:p-4">
            {pages.length === 0 && !siteContext.domain ? (
              <EmptyState icon={mdiChartLine} title="AI citations">
                Check how often AI answers cite your pages, once your pages have loaded.
              </EmptyState>
            ) : (
              <CitationView pages={pages} siteDomain={siteContext.domain} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="files" className={tabContent}>
          <FilesTab
            pages={pages}
            siteUrl={siteContext.domain}
            siteName={siteContext.name}
            robotsTxt={robotsTxt}
            onOpenAgentAccess={() => setTab("agent-access")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
