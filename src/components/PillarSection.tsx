"use client";

import type { RuleResult } from "@/lib/rule-engine/types";
import { RuleRow } from "./RuleRow";

type Pillar = "seo" | "aeo" | "content-quality";

interface PillarSectionProps {
  pillar: Pillar;
  results: RuleResult[];
  score: number;
  maxScore: number;
  /** True during a full scan — shows "Scanning…" on all rows that are awaiting data. */
  isScanning?: boolean;
  /** True only during an individual AI scan. */
  isAiScanning?: boolean;
  /** True only during an individual PSI scan. */
  isPsiScanning?: boolean;
  onAiScan?: () => void;
  onPsiScan?: () => void;
}

const PILLAR_META: Record<Pillar, { label: string; color: string }> = {
  seo: { label: "Technical SEO", color: "#1D9E75" },
  aeo: { label: "Structured Data and Schema", color: "#534AB7" },
  "content-quality": { label: "Content Quality", color: "#993C1D" },
};

export function PillarSection({
  pillar,
  results,
  score,
  maxScore,
  isScanning = false,
  isAiScanning = false,
  isPsiScanning = false,
  onAiScan,
  onPsiScan,
}: PillarSectionProps) {
  const meta = PILLAR_META[pillar];
  const scored = results.filter((r) => r.maxScore > 0);
  const infoOnly = results.filter((r) => r.maxScore === 0);
  const pct = maxScore === 0 ? 0 : Math.max(0, Math.min(1, score / maxScore));

  function scanningFor(r: RuleResult): boolean {
    if (isScanning) return true;
    if (r.trigger === "ai") return isAiScanning;
    if (r.trigger === "psi") return isPsiScanning;
    return false;
  }

  function onScanFor(r: RuleResult): (() => void) | undefined {
    if (r.trigger === "ai") return onAiScan;
    if (r.trigger === "psi") return onPsiScan;
    return undefined;
  }

  return (
    <section className="mt-4 first:mt-0">
      <div className="flex items-center gap-2 px-3 mb-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-gray-900 flex-1">
          {meta.label}
        </span>
        <span className="text-xs text-gray-500">
          {score} / {maxScore}
        </span>
      </div>
      <div className="px-3 mb-2">
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct * 100}%`, backgroundColor: meta.color }}
          />
        </div>
      </div>
      <div className="bg-white border border-gray-100 rounded-lg mx-3">
        {scored.map((r) => (
          <RuleRow
            key={r.id}
            result={r}
            scanning={scanningFor(r)}
            onScan={onScanFor(r)}
          />
        ))}
        {infoOnly.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 px-3 pt-3 pb-1 border-t border-gray-100">
              Insights — no score impact
            </div>
            {infoOnly.map((r) => (
              <RuleRow
                key={r.id}
                result={r}
                scanning={scanningFor(r)}
                onScan={onScanFor(r)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
