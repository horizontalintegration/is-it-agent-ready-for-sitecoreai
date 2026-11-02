"use client";

import { useEffect, useMemo, useState } from "react";
import { mdiRefresh, mdiRobotOutline } from "@mdi/js";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { usePageFields } from "@/hooks/usePageFields";
import { usePageHtml } from "@/hooks/usePageHtml";
import { useScan } from "@/hooks/useScan";
import { useDemoMode } from "@/hooks/useDemoMode";
import { useScanDelta } from "@/hooks/useScoreHistory";
import { DEMO_PREVIOUS_PAGE_SCORE, makeTestDraft, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPageContext, isHomeRoute, type PageInput } from "@/lib/checks/context";
import { draftDiffersFromLive } from "@/lib/checks/draft-diff";
import { runPageChecks, runSiteChecks } from "@/lib/checks/engine";
import { rowsByCategory, toCheckRow } from "@/lib/checks/view-model";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { AppMark } from "@/components/shared/AppMark";
import { Chip } from "@/components/shared/Chips";
import { EmptyState } from "@/components/shared/EmptyState";
import { ScoreTab } from "@/components/panel/ScoreTab";
import { ScanNote } from "@/components/panel/ScanNote";
import { MetaGenerator } from "@/components/MetaGenerator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type PanelTab = "score" | "agent-view" | "assist";

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5" aria-busy="true" aria-label="Loading the page">
      <div className="flex items-center gap-3.5">
        <div className="size-[88px] animate-pulse rounded-full bg-gray-100" />
        <div className="h-10 flex-1 animate-pulse rounded bg-gray-100" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
      ))}
    </div>
  );
}

export default function PagesContextPanel() {
  const { client, isInitialized } = useMarketplaceClient();
  const {
    fields,
    scoringFields,
    pageUrl,
    route,
    templateName,
    siteDomain,
    siteName,
    editingToken,
    isLoading,
    writeContext,
    contentVersion,
  } = usePageFields(client, isInitialized);

  // Fixture data is opt-in via `?demo=1` in the URL — never auto-activated
  // by the SDK's transient un-initialized state (which flickers during the
  // Strict-Mode mount/cleanup/remount cycle and during the SDK handshake).
  const useFixture = useDemoMode();
  const fixture = useMemo(
    () => (useFixture ? makeTestPageData() : null),
    [useFixture],
  );
  const fixtureDraft = useMemo(() => (fixture ? makeTestDraft() : null), [fixture]);

  // The Page Builder draft: unsaved edits included, re-read after every field
  // update. The body checks and the AI read it; the head checks read live.
  const pageHtml = usePageHtml({
    client,
    pageKey: writeContext.pageId ? `${writeContext.pageId}|${writeContext.language}` : "",
    contentVersion,
    enabled: !fixture,
  });
  const draft = fixture ? fixtureDraft : pageHtml.draft;

  const effectiveAuthoring = fixture ? fixture.authoring : fields;
  const effectivePageUrl = fixture ? fixture.pageUrl : pageUrl;
  const effectiveSiteDomain = fixture ? "https://example.com" : siteDomain;
  const organization = useMemo(
    () => (fixture ? fixture.organization : getOrganizationInfo({ name: siteName, url: siteDomain })),
    [fixture, siteName, siteDomain],
  );

  const pageTitle = effectiveAuthoring?.pageTitle ?? "";

  // The fixture already holds the parsed HTML and AI results, so demo mode
  // doesn't scan: no fetch of the fixture URL and no paid ai-check on load.
  // The AI checks judge the draft's main text, or the live page's when
  // getPageHTML isn't available.
  const scan = useScan({
    pageUrl: fixture ? "" : pageUrl,
    siteDomain: fixture ? "" : siteDomain,
    editingToken,
    pageTitle,
    draftText: pageHtml.draft?.html.mainText ?? null,
    draftStatus: pageHtml.status,
  });

  // The page body for the meta generator: the same text the AI checks judge.
  const liveHtml = fixture ? fixture.parsedHtml : scan.parsedHtml;
  const bodyText = fixture ? (draft?.html ?? liveHtml)?.mainText ?? "" : scan.bodyText;
  const bodyPending = !fixture && !bodyText && Boolean(effectivePageUrl) && !scan.bodyReady;

  // The same context builder as the dashboard. The panel adds the draft, so
  // its body checks follow unpublished edits; head checks stay on live.
  const pageInput: PageInput = useMemo(
    () =>
      fixture
        ? { ...fixture, html: fixture.parsedHtml, draft: fixtureDraft }
        : {
            pageUrl,
            route,
            templateName,
            fields: scoringFields,
            html: scan.parsedHtml,
            draft: pageHtml.draft,
            draftUnavailable: pageHtml.status === "unavailable",
            ai: scan.ai,
            psi: scan.psi,
            organization,
          },
    [fixture, fixtureDraft, pageUrl, route, templateName, scoringFields, scan.parsedHtml, pageHtml.draft, pageHtml.status, scan.ai, scan.psi, organization],
  );

  // "Draft differs from live": compares main text, ignoring client-rendered
  // blocks (in the draft only), which every listing page would otherwise trip.
  const difference = useMemo(
    () => (draft && liveHtml ? draftDiffersFromLive(draft.html.mainText, liveHtml.mainText) : null),
    [draft, liveHtml],
  );

  // Rows wait ("Scanning…") for the first draft read as well as the live fetch.
  const isScanning = scan.isScanning || (pageHtml.status === "loading" && !pageHtml.draft);

  const rescan = () => {
    pageHtml.refresh();
    scan.runScan();
  };

  const report = useMemo(() => runPageChecks(buildPageContext(pageInput)), [pageInput]);

  // For the parity check with the dashboard (plan section 13): the score from
  // live HTML only, the dashboard's inputs (minus PageSpeed if it was run here).
  useEffect(() => {
    if (!pageInput.draft || report.score === null) return;
    const live = runPageChecks(buildPageContext({ ...pageInput, draft: null }));
    console.info(`[score] panel (draft): ${report.score} · live only, as the dashboard scores it: ${live.score}`);
  }, [pageInput, report.score]);
  const rows = useMemo(() => rowsByCategory(report.outcomes), [report]);

  // S7 is a site check, run on the home page's live HTML: it shows here only
  // when the home page is open, and isn't part of this page's score.
  const isHomePage = isHomeRoute(pageInput.route);
  const orgSchemaRow = useMemo(() => {
    if (!isHomePage || (!pageInput.html && scan.isScanning)) return null;
    const site = runSiteChecks({
      siteUrl: effectiveSiteDomain,
      siteType: "content",
      organization,
      expectedOrganization: fixture
        ? { name: fixture.organization.name, url: fixture.organization.url }
        : getConfiguredOrganization(),
      home: pageInput.html,
      robotsTxt: null,
    });
    const outcome = site.outcomes.find((o) => o.check.id === "understand.org-schema");
    return outcome ? toCheckRow(outcome) : null;
  }, [isHomePage, pageInput.html, scan.isScanning, effectiveSiteDomain, organization, fixture]);

  const showSkeleton = !fixture && isLoading;
  const [tab, setTab] = useState<PanelTab>("score");

  // "▲ N since last scan": recorded once the page, its draft and the on-demand
  // checks have settled, so a half-loaded score never becomes the baseline.
  const pageKey = fixture ? "demo" : writeContext.pageId ? `${writeContext.pageId}|${writeContext.language}` : "";
  const settled = !showSkeleton && !isScanning && !scan.isAiScanning && !scan.isPsiScanning;
  const delta = useScanDelta(
    pageKey,
    report.gate.blocked ? null : report.score,
    settled,
    fixture ? DEMO_PREVIOUS_PAGE_SCORE : undefined,
  );

  const fromDraft = Boolean(draft);
  const sourceHint = fromDraft
    ? "Scored from your Page Builder draft, unsaved edits included. Title, canonical, metadata and structured data come from the published page."
    : "Scored from the published page: the Page Builder draft isn't available.";

  const tabContent = "min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset data-[state=inactive]:hidden";
  const trigger = "h-10 border-b-0 px-2.5 text-sm font-semibold data-[state=active]:border-b-2";

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-body-bg text-body-text">
        <header className="flex shrink-0 items-center gap-2.5 border-b px-4 py-2.5">
          <AppMark />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold">Is It Agent-Ready?</h1>
          {!showSkeleton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-help rounded-full" aria-label={`${fromDraft ? "Draft" : "Live"}. ${sourceHint}`}>
                  <Chip tone={fromDraft ? "warning" : "neutral"}>{fromDraft ? "Draft" : "Live"}</Chip>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{sourceHint}</TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={rescan}
            disabled={isScanning || Boolean(fixture)}
            aria-label={isScanning ? "Scanning the page" : "Re-scan page"}
            title={fixture ? "Re-scan is off in demo mode" : isScanning ? "Scanning…" : "Re-scan page"}
          >
            <Icon path={mdiRefresh} aria-hidden className={cn("size-5", isScanning && "animate-spin")} />
          </Button>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="min-h-0 flex-1 gap-0">
          <TabsList aria-label="Panel sections" className="h-auto w-full shrink-0 justify-start gap-1 border-b px-2">
            <TabsTrigger value="score" className={trigger}>Score</TabsTrigger>
            <TabsTrigger value="agent-view" className={trigger}>Agent View</TabsTrigger>
            <TabsTrigger value="assist" className={trigger}>AI Assist</TabsTrigger>
          </TabsList>

          <TabsContent value="score" forceMount className={tabContent}>
            {showSkeleton ? (
              <SkeletonRows />
            ) : (
              <>
                <ScoreTab
                  report={report}
                  rows={rows}
                  siteRow={orgSchemaRow}
                  pageUrl={effectivePageUrl}
                  delta={delta}
                  difference={difference}
                  isScanning={isScanning}
                  isAiScanning={scan.isAiScanning}
                  isPsiScanning={scan.isPsiScanning}
                  aiStale={scan.aiStale}
                  onAiScan={scan.runAiScan}
                  onPsiScan={scan.runPsiScan}
                  onGenerate={() => setTab("assist")}
                />
                <ScanNote isScanning={isScanning} lastScannedAt={scan.lastScannedAt} demo={Boolean(fixture)} />
              </>
            )}
          </TabsContent>

          <TabsContent value="agent-view" forceMount className={tabContent}>
            <EmptyState icon={mdiRobotOutline} title="See your page the way an AI agent does">
              Coming soon: the Markdown an agent receives from this page, how many tokens it saves, and how to serve it.
            </EmptyState>
          </TabsContent>

          <TabsContent value="assist" forceMount className={tabContent}>
            <MetaGenerator
              client={client}
              writeContext={writeContext}
              current={{
                metaTitle: effectiveAuthoring?.pageTitle ?? "",
                metaDescription: effectiveAuthoring?.metaDescription ?? "",
                ogTitle: effectiveAuthoring?.ogTitle ?? "",
                ogDescription: effectiveAuthoring?.ogDescription ?? "",
              }}
              pageTitle={pageTitle}
              bodyText={bodyText}
              bodyPending={bodyPending}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
