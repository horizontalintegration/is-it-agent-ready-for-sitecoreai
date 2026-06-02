"use client";

import type { PageMatrixRow } from "@/types/dashboard";
import { PageScoreRow } from "./PageScoreRow";

interface WorstPagesProps {
  pages: PageMatrixRow[];
  scannedCount: number;
  totalCount: number;
  showingAll: boolean;
  onOpenPage: (row: PageMatrixRow) => void;
  onToggleAll: () => void;
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
          pages.map((row, i) => (
            <PageScoreRow key={row.id} row={row} rank={i + 1} onOpenPage={onOpenPage} />
          ))
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
