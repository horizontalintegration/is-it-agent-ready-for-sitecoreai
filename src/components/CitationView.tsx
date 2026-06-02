"use client";

import { useMemo, useState } from "react";
import type { PageMatrixRow } from "@/types/dashboard";
import {
  CITATION_SYSTEMS,
  type CitationForecast,
  type CitationForecastError,
} from "@/types/citation";

interface CitationViewProps {
  pages: PageMatrixRow[];
  siteDomain: string;
}

type ForecastState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; forecast: CitationForecast }
  | { status: "error"; message: string };

const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "";

function isHomeRoute(route: string): boolean {
  return route === "/" || route === "";
}

function isArticleLike(templateName: string): boolean {
  return /article|blog|news|post/i.test(templateName);
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "text-amber-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function CitationView({ pages, siteDomain }: CitationViewProps) {
  const [recommendedOnly, setRecommendedOnly] = useState(true);
  const [forecasts, setForecasts] = useState<Record<string, ForecastState>>({});

  // Candidate set: content/answer pages get cited, homepages rarely do. We default
  // to "recommended" (non-home, with a body) and let the user widen to all pages.
  const visible = useMemo(() => {
    const list = recommendedOnly ? pages.filter((p) => !isHomeRoute(p.route)) : pages;
    // Article-like pages first — they're the most likely to be cited.
    return [...list].sort((a, b) => {
      const aw = isArticleLike(a.templateName) ? 0 : 1;
      const bw = isArticleLike(b.templateName) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
  }, [pages, recommendedOnly]);

  const runForecast = async (row: PageMatrixRow) => {
    setForecasts((prev) => ({ ...prev, [row.id]: { status: "loading" } }));
    try {
      const res = await fetch(`${API_BASE}/api/citation-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: row.pageUrl, siteDomain }),
      });
      const data = (await res.json()) as
        | Omit<CitationForecast, "generatedAt">
        | CitationForecastError;
      if (!res.ok || "error" in data) {
        const message =
          "error" in data
            ? `${data.error}${data.detail ? `: ${data.detail}` : ""}`
            : `Request failed (${res.status})`;
        setForecasts((prev) => ({ ...prev, [row.id]: { status: "error", message } }));
        return;
      }
      const forecast: CitationForecast = {
        ...data,
        generatedAt: new Date().toISOString(),
      };
      setForecasts((prev) => ({ ...prev, [row.id]: { status: "done", forecast } }));
    } catch (err) {
      setForecasts((prev) => ({
        ...prev,
        [row.id]: { status: "error", message: err instanceof Error ? err.message : "Network error" },
      }));
    }
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
        <strong>AI citation forecast.</strong> Predicts how likely each answer engine is to cite a
        page, synthesised from its content, schema, freshness, and site-wide AI-crawler access. These
        are AI-reasoned <em>estimates</em>, not measured citation rates — use them as directional
        guidance. Run on demand per page; homepages are hidden by default since they&apos;re rarely
        cited.
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={recommendedOnly}
          onChange={(e) => setRecommendedOnly(e.target.checked)}
        />
        Recommended pages only (content pages; hides the homepage)
      </label>

      {visible.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          No pages to forecast. {recommendedOnly ? "Uncheck the filter to show all pages." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const state = forecasts[row.id] ?? { status: "idle" };
            return (
              <li key={row.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{row.name}</span>
                      {isArticleLike(row.templateName) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                          Article
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 truncate block">{row.route}</span>
                  </div>
                  <button
                    onClick={() => runForecast(row)}
                    disabled={state.status === "loading"}
                    className="text-xs px-3 py-1.5 rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                  >
                    {state.status === "loading"
                      ? "Forecasting…"
                      : state.status === "done"
                        ? "Re-run"
                        : "Forecast"}
                  </button>
                </div>

                {state.status === "error" && (
                  <p className="mt-2 text-xs text-red-600">Forecast failed — {state.message}</p>
                )}

                {state.status === "done" && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {CITATION_SYSTEMS.map(({ key, label }) => {
                        const sys = state.forecast.systems.find((s) => s.system === key);
                        if (!sys) return null;
                        return (
                          <div
                            key={key}
                            className="border border-gray-100 rounded-md p-2 bg-gray-50"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-900">{label}</span>
                              <Stars value={sys.stars} />
                            </div>
                            <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                              {sys.reasoning}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {state.forecast.topRecommendation && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">Top fix:</span>{" "}
                        {state.forecast.topRecommendation}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
