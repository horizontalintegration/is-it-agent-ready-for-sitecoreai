"use client";

import { useMemo } from "react";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { usePageFields } from "@/hooks/usePageFields";
import { useScan } from "@/hooks/useScan";
import { useDemoMode } from "@/hooks/useDemoMode";
import { runRuleEngine } from "@/lib/rule-engine";
import type { PageData, RuleResult } from "@/lib/rule-engine/types";
import { makeTestPageData } from "@/lib/rule-engine/test-fixture";
import { getOrganizationInfo } from "@/lib/brand/organization";
import { ScoreRing } from "@/components/ScoreRing";
import { GateBanner } from "@/components/GateBanner";
import { PillarSection } from "@/components/PillarSection";
import { ScanBar } from "@/components/ScanBar";
import { MetaGenerator } from "@/components/MetaGenerator";
import { PageHtmlSpike, usePageHtmlSpikeEnabled } from "@/components/spike/PageHtmlSpike";

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
  const { fields, pageUrl, siteDomain, siteName, editingToken, isLoading, writeContext } =
    usePageFields(client, isInitialized);

  // Fixture data is opt-in via `?demo=1` in the URL — never auto-activated
  // by the SDK's transient un-initialized state (which flickers during the
  // Strict-Mode mount/cleanup/remount cycle and during the SDK handshake).
  const useFixture = useDemoMode();
  const showSpike = usePageHtmlSpikeEnabled();
  const fixture = useMemo(
    () => (useFixture ? makeTestPageData() : null),
    [useFixture],
  );

  const effectiveAuthoring = fixture ? fixture.authoring : fields;
  const effectivePageUrl = fixture ? fixture.pageUrl : pageUrl;
  const effectiveSiteDomain = fixture ? "https://example.com" : siteDomain;
  const organization = useMemo(
    () => (fixture ? fixture.organization : getOrganizationInfo({ name: siteName, url: siteDomain })),
    [fixture, siteName, siteDomain],
  );

  const pageTitle = effectiveAuthoring?.pageTitle ?? "";

  const scan = useScan({
    pageUrl: effectivePageUrl,
    siteDomain: effectiveSiteDomain,
    editingToken,
    pageTitle,
  });

  // The page body for the AI features is the main text parsed out of
  // preview-fetch. (Phase 4 switches this to the sanitised getPageHTML draft.)
  const effectiveParsedHtml = fixture ? fixture.parsedHtml : scan.parsedHtml;
  const bodyText = effectiveParsedHtml?.mainText ?? "";
  const bodyPending =
    !fixture &&
    !bodyText &&
    Boolean(effectivePageUrl) &&
    (scan.isScanning || scan.lastScannedAt === null);

  const pageData: PageData = useMemo(
    () => ({
      pageUrl: effectivePageUrl,
      organization,
      authoring: {
        pageTitle: effectiveAuthoring?.pageTitle ?? null,
        metaDescription: effectiveAuthoring?.metaDescription ?? null,
        ogTitle: effectiveAuthoring?.ogTitle ?? null,
        ogDescription: effectiveAuthoring?.ogDescription ?? null,
        ogImage: effectiveAuthoring?.ogImage ?? null,
        author: effectiveAuthoring?.author ?? null,
        authorProfileLinked: effectiveAuthoring?.authorProfileLinked ?? false,
        publishDate: effectiveAuthoring?.publishDate ?? null,
        lastUpdatedDate: effectiveAuthoring?.lastUpdatedDate ?? null,
        noIndexField: effectiveAuthoring?.noIndexField ?? false,
        richTextParagraphs: effectiveAuthoring?.richTextParagraphs ?? [],
        richTextFull: effectiveAuthoring?.richTextFull ?? "",
        images: effectiveAuthoring?.images ?? [],
        links: effectiveAuthoring?.links ?? [],
        headings: effectiveAuthoring?.headings ?? [],
        faqItems: effectiveAuthoring?.faqItems ?? [],
        hasFaqComponent: effectiveAuthoring?.hasFaqComponent ?? false,
        hasHowToComponent: effectiveAuthoring?.hasHowToComponent ?? false,
      },
      parsedHtml: effectiveParsedHtml,
      robotsTxt: fixture ? fixture.robotsTxt : scan.robotsTxt,
      psi: fixture ? fixture.psi : scan.psi,
      ai: fixture ? fixture.ai : scan.ai,
    }),
    [
      effectivePageUrl,
      organization,
      effectiveAuthoring,
      fixture,
      effectiveParsedHtml,
      scan.robotsTxt,
      scan.psi,
      scan.ai,
    ],
  );

  const engineOutput = useMemo(() => runRuleEngine(pageData), [pageData]);

  const showSkeleton = !fixture && isLoading;

  const seoResults = engineOutput.results.filter(
    (r: RuleResult) => r.pillar === "seo",
  );
  const aeoResults = engineOutput.results.filter(
    (r: RuleResult) => r.pillar === "aeo",
  );
  const cqResults = engineOutput.results.filter(
    (r: RuleResult) => r.pillar === "content-quality",
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-3 py-2 flex items-center gap-3 shrink-0">
        <span
          className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"
          aria-hidden
        />
        <h1 className="text-sm font-semibold flex-1">Is this page agent-ready?</h1>
        {!showSkeleton && !engineOutput.gate.blocked && (
          <div className="flex items-center gap-2">
            <ScoreRing
              score={engineOutput.maxTotalScore > 0 ? Math.round((engineOutput.totalScore / engineOutput.maxTotalScore) * 100) : 0}
              maxScore={100}
              size={40}
            />
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto py-3">
        {showSpike && (
          <PageHtmlSpike
            client={client}
            pageId={writeContext.pageId}
            pageTitle={effectiveAuthoring?.pageTitle ?? null}
            pageUrl={pageUrl}
            editingToken={editingToken}
          />
        )}
        {showSkeleton ? (
          <SkeletonRows />
        ) : engineOutput.gate.blocked ? (
          <GateBanner reason={engineOutput.gate.reason} />
        ) : (
          <>
            <PillarSection
              pillar="seo"
              results={seoResults}
              score={engineOutput.seoScore}
              maxScore={engineOutput.maxSeoScore}
              isScanning={scan.isScanning}
              isAiScanning={scan.isAiScanning}
              isPsiScanning={scan.isPsiScanning}
              onAiScan={scan.runAiScan}
              onPsiScan={scan.runPsiScan}
            />
            <PillarSection
              pillar="aeo"
              results={aeoResults}
              score={engineOutput.aeoScore}
              maxScore={engineOutput.maxAeoScore}
              isScanning={scan.isScanning}
              isAiScanning={scan.isAiScanning}
              isPsiScanning={scan.isPsiScanning}
              onAiScan={scan.runAiScan}
              onPsiScan={scan.runPsiScan}
            />
            <PillarSection
              pillar="content-quality"
              results={cqResults}
              score={engineOutput.contentQualityScore}
              maxScore={engineOutput.maxContentQualityScore}
              isScanning={scan.isScanning}
              isAiScanning={scan.isAiScanning}
              isPsiScanning={scan.isPsiScanning}
              onAiScan={scan.runAiScan}
              onPsiScan={scan.runPsiScan}
            />
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
        isScanning={scan.isScanning}
        lastScannedAt={scan.lastScannedAt}
        onScan={scan.runScan}
      />
    </div>
  );
}
