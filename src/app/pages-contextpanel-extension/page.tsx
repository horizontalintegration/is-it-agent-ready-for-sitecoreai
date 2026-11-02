"use client";

import { useEffect, useMemo } from "react";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { usePageFields } from "@/hooks/usePageFields";
import { usePageHtml } from "@/hooks/usePageHtml";
import { useScan } from "@/hooks/useScan";
import { useDemoMode } from "@/hooks/useDemoMode";
import { makeTestDraft, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import { getConfiguredOrganization, getOrganizationInfo } from "@/lib/brand/organization";
import { buildPageContext, isHomeRoute, type PageInput } from "@/lib/checks/context";
import { draftDiffersFromLive } from "@/lib/checks/draft-diff";
import { runPageChecks, runSiteChecks } from "@/lib/checks/engine";
import { rowsByCategory, toCheckRow } from "@/lib/checks/adapters";
import { CATEGORIES } from "@/lib/checks/types";
import { ScoreRing } from "@/components/ScoreRing";
import { GateBanner } from "@/components/GateBanner";
import { DraftBanner } from "@/components/DraftBanner";
import { CategorySection } from "@/components/CategorySection";
import { ScanBar } from "@/components/ScanBar";
import { MetaGenerator } from "@/components/MetaGenerator";

function SkeletonRows() {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
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
            ai: scan.ai,
            psi: scan.psi,
            organization,
          },
    [fixture, fixtureDraft, pageUrl, route, templateName, scoringFields, scan.parsedHtml, pageHtml.draft, scan.ai, scan.psi, organization],
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

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-3 py-2 flex items-center gap-3 shrink-0">
        <span
          className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"
          aria-hidden
        />
        <h1 className="text-sm font-semibold flex-1">Is this page agent-ready?</h1>
        {!showSkeleton && !report.gate.blocked && report.score !== null && (
          <div className="flex items-center gap-2">
            <ScoreRing score={report.score} maxScore={100} size={40} />
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto py-3">
        {showSkeleton ? (
          <SkeletonRows />
        ) : report.gate.blocked ? (
          <GateBanner reason={report.gate.reason} />
        ) : (
          <>
            {difference?.differs && <DraftBanner changed={difference.changed} removed={difference.removed} />}
            {CATEGORIES.map((category) => (
              <CategorySection
                key={category}
                category={category}
                results={rows[category]}
                score={report.categories[category].earned}
                maxScore={report.categories[category].max}
                isScanning={isScanning}
                isAiScanning={scan.isAiScanning}
                isPsiScanning={scan.isPsiScanning}
                aiStale={scan.aiStale}
                onAiScan={scan.runAiScan}
                onPsiScan={scan.runPsiScan}
              />
            ))}
            {orgSchemaRow && (
              <CategorySection
                category="understand"
                title="Site check"
                subtitle="Not in this page's score"
                results={[orgSchemaRow]}
                score={orgSchemaRow.points}
                maxScore={orgSchemaRow.maxPoints}
              />
            )}
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
          </>
        )}
      </main>

      <ScanBar
        isScanning={isScanning}
        lastScannedAt={scan.lastScannedAt}
        onScan={rescan}
      />
    </div>
  );
}
