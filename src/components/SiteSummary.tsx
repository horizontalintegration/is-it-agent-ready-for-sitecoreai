"use client";

import type { SiteAggregate, ScoreLabel } from "@/lib/site-aggregate";
import { ScoreRing } from "./ScoreRing";

interface SiteSummaryProps {
  aggregate: SiteAggregate;
  isLoading: boolean;
}

const LABEL_TEXT: Record<ScoreLabel, string> = {
  critical: "Critical",
  warning: "Needs work",
  good: "Healthy",
};

function labelBadge(label: ScoreLabel): string {
  switch (label) {
    case "critical": return "bg-red-50 text-red-700 border-red-200";
    case "warning": return "bg-amber-50 text-amber-700 border-amber-200";
    case "good": return "bg-green-50 text-green-700 border-green-200";
  }
}

function barColor(label: ScoreLabel): string {
  switch (label) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "good": return "bg-green-500";
  }
}

export function SiteSummary({ aggregate, isLoading }: SiteSummaryProps) {
  const {
    overallPct,
    overallLabel,
    counts,
    scannedCount,
    totalCount,
    scanningCount,
    errorCount,
    blockedCount,
    progress,
  } = aggregate;

  const scanning = scanningCount > 0 || (isLoading && scannedCount < totalCount);
  const done = scannedCount + errorCount;
  const scoredCount = counts.critical + counts.warning + counts.good;

  return (
    <section className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-5">
        <div className="shrink-0 text-gray-900">
          {overallPct === null ? (
            <div className="w-[72px] h-[72px] rounded-full border-4 border-gray-100 flex items-center justify-center text-xs text-gray-400">
              —
            </div>
          ) : (
            <ScoreRing score={Math.round(overallPct)} maxScore={100} size={72} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">AI Search Readiness</h2>
            {overallLabel && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${labelBadge(overallLabel)}`}>
                {LABEL_TEXT[overallLabel]}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {scannedCount === 0
              ? isLoading
                ? "Loading pages…"
                : "No pages scanned yet"
              : `Average across ${scoredCount} scored ${scoredCount === 1 ? "page" : "pages"}`}
          </p>

          {/* Status counts */}
          {scannedCount > 0 && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-red-600">
                <span className="w-2 h-2 rounded-full bg-red-500" />{counts.critical} Critical
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <span className="w-2 h-2 rounded-full bg-amber-500" />{counts.warning} Needs work
              </span>
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500" />{counts.good} Healthy
              </span>
              {blockedCount > 0 && (
                <span className="flex items-center gap-1 text-gray-500" title="noindex / nosnippet pages have no score">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />{blockedCount} Blocked
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Background scan progress */}
      {totalCount > 0 && (scanning || done < totalCount) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{scanning ? "Scanning pages…" : "Scan paused"}</span>
            <span className="tabular-nums">
              {done} / {totalCount}
              {errorCount > 0 && <span className="text-red-500"> · {errorCount} failed</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full ${overallLabel ? barColor(overallLabel) : "bg-blue-500"} transition-all duration-300`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
