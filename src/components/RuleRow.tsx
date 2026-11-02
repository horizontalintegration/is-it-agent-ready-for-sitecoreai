"use client";

import { useState } from "react";
import type { CheckRowModel } from "@/lib/checks/adapters";
import type { CheckStatus, Source } from "@/lib/checks/types";

interface RuleRowProps {
  result: CheckRowModel;
  scanning?: boolean;
  /** The AI result judged an earlier version of the text: offer a re-run. */
  stale?: boolean;
  onScan?: () => void;
}

const SOURCE_LABEL: Record<Source, string> = {
  draft: "Draft",
  live: "Live",
  fields: "Fields",
  ai: "AI",
  psi: "PageSpeed",
  probe: "Probe",
};

const SOURCE_TITLE: Record<Source, string> = {
  draft: "Read from the Page Builder draft, unsaved edits included",
  live: "Read from the published page",
  fields: "Read from the Sitecore fields",
  ai: "Judged by Claude",
  psi: "From PageSpeed Insights",
  probe: "From a citation probe",
};

const dotColor: Record<CheckStatus, string> = {
  pass: "bg-green-500",
  warning: "bg-amber-500",
  fail: "bg-red-500",
  info: "bg-gray-400",
};

const badgeStyle: Record<CheckStatus, string> = {
  pass: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  fail: "bg-red-50 text-red-700",
  info: "bg-gray-100 text-gray-600",
};

function Spinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin text-blue-500 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Points with at most one decimal: pools split unevenly (e.g. 20 ÷ 12). */
function pts(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function badgeText(result: CheckRowModel): string {
  if (result.state === "not-applicable") return "n/a";
  if (result.state === "not-checked") return "not checked";
  if (result.tier === "bonus") return `+${pts(result.points)} bonus`;
  return `${pts(result.points)} / ${pts(result.maxPoints)}`;
}

export function RuleRow({ result, scanning = false, stale = false, onScan }: RuleRowProps) {
  const [open, setOpen] = useState(false);
  // Checks filled by an on-demand scan (PSI or AI) that haven't run yet, or
  // couldn't (e.g. a PSI error): offer the scan, including as a retry.
  const needsScan = !!onScan && result.runner !== null && result.state === "not-checked";
  const showScanning = scanning && result.state === "not-checked";

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 text-left"
        aria-expanded={open}
      >
        {showScanning ? (
          <Spinner />
        ) : (
          <span
            className={`w-1 h-1 rounded-full shrink-0 ${dotColor[result.status]}`}
            aria-hidden
          />
        )}
        <span className="text-sm font-medium text-gray-900 flex-1 truncate">{result.title}</span>
        {showScanning ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
            Scanning…
          </span>
        ) : needsScan ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onScan!(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onScan!(); } }}
            className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 shrink-0 cursor-pointer select-none"
          >
            Run scan
          </span>
        ) : (
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${badgeStyle[result.status]}`}>
            {badgeText(result)}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "700px" : "0px" }}
      >
        <div className="px-6 pb-3 pt-1">
          {showScanning ? (
            <p className="text-sm text-gray-500 mt-1.5">Scanning rendered page…</p>
          ) : (
            <>
              {result.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {result.sources.map((s) => (
                    <span
                      key={s}
                      title={SOURCE_TITLE[s]}
                      className={`text-[10px] px-1.5 py-px rounded border ${
                        s === "draft" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600"
                      }`}
                    >
                      {SOURCE_LABEL[s]}
                    </span>
                  ))}
                </div>
              )}
              {stale && result.state === "scored" && onScan && (
                <p className="text-xs text-amber-700 mb-1">
                  Based on an earlier version of the text.{" "}
                  <button type="button" onClick={onScan} className="underline hover:text-amber-900">
                    Re-run
                  </button>
                </p>
              )}
              {result.value && (
                <p className="text-xs text-gray-500 mb-1">{result.value}</p>
              )}
              <p className="text-sm text-gray-600 mt-1.5">{result.message}</p>
              {result.fixSuggestion && (
                <p className="text-sm text-blue-600 mt-1.5">
                  → {result.fixSuggestion}
                  {result.gain >= 0.5 && (
                    <span className="ml-1 text-xs font-medium text-green-700">+{pts(result.gain)} pts</span>
                  )}
                </p>
              )}
              {result.details.length > 0 && (
                <ul className="text-xs text-gray-500 list-disc pl-4 mt-2 space-y-0.5">
                  {result.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              {result.flaggedItems && result.flaggedItems.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc pl-4 mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                  {result.flaggedItems.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              {result.codePreview && (
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-gray-900 text-gray-100 text-[11px] leading-relaxed p-2.5 whitespace-pre">
                  {result.codePreview}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
