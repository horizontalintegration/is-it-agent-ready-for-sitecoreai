"use client";

import { useEffect, useMemo, useState } from "react";
import { mdiCheckDecagramOutline } from "@mdi/js";
import { CheckRow } from "@/components/shared/CheckRow";
import { CategoryBars, CategorySwatch } from "@/components/shared/CategoryBars";
import { EmptyState } from "@/components/shared/EmptyState";
import { Segmented } from "@/components/shared/Segmented";
import { TopFixes } from "@/components/shared/TopFixes";
import { VerdictCard } from "@/components/shared/VerdictCard";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_META,
  needsWork,
  pageVerdict,
  topFixes,
  type CheckRowModel,
} from "@/lib/checks/view-model";
import { CATEGORIES, type Category, type PageReport } from "@/lib/checks/types";
import { DraftBanner } from "./DraftBanner";
import { GateBanner } from "./GateBanner";
import { SiteIssues } from "./SiteIssues";

type ListFilter = "needs-work" | "all";

interface ScoreTabProps {
  report: PageReport;
  rows: Record<Category, CheckRowModel[]>;
  /** The home page's site check (S7): shown, but not in this page's score. */
  siteRow: CheckRowModel | null;
  /** Failing site checks that keep agents out of every page (S1, S2). */
  siteIssues: CheckRowModel[];
  onOpenDashboard: () => void;
  pageUrl: string;
  delta: number | null;
  difference: { differs: boolean; changed: number; removed: number } | null;
  isScanning: boolean;
  isAiScanning: boolean;
  isPsiScanning: boolean;
  aiStale: boolean;
  onAiScan: () => void;
  onPsiScan: () => void;
  onGenerate: (checkId: string) => void;
}

/** A row is listed under "Needs work" when it fails or improves, or is waiting to be run. */
const showInNeedsWork = (r: CheckRowModel) => needsWork(r) || (r.display === "not-checked" && r.runner !== null);

export function ScoreTab({
  report,
  rows,
  siteRow,
  siteIssues,
  onOpenDashboard,
  pageUrl,
  delta,
  difference,
  isScanning,
  isAiScanning,
  isPsiScanning,
  aiStale,
  onAiScan,
  onPsiScan,
  onGenerate,
}: ScoreTabProps) {
  const [filter, setFilter] = useState<ListFilter>("all");
  const [category, setCategory] = useState<Category | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const allRows = useMemo(() => CATEGORIES.flatMap((c) => rows[c]), [rows]);
  const fixes = useMemo(() => topFixes(allRows), [allRows]);
  const verdict = report.score === null ? null : pageVerdict(report.score, allRows);

  // "Show how" opens the check's row and brings it into view.
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(`check-${scrollTo}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    setScrollTo(null);
  }, [scrollTo]);

  const showHow = (id: string) => {
    setCategory(null);
    setOpenId(id);
    setScrollTo(id);
  };

  const scanningFor = (r: CheckRowModel) =>
    isScanning || (r.runner === "ai" && isAiScanning) || (r.runner === "psi" && isPsiScanning);
  const runFor = (r: CheckRowModel) => (r.runner === "ai" ? onAiScan : r.runner === "psi" ? onPsiScan : undefined);

  if (report.gate.blocked) {
    return (
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <GateBanner reason={report.gate.reason} />
      </div>
    );
  }

  const shownCategories = category ? [category] : CATEGORIES;
  const renderRow = (r: CheckRowModel) => (
    <CheckRow
      key={r.id}
      row={r}
      pageUrl={pageUrl}
      open={openId === r.id}
      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
      scanning={scanningFor(r)}
      stale={aiStale && r.runner === "ai"}
      onRun={runFor(r)}
      onGenerate={onGenerate}
    />
  );

  return (
    <div className="flex flex-col gap-3.5 px-4 py-3.5">
      {difference?.differs && <DraftBanner changed={difference.changed} removed={difference.removed} />}

      {verdict && report.score !== null ? (
        <VerdictCard score={report.score} verdict={verdict.text} sentence={verdict.sentence} delta={delta} />
      ) : (
        <p className="text-sm text-subtle-text">{isScanning ? "Checking this page…" : "Nothing could be scored yet. Re-scan to try again."}</p>
      )}

      <CategoryBars categories={report.categories} selected={category} onSelect={setCategory} />

      <SiteIssues issues={siteIssues} onOpenDashboard={onOpenDashboard} />

      {fixes.length > 0 ? (
        <TopFixes fixes={fixes} pageUrl={pageUrl} onGenerate={onGenerate} onShowHow={showHow} />
      ) : (
        verdict?.label === "agent-ready" && (
          <EmptyState icon={mdiCheckDecagramOutline} tone="success" title="Nothing left to fix here" className="py-4">
            This page gives AI agents everything they need. Keep it fresh and re-check after big edits.
          </EmptyState>
        )
      )}

      <div className="mt-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-subtle-text uppercase">All checks</h3>
        <Segmented
          label="Show checks"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "needs-work", label: "Needs work" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {category && (
        <p className="flex items-center gap-2 text-sm text-subtle-text">
          Showing {CATEGORY_META[category].label} only.
          <Button type="button" size="xs" variant="link" className="h-auto px-0 text-sm" onClick={() => setCategory(null)}>
            Show all categories
          </Button>
        </p>
      )}

      {shownCategories.map((c) => {
        const list = rows[c].filter((r) => (filter === "all" ? true : showInNeedsWork(r)));
        const counted = list.filter((r) => r.display !== "na");
        const na = filter === "all" ? list.filter((r) => r.display === "na") : [];
        if (counted.length + na.length === 0) {
          return filter === "needs-work" && category === c ? (
            <p key={c} className="text-sm text-subtle-text">Every {CATEGORY_META[c].label} check passes.</p>
          ) : null;
        }
        return (
          <section key={c} aria-label={CATEGORY_META[c].label} className="flex flex-col gap-1.5">
            <h4 className="flex items-center gap-2 text-xs font-bold">
              <CategorySwatch category={c} />
              {CATEGORY_META[c].label}
              <span className="font-medium text-subtle-text">· {CATEGORY_META[c].question}</span>
            </h4>
            <div className="overflow-hidden rounded-[10px] border bg-body-bg">
              {counted.map(renderRow)}
              {na.length > 0 && (
                <>
                  <p className="border-b px-3 pt-2.5 pb-1 text-xs text-subtle-text">Doesn&apos;t apply to this page, so it doesn&apos;t count</p>
                  {na.map(renderRow)}
                </>
              )}
            </div>
          </section>
        );
      })}

      {filter === "needs-work" && !category && allRows.every((r) => !showInNeedsWork(r)) && (
        <EmptyState icon={mdiCheckDecagramOutline} tone="success" title="Every check passes" className="py-4" />
      )}

      {siteRow && (filter === "all" || showInNeedsWork(siteRow)) && (
        <section aria-label="Site check" className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-2 text-xs font-bold">
            <CategorySwatch category={siteRow.category} />
            Site check
            <span className="font-medium text-subtle-text">· Not in this page&apos;s score</span>
          </h4>
          <div className="overflow-hidden rounded-[10px] border bg-body-bg">{renderRow(siteRow)}</div>
        </section>
      )}
    </div>
  );
}
