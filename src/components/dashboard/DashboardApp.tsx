"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { mdiChartLine } from "@mdi/js";
import { toast } from "sonner";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { useSitePages } from "@/hooks/useSitePages";
import { useAgentAccess } from "@/hooks/useAgentAccess";
import { useDemoMode, useDemoServesMarkdown, useStandaloneDomain } from "@/hooks/useDemoMode";
import { SITE_TYPES, useSiteType } from "@/hooks/useSiteType";
import { useSiteHistory, type SiteSnapshot } from "@/hooks/useScoreHistory";
import { useWhatChanged } from "@/hooks/useWhatChanged";
import { AppMark } from "@/components/shared/AppMark";
import { BulkMetaDialog } from "@/components/dashboard/BulkMetaDialog";
import { WriteConfirmProvider } from "@/components/shared/WriteConfirm";
import { demoAnswers } from "@/lib/assist/demo";
import { EmptyState } from "@/components/shared/EmptyState";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { PagesTab } from "@/components/dashboard/PagesTab";
import { AgentAccessTab } from "@/components/dashboard/AgentAccessTab";
import { FilesTab } from "@/components/dashboard/FilesTab";
import { CitationsTab } from "@/components/dashboard/CitationsTab";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEMO_CITATION_PAGE_ID,
  DEMO_SITE_HISTORY_BEFORE,
  makeTestCitationDemo,
  makeTestSiteContext,
  makeTestAssist,
  makeTestSitePages,
  makeTestWhatChanged,
} from "@/lib/rule-engine/test-fixture";
import { botGrid } from "@/lib/agent-access/grid";
import { aggregateSite } from "@/lib/site-aggregate";
import { runSiteChecks } from "@/lib/checks/engine";
import { fixFirstGroups, type IssueGroup } from "@/lib/checks/view-model";
import type { SiteType } from "@/lib/checks/types";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPagesEditorUrl, tenantNameFromHostState } from "@/lib/pages-editor-url";
import { timeAgo } from "@/lib/relative-time";
import { LimitBanner } from "@/components/shared/LimitBanner";
import type { SiteOption } from "@/lib/sitecore/sites";
import type { PageMatrixRow } from "@/types/dashboard";

type DashboardTab = "overview" | "pages" | "agent-access" | "citations" | "files";

const TABS: DashboardTab[] = ["overview", "pages", "agent-access", "citations", "files"];

/** The tab named in the URL hash (e.g. #agent-access), if any. */
function hashTab(): DashboardTab | null {
  const hash = window.location.hash.slice(1) as DashboardTab;
  return TABS.includes(hash) ? hash : null;
}

/** The standalone dashboard's page list: stable, so memos don't re-run. */
const NO_PAGES: PageMatrixRow[] = [];

const DEMO_SITE_CONTEXT = {
  id: "demo",
  domain: "https://example.com",
  name: "BrandX",
  organization: "",
  tenantName: "",
};

interface DashboardAppProps {
  client: ClientSDK | null;
  isInitialized: boolean;
  /**
   * The site to show. Left out, the dashboard follows `site.context` (the
   * widget). The full-screen app passes the picked site, null until there is
   * one. Demo mode and `?domain=` ignore it.
   */
  site?: SiteOption | null;
  /** Replaces the site name under the title (the full-screen site picker). */
  sitePicker?: ReactNode;
  /** Shown in place of Overview and Pages when the site list failed. */
  siteError?: ReactNode;
  /**
   * Open in Page Builder through window.open: the full-screen host doesn't
   * implement navigateToExternalUrl (SPIKE-FINDINGS §11).
   */
  openPagesInNewTab?: boolean;
}

/**
 * The dashboard: header, Overview, Pages, Agent access, AI citations and
 * Files. Shared by the dashboard widget and the full-screen app (Phase 14).
 */
export function DashboardApp({ client, isInitialized, site, sitePicker, siteError, openPagesInNewTab = false }: DashboardAppProps) {
  const live = useSitePages(client, isInitialized, site);

  // Fixture data is opt-in via `?demo=1` in the URL.
  // `&md=1`: the demo site serves Markdown (P5 4/4, S3 passes).
  const useFixture = useDemoMode();
  const demoServesMarkdown = useDemoServesMarkdown();
  const fixturePages = useMemo<PageMatrixRow[]>(
    () => (useFixture ? makeTestSitePages({ servesMarkdown: demoServesMarkdown }) : []),
    [useFixture, demoServesMarkdown],
  );
  const fixtureSite = useMemo(
    () => (useFixture ? makeTestSiteContext({ servesMarkdown: demoServesMarkdown }) : null),
    [useFixture, demoServesMarkdown],
  );

  // `?domain=` outside Sitecore: the site checks and AI citations for that
  // domain, with no Marketplace client and so no page list.
  const standalone = useStandaloneDomain();
  const standaloneSite = useMemo(() => {
    const host = standalone.replace(/^https?:\/\//, "");
    return { id: standalone ? `standalone:${host}` : "", domain: standalone, name: host, organization: "", tenantName: "" };
  }, [standalone]);
  const offline = useFixture || Boolean(standalone);

  const pages = useFixture ? fixturePages : standalone ? NO_PAGES : live.pages;
  const siteContext = useFixture ? DEMO_SITE_CONTEXT : standalone ? standaloneSite : live.siteContext;
  const isLoading = offline ? false : live.isLoading;
  const error = offline ? null : live.error;
  const scanningCount = offline ? 0 : live.scanningCount;
  // S1–S12's data: once per domain (cached an hour), the fixture in demo mode.
  const agentAccess = useAgentAccess(useFixture ? "" : siteContext.domain, fixtureSite?.access ?? null);
  const access = agentAccess.data;

  const [siteType, setSiteType] = useSiteType(siteContext.id);
  const [tab, setTab] = useState<DashboardTab>("overview");
  // Read after mount, so the server render and hydration agree.
  useEffect(() => {
    const t = hashTab();
    if (t) setTab(t);
  }, []);
  const [issueFilter, setIssueFilter] = useState<IssueGroup | null>(null);

  const aggregate = useMemo(() => aggregateSite(pages), [pages]);

  // Site checks (S1–S12): once per site, from the agent-access scan. S7 reads
  // the home page the scan fetched; S3 adds how many scanned pages serve Markdown.
  const markdownPages = aggregate.markdown;
  const siteReport = useMemo(() => {
    if (fixtureSite) return runSiteChecks({ ...fixtureSite, siteType, markdownPages });
    if (!siteContext.domain || !access) return null;
    return runSiteChecks({
      siteUrl: siteContext.domain,
      siteType,
      organization: getOrganizationInfo({ name: siteContext.name, url: siteContext.domain }),
      expectedOrganization: getConfiguredOrganization(),
      home: access.home.html,
      access,
      markdownPages,
    });
  }, [fixtureSite, siteType, siteContext.domain, siteContext.name, access, markdownPages]);
  const siteScore = aggregate.overallPct === null ? null : Math.round(aggregate.overallPct);

  // Fix first: site issues (they affect every page), then page issues by total
  // gain; Markdown once, as P5 with its page count when pages were checked.
  const issues = useMemo(
    () => fixFirstGroups(siteReport?.outcomes ?? null, pages),
    [siteReport, pages],
  );

  const demoHistory = useMemo<SiteSnapshot[] | undefined>(
    () => (useFixture && siteScore !== null
      ? [...DEMO_SITE_HISTORY_BEFORE, siteScore].map((score) => ({ at: "", score }))
      : undefined),
    [useFixture, siteScore],
  );
  const history = useSiteHistory(siteContext.id, siteScore, scanningCount, demoHistory);

  const botRows = useMemo(() => (access ? botGrid(access) : null), [access]);
  const demoChanges = useMemo(
    () => (useFixture && fixtureSite?.access ? makeTestWhatChanged(fixturePages, siteScore, fixtureSite.access) : undefined),
    [useFixture, fixtureSite, fixturePages, siteScore],
  );
  const changes = useWhatChanged({
    siteId: siteContext.id,
    siteUrl: siteContext.domain,
    pages,
    siteScore,
    scanningCount,
    botRows,
    accessCheckedAt: access?.checkedAt ?? null,
    demo: demoChanges,
  });
  const citationDemo = useMemo(() => (useFixture ? makeTestCitationDemo() : null), [useFixture]);

  const lastScan = useMemo(() => {
    const times = pages.map((p) => (p.lastScannedAt ? Date.parse(p.lastScannedAt) : NaN)).filter(Number.isFinite);
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [pages]);

  const handleScanRow = (row: PageMatrixRow) => {
    if (offline) return;
    live.scanRow(row.id);
  };

  // Hand off to the Pages editor for the chosen item. Falls back to the public
  // page URL when the deep-link params aren't available. Demo mode stays in the
  // app, so it works offline: the demo article opens the panel's demo, and the
  // other rows say what would happen.
  const handleOpenPage = async (row: PageMatrixRow) => {
    if (useFixture) {
      if (row.id === DEMO_CITATION_PAGE_ID) window.open(`${window.location.origin}/pages-contextpanel-extension?demo=1`, "_blank", "noopener");
      else toast.info(`Demo: in SitecoreAI this opens "${row.name}" in Page Builder.`);
      return;
    }
    // The host may fill in host.state after the dashboard's first read, so
    // ask again when the tenant name is still missing.
    let tenantName = siteContext.tenantName;
    if (!tenantName && client && !useFixture) {
      try {
        tenantName = tenantNameFromHostState((await client.query("host.state"))?.data);
      } catch (err) {
        console.warn("[openPage] host.state query failed:", err);
      }
    }
    const editorUrl = buildPagesEditorUrl({
      tenantName,
      organization: siteContext.organization,
      itemId: row.id,
      site: siteContext.name,
      lang: "en",
    });
    console.log("[openPage] deep-link params →", {
      tenantName,
      organization: siteContext.organization,
      site: siteContext.name,
      itemId: row.id,
      editorUrl,
      fallbackPageUrl: row.pageUrl,
    });
    const target = editorUrl ?? row.pageUrl;
    if (!target) return;
    try {
      if (client && !useFixture && !openPagesInNewTab) {
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

  // "Generate for all" (Phase 9). Demo mode uses the fixture's suggestions and
  // writes nothing; the standalone dashboard has no pages, so no such row.
  const [bulkIssue, setBulkIssue] = useState<IssueGroup | null>(null);
  const bulkDemo = useMemo(() => (useFixture ? demoAnswers(makeTestAssist()) : null), [useFixture]);
  const bulkPages = useMemo(() => (bulkIssue ? pages.filter((p) => bulkIssue.pageIds.includes(p.id)) : []), [bulkIssue, pages]);
  const writeClient = offline ? null : client;

  const siteHost = siteContext.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const tabContent = "min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset data-[state=inactive]:hidden";
  const trigger = "h-11 border-b-0 px-1 text-md font-semibold data-[state=active]:border-b-2";

  // The page list failed to load: Overview and Pages need it; the other tabs
  // only need the domain (set before the GraphQL call), so they stay usable.
  // Full screen: no site to list (the site list failed or has no usable site).
  const loadError = siteError && !offline ? (
    <div className="mx-auto flex max-w-[1600px] flex-col items-start gap-3 p-4 sm:p-6">{siteError}</div>
  ) : error && !useFixture ? (
    <div className="mx-auto flex max-w-[1600px] flex-col items-start gap-3 p-4 sm:p-6">
      <p role="alert" className="rounded-lg border border-warning-bg-active bg-warning-bg px-3 py-2 text-md text-warning-fg">{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={live.refresh}>Retry</Button>
    </div>
  ) : null;

  return (
    <WriteConfirmProvider client={writeClient} contextId={offline ? undefined : live.siteContext.sitecoreContextId || undefined} demo={useFixture}>
    <div className="flex h-screen flex-col bg-subtle-bg text-body-text">
      <Tabs value={tab} onValueChange={(v) => setTab(v as DashboardTab)} className="min-h-0 flex-1 gap-0">
        <header className="shrink-0 border-b bg-body-bg">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-1.5 px-4 pt-3.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <AppMark size={32} />
              <div className="flex min-w-0 flex-col">
                <h1 className="text-lg font-bold">Is It Agent-Ready?</h1>
                {sitePicker ?? (siteContext.name && (
                  <span className="truncate text-sm text-subtle-text">
                    {siteContext.name}
                    {siteHost && siteHost !== siteContext.name && ` · ${siteHost}`}
                  </span>
                ))}
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
                  {useFixture ? "Demo data" : standalone ? "Outside Sitecore: site checks only" : scanningCount > 0 ? "Scanning…" : lastScan ? `Last scan ${timeAgo(lastScan)}` : "Not scanned yet"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="text-sm"
                  onClick={() => {
                    if (!standalone) live.clearAndRefresh();
                    agentAccess.refresh();
                  }}
                  disabled={useFixture || scanningCount > 0 || isLoading}
                  title={useFixture ? "Scanning is off in demo mode" : standalone ? "Check the site again" : "Rescan every page"}
                >
                  Scan site
                </Button>
              </div>
            </div>
            <LimitBanner className="mt-2" />
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
              changes={changes}
              onReviewPages={reviewPages}
              onGenerateAll={setBulkIssue}
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
            access={access}
            status={agentAccess.status}
            onRetry={agentAccess.refresh}
            onOpenFiles={() => setTab("files")}
          />
        </TabsContent>

        <TabsContent value="citations" className={tabContent}>
          {pages.length === 0 && !siteContext.domain ? (
            <div className="mx-auto max-w-[1600px] p-2 sm:p-4">
              <EmptyState icon={mdiChartLine} title="AI citations">
                Check how often AI answers cite your pages, once your pages have loaded.
              </EmptyState>
            </div>
          ) : (
            <CitationsTab
              pages={pages}
              siteUrl={siteContext.domain}
              botRows={botRows}
              demo={citationDemo}
              initialPageId={useFixture ? DEMO_CITATION_PAGE_ID : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="files" className={tabContent}>
          <FilesTab
            pages={pages}
            siteUrl={siteContext.domain}
            siteName={siteContext.name}
            access={access}
            onOpenAgentAccess={() => setTab("agent-access")}
          />
        </TabsContent>
      </Tabs>
    </div>
    <BulkMetaDialog
      open={Boolean(bulkIssue)}
      onOpenChange={(o) => !o && setBulkIssue(null)}
      pages={bulkPages}
      demo={bulkDemo}
      hasClient={Boolean(writeClient)}
    />
    </WriteConfirmProvider>
  );
}
