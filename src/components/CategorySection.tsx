"use client";

import { CATEGORY_META, type CheckRowModel } from "@/lib/checks/adapters";
import type { Category } from "@/lib/checks/types";
import { RuleRow } from "./RuleRow";

interface CategorySectionProps {
  category: Category;
  results: CheckRowModel[];
  /** Points earned and available in this category (scored checks only). */
  score: number;
  maxScore: number;
  /** Overrides the category label, e.g. for the site checks section. */
  title?: string;
  /** Shown under the title. */
  subtitle?: string;
  /** True during a full scan — shows "Scanning…" on all rows that are awaiting data. */
  isScanning?: boolean;
  /** True only during an individual AI scan. */
  isAiScanning?: boolean;
  /** True only during an individual PSI scan. */
  isPsiScanning?: boolean;
  /** The AI result judged an earlier version of the text. */
  aiStale?: boolean;
  onAiScan?: () => void;
  onPsiScan?: () => void;
}

const CATEGORY_COLOR: Record<Category, string> = {
  reach: "#1D9E75",
  read: "#2563EB",
  understand: "#534AB7",
  trust: "#993C1D",
};

export function CategorySection({
  category,
  results,
  score,
  maxScore,
  title,
  subtitle,
  isScanning = false,
  isAiScanning = false,
  isPsiScanning = false,
  aiStale = false,
  onAiScan,
  onPsiScan,
}: CategorySectionProps) {
  const meta = CATEGORY_META[category];
  const color = CATEGORY_COLOR[category];
  const counted = results.filter((r) => r.state !== "not-applicable");
  const notApplicable = results.filter((r) => r.state === "not-applicable");
  const pct = maxScore === 0 ? 0 : Math.max(0, Math.min(1, score / maxScore));

  if (results.length === 0) return null;

  function scanningFor(r: CheckRowModel): boolean {
    if (isScanning) return true;
    if (r.runner === "ai") return isAiScanning;
    if (r.runner === "psi") return isPsiScanning;
    return false;
  }

  function onScanFor(r: CheckRowModel): (() => void) | undefined {
    if (r.runner === "ai") return onAiScan;
    if (r.runner === "psi") return onPsiScan;
    return undefined;
  }

  return (
    <section className="mt-4 first:mt-0">
      <div className="flex items-center gap-2 px-3 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-sm font-semibold text-gray-900 flex-1">
          {title ?? meta.label}
          <span className="ml-1.5 text-xs font-normal text-gray-500">{subtitle ?? meta.question}</span>
        </span>
        {maxScore > 0 && <span className="text-xs text-gray-500 tabular-nums">{Math.round(pct * 100)}%</span>}
      </div>
      <div className="px-3 mb-2">
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg mx-3">
        {counted.map((r) => (
          <RuleRow
            key={r.id}
            result={r}
            scanning={scanningFor(r)}
            stale={aiStale && r.runner === "ai"}
            onScan={onScanFor(r)}
          />
        ))}
        {notApplicable.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 px-3 pt-3 pb-1 border-t border-gray-100">
              Doesn&apos;t apply here — no score impact
            </div>
            {notApplicable.map((r) => (
              <RuleRow key={r.id} result={r} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
