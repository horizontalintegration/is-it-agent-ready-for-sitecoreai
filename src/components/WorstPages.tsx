"use client";

import type { PageMatrixRow } from "@/types/dashboard";
import type { SiteScoreResult } from "@/lib/rule-engine/site-score";

interface WorstPagesProps {
  pages: PageMatrixRow[];
  scannedCount: number;
  totalCount: number;
  showingAll: boolean;
  onOpenPage: (row: PageMatrixRow) => void;
  onToggleAll: () => void;
}

function pct(score: SiteScoreResult): number {
  return score.maxTotal > 0 ? Math.round((score.total / score.maxTotal) * 100) : 0;
}

function barColor(label: SiteScoreResult["label"]): string {
  switch (label) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "good": return "bg-green-500";
  }
}

function pctColor(label: SiteScoreResult["label"]): string {
  switch (label) {
    case "critical": return "text-red-600";
    case "warning": return "text-amber-600";
    case "good": return "text-green-600";
  }
}

export function WorstPages({
  pages,
  scannedCount,
  totalCount,
  showingAll,
  onOpenPage,
  onToggleAll,
}: WorstPagesProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Pages to fix first</h3>
        <span className="text-xs text-gray-400">lowest readiness</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {pages.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            {scannedCount === 0
              ? "Scanning pages — results will appear here as they complete."
              : "No scored pages yet."}
          </div>
        ) : (
          pages.map((row, i) => {
            const score = row.score as SiteScoreResult;
            const p = pct(score);
            return (
              <div key={row.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <span className="text-xs text-gray-400 w-4 text-right tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{row.name}</div>
                  <div className="text-xs font-mono text-gray-500 truncate">{row.route || "/"}</div>
                </div>
                <div className="hidden sm:flex items-center gap-2 w-28">
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${barColor(score.label)}`} style={{ width: `${p}%` }} />
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums w-10 text-right ${pctColor(score.label)}`}>
                  {p}%
                </span>
                <button
                  onClick={() => onOpenPage(row)}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 whitespace-nowrap"
                  title="Open this page in the Pages editor"
                >
                  Open ↗
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 flex justify-center">
        <button
          onClick={onToggleAll}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {showingAll ? "Hide full page list ▲" : `View all ${totalCount} pages →`}
        </button>
      </div>
    </section>
  );
}
