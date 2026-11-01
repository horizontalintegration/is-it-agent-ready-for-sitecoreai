"use client";

import { useState } from "react";
import type { PageMatrixRow } from "@/types/dashboard";
import { CATEGORY_META } from "@/lib/checks/adapters";
import { CATEGORIES } from "@/lib/checks/types";
import type { ScoreLabel } from "@/lib/score-thresholds";
import { ScorePill } from "./ScorePill";

function barColor(label: ScoreLabel): string {
  switch (label) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "good": return "bg-green-500";
  }
}

function pctColor(label: ScoreLabel): string {
  switch (label) {
    case "critical": return "text-red-600";
    case "warning": return "text-amber-600";
    case "good": return "text-green-600";
  }
}

interface PageScoreRowProps {
  row: PageMatrixRow;
  /** Optional 1-based rank shown at the left (used by the "fix first" list). */
  rank?: number;
  onOpenPage: (row: PageMatrixRow) => void;
  /** When provided, unscanned/errored rows get a Scan/Retry action. */
  onScan?: (row: PageMatrixRow) => void;
}

export function PageScoreRow({ row, rank, onOpenPage, onScan }: PageScoreRowProps) {
  const [open, setOpen] = useState(false);
  const summary = row.score;
  // Blocked (noindex / nosnippet) or unscorable pages have a summary but no score.
  const score = summary && summary.score !== null && summary.label !== null
    ? { pct: summary.score, label: summary.label, categories: summary.categories }
    : null;

  return (
    <div className="px-3 py-2 hover:bg-gray-50">
      <div className="flex items-center gap-3">
        {rank !== undefined && (
          <span className="text-xs text-gray-400 w-4 text-right tabular-nums shrink-0">{rank}</span>
        )}

        <button
          type="button"
          onClick={() => score && setOpen((o) => !o)}
          disabled={!score}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
          title={score ? "Show category breakdown" : undefined}
        >
          <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1">
            {score && (
              <span className={`text-gray-300 text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>
                ▸
              </span>
            )}
            <span className="truncate">{row.name}</span>
          </div>
          <div className="text-xs font-mono text-gray-500 truncate">{row.route || "/"}</div>
        </button>

        {score ? (
          <>
            <div className="hidden sm:flex items-center w-28 shrink-0">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${barColor(score.label)}`} style={{ width: `${score.pct}%` }} />
              </div>
            </div>
            <span className={`text-sm font-semibold tabular-nums w-10 text-right shrink-0 ${pctColor(score.label)}`}>
              {score.pct}%
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400 w-28 text-right shrink-0 truncate">
            {row.scanStatus === "scanning"
              ? "Scanning…"
              : summary?.blocked
                ? "Blocked (noindex)"
                : row.scanStatus === "error"
                ? (row.scanError ?? "Scan failed")
                : "Not scanned"}
          </span>
        )}

        <div className="w-16 text-right shrink-0">
          {score ? (
            <button
              onClick={() => onOpenPage(row)}
              className="text-xs px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 whitespace-nowrap"
              title="Open this page in the Pages editor"
            >
              Open ↗
            </button>
          ) : onScan && row.scanStatus !== "scanning" ? (
            <button
              onClick={() => onScan(row)}
              className={`text-xs font-medium ${
                row.scanStatus === "error" ? "text-red-600 hover:text-red-800" : "text-blue-600 hover:text-blue-800"
              }`}
            >
              {row.scanStatus === "error" ? "Retry" : "Scan"}
            </button>
          ) : null}
        </div>
      </div>

      {open && score && (
        <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${rank !== undefined ? "ml-7" : "ml-0"}`}>
          {CATEGORIES.map((c) => (
            <span key={c} className="flex items-center gap-1 text-[11px] text-gray-500">
              {CATEGORY_META[c].label}
              <ScorePill score={score.categories[c].earned} max={score.categories[c].max} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
