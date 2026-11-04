"use client";

import { useEffect, useMemo, useState } from "react";
import { mdiRefresh } from "@mdi/js";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { usePageFields } from "@/hooks/usePageFields";
import { usePageHtml } from "@/hooks/usePageHtml";
import { useScan } from "@/hooks/useScan";
import { useAgentAccess } from "@/hooks/useAgentAccess";
import { useDemoMode, useDemoServesMarkdown } from "@/hooks/useDemoMode";
import { useMarkdownCheck } from "@/hooks/useMarkdownCheck";
import { useScanDelta } from "@/hooks/useScoreHistory";
import { DEMO_PREVIOUS_PAGE_SCORE, makeTestAgentAccess, makeTestAssist, makeTestDraft, makeTestMarkdownCheck, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPageContext, isHomeRoute, type PageInput } from "@/lib/checks/context";
import { draftDiffersFromLive } from "@/lib/checks/draft-diff";
import { runPageChecks, runSiteChecks } from "@/lib/checks/engine";
import { rowsByCategory, toCheckRow } from "@/lib/checks/view-model";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { AppMark } from "@/components/shared/AppMark";
import { Chip } from "@/components/shared/Chips";
import { AgentViewTab } from "@/components/panel/AgentViewTab";
import { ScoreTab } from "@/components/panel/ScoreTab";
import { ScanNote } from "@/components/panel/ScanNote";
import { AssistTab } from "@/components/panel/AssistTab";
import { WriteConfirmProvider } from "@/components/shared/WriteConfirm";
import { demoAnswers } from "@/lib/assist/demo";
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
    faqSources,
    datasources,
    fieldValues,
    refetch: refetchFields,
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
    editingToken,
    pageTitle,
    draftText: pageHtml.draft?.html.mainText ?? null,
    draftStatus: pageHtml.status,
  });

  // P5/P6: the published page requested as an agent and as a browser. Demo
  // mode uses a fixture: a page without Markdown, or with it for `&md=1`.
  const demoServesMarkdown = useDemoServesMarkdown();
  const demoMarkdown = useMemo(
    () => (fixture ? makeTestMarkdownCheck({ serves: demoServesMarkdown }) : null),
    [fixture, demoServesMarkdown],
  );
  const markdownCheck = useMarkdownCheck(fixture ? "" : pageUrl, demoMarkdown);

  // The page body for the meta generator: the same text the AI checks judge.
  const liveHtml = fixture ? fixture.parsedHtml : scan.parsedHtml;
  const bodyText = fixture ? (draft?.html ?? liveHtml)?.mainText ?? "" : scan.bodyText;
  const bodyPending = !fixture && !bodyText && Boolean(effectivePageUrl) && !scan.bodyReady;

  // The same context builder as the dashboard. The panel adds the draft, so
  // its body checks follow unpublished edits; head checks stay on live.
  const pageInput: PageInput = useMemo(
    () =>
      fixture
        ? { ...fixture, html: fixture.parsedHtml, draft: fixtureDraft, markdown: demoMarkdown }
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
            markdown: markdownCheck.data,
            organization,
          },
    [fixture, fixtureDraft, demoMarkdown, pageUrl, route, templateName, scoringFields, scan.parsedHtml, pageHtml.draft, pageHtml.status, scan.ai, scan.psi, markdownCheck.data, organization],
  );

  // "Draft differs from live": compares main text, ignoring client-rendered
  // blocks (in the draft only), which every listing page would otherwise trip.
  const difference = useMemo(
    () => (draft && liveHtml ? draftDiffersFromLive(draft.html.mainText, liveHtml.mainText) : null),
    [draft, liveHtml],
  );

  // Rows wait ("Scanning…") for the first draft read as well as the live
  // fetch, and for the Markdown requests (P5 is Essential).
  const isScanning =
    scan.isScanning || (pageHtml.status === "loading" && !pageHtml.draft) || markdownCheck.status === "loading";

  const rescan = () => {
    pageHtml.refresh();
    scan.runScan();
    markdownCheck.refresh();
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
  const p5Row = useMemo(() => rows.read.find((r) => r.id === "read.markdown-page") ?? null, [rows]);

  // Site checks, from the same agent-access scan as the dashboard (cached an
  // hour per domain, so page changes don't rescan the site). None is part of
  // this page's score.
  const demoAccess = useMemo(() => (fixture ? makeTestAgentAccess({ servesMarkdown: demoServesMarkdown }) : null), [fixture, demoServesMarkdown]);
  const siteAccess = useAgentAccess(fixture ? "" : siteDomain, demoAccess);
  const isHomePage = isHomeRoute(pageInput.route);
  const siteReport = useMemo(
    () =>
      runSiteChecks({
        siteUrl: effectiveSiteDomain,
        siteType: "content",
        organization,
        expectedOrganization: fixture
          ? { name: fixture.organization.name, url: fixture.organization.url }
          : getConfiguredOrganization(),
        // S7 reads the open page when it's the home page, so it follows a re-scan.
        home: isHomePage ? pageInput.html : siteAccess.data?.home.html ?? null,
        access: siteAccess.data,
      }),
    [effectiveSiteDomain, organization, fixture, isHomePage, pageInput.html, siteAccess.data],
  );

  // S7 shows here only when the home page is open.
  const orgSchemaRow = useMemo(() => {
    if (!isHomePage || (!pageInput.html && scan.isScanning)) return null;
    const outcome = siteReport.outcomes.find((o) => o.check.id === "understand.org-schema");
    return outcome ? toCheckRow(outcome) : null;
  }, [isHomePage, pageInput.html, scan.isScanning, siteReport]);

  // "Site issues affecting this page": the failing Reach checks that keep
  // agents out of every page (S1 firewall, S2 robots.txt).
  const siteIssues = useMemo(
    () => siteReport.outcomes.map(toCheckRow).filter((r) => r.category === "reach" && r.tier === "essential" && r.display === "fix"),
    [siteReport],
  );

  // Opens the dashboard on its Agent access tab (it reads the tab from the hash).
  // The link opens the app's route in a new tab, outside the Sitecore host, so
  // it passes the site as `?domain=` for the standalone dashboard (plan
  // section 13, item 10). Demo mode stays on this origin, so it works offline.
  const openDashboard = async () => {
    const base = (!fixture && process.env.NEXT_PUBLIC_APP_URL) || window.location.origin;
    const query = fixture ? "?demo=1" : siteDomain ? `?domain=${encodeURIComponent(siteDomain)}` : "";
    const url = `${base}/dashboard-widget-extension${query}#agent-access`;
    try {
      if (client && !fixture) await client.navigateToExternalUrl(url, true);
      else window.open(url, "_blank", "noopener");
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

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

  // AI Assist (Phase 9): the draft's images, headings and Q&A pairs; the demo's
  // suggestions and fields in `?demo=1` (no requests, writes off).
  const assistBody = draft?.html ?? liveHtml;
  const allRows = useMemo(() => Object.values(rows).flat(), [rows]);
  const [assistFocus, setAssistFocus] = useState<string | null>(null);
  const assistDemo = useMemo(() => {
    if (!fixture) return null;
    const data = makeTestAssist();
    return { data, answers: demoAnswers(data) };
  }, [fixture]);
  // After a write: the fields and FAQ answers as Sitecore has them now, and a
  // fresh draft (Page Builder may not announce a write made through the API).
  const afterWrite = () => {
    refetchFields();
    pageHtml.refresh();
  };

  const tabContent = "min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset data-[state=inactive]:hidden";
  const trigger = "h-10 border-b-0 px-2.5 text-sm font-semibold data-[state=active]:border-b-2";

  return (
    <WriteConfirmProvider client={fixture ? null : client} contextId={writeContext.sitecoreContextId} demo={Boolean(fixture)}>
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
                  siteIssues={siteIssues}
                  onOpenDashboard={openDashboard}
                  pageUrl={effectivePageUrl}
                  delta={delta}
                  difference={difference}
                  isScanning={isScanning}
                  isAiScanning={scan.isAiScanning}
                  isPsiScanning={scan.isPsiScanning}
                  aiStale={scan.aiStale}
                  onAiScan={scan.runAiScan}
                  onPsiScan={scan.runPsiScan}
                  onGenerate={(checkId) => {
                    setAssistFocus(checkId);
                    setTab("assist");
                  }}
                />
                <ScanNote isScanning={isScanning} lastScannedAt={scan.lastScannedAt} demo={Boolean(fixture)} />
              </>
            )}
          </TabsContent>

          <TabsContent value="agent-view" forceMount className={tabContent}>
            {showSkeleton ? (
              <SkeletonRows />
            ) : (
              <AgentViewTab
                data={pageInput.markdown ?? null}
                status={markdownCheck.status}
                p5={p5Row}
                pageUrl={effectivePageUrl}
                draftSource={draft?.source ?? null}
                body={draft?.html ?? liveHtml}
                live={liveHtml}
                fields={pageInput.fields}
              />
            )}
          </TabsContent>

          <TabsContent value="assist" forceMount className={tabContent}>
            {showSkeleton ? (
              <SkeletonRows />
            ) : (
              <AssistTab
                client={client}
                demo={assistDemo}
                active={tab === "assist"}
                writeContext={writeContext}
                fieldValues={fieldValues}
                faqSources={faqSources}
                datasources={datasources}
                currentMeta={{
                  metaTitle: effectiveAuthoring?.pageTitle ?? "",
                  metaDescription: effectiveAuthoring?.metaDescription ?? "",
                  ogTitle: effectiveAuthoring?.ogTitle ?? "",
                  ogDescription: effectiveAuthoring?.ogDescription ?? "",
                }}
                pageTitle={pageTitle}
                mainText={bodyText}
                bodyPending={bodyPending}
                templateName={pageInput.templateName}
                images={assistBody?.images ?? []}
                h2s={assistBody?.headings.filter((h) => h.level === 2).map((h) => h.text) ?? []}
                qaPairs={assistBody?.qaPairs ?? []}
                rows={allRows}
                focus={assistFocus}
                onWritten={afterWrite}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
    </WriteConfirmProvider>
  );
}
