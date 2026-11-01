"use client";

import { toCheckRow } from "@/lib/checks/adapters";
import type { SiteReport, SiteType } from "@/lib/checks/types";
import { SITE_TYPES } from "@/hooks/useSiteType";
import { RuleRow } from "./RuleRow";

interface SiteChecksProps {
  /** Null while robots.txt and the home page are being fetched. */
  report: SiteReport | null;
  siteType: SiteType;
  onSiteTypeChange: (t: SiteType) => void;
}

/**
 * Site checks (computed once per site), scored separately from the pages.
 * Temporary Overview card: Phase 6 moves these to the Agent access tab.
 */
export function SiteChecks({ report, siteType, onSiteTypeChange }: SiteChecksProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Site checks
          <span className="ml-1.5 text-xs font-normal text-gray-500">run once for the whole site, not in page scores</span>
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
          Site type
          <select
            value={siteType}
            onChange={(e) => onSiteTypeChange(e.target.value as SiteType)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
          >
            {SITE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg">
        {report === null ? (
          <div className="px-3 py-4 text-sm text-gray-500">Checking robots.txt and the home page…</div>
        ) : (
          <>
            {report.score !== null && (
              <div className="px-3 pt-2 text-xs text-gray-500">
                Site score <span className="font-semibold text-gray-900 tabular-nums">{report.score}%</span>
              </div>
            )}
            {report.outcomes.map((o) => (
              <RuleRow key={o.check.id} result={toCheckRow(o)} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
