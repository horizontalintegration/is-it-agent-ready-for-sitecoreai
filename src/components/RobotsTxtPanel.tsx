"use client";

import { useEffect, useState } from "react";
import type { CrawlerPermission, RobotsTxt } from "@/lib/rule-engine/types";

interface RobotsTxtPanelProps {
  siteDomain: string;
}

const CRAWLERS: Array<{ key: keyof RobotsTxt; label: string; description: string }> = [
  { key: "googleExtended", label: "Google-Extended", description: "Google AI Overviews & Gemini" },
  { key: "gptBot", label: "GPTBot", description: "OpenAI ChatGPT & search" },
  { key: "claudeBot", label: "ClaudeBot", description: "Anthropic Claude AI" },
  { key: "perplexityBot", label: "PerplexityBot", description: "Perplexity AI search" },
  { key: "amazonBot", label: "Amazonbot", description: "Amazon Alexa & AI features" },
  { key: "appleBotExtended", label: "Applebot-Extended", description: "Apple Intelligence & Siri" },
];

function StatusBadge({ permission }: { permission: CrawlerPermission }) {
  if (permission === "allowed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <span aria-hidden>✓</span> Allowed
      </span>
    );
  }
  if (permission === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <span aria-hidden>✗</span> Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      <span aria-hidden>~</span> Not mentioned
    </span>
  );
}

export function RobotsTxtPanel({ siteDomain }: RobotsTxtPanelProps) {
  const [robots, setRobots] = useState<RobotsTxt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteDomain) return;
    setLoading(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    fetch(`${base}/api/robots-check?domain=${encodeURIComponent(siteDomain)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to fetch"))))
      .then((data: RobotsTxt) => {
        setRobots(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not fetch robots.txt for this domain.");
        setLoading(false);
      });
  }, [siteDomain]);

  const blockedCount = robots
    ? CRAWLERS.filter((c) => robots[c.key] === "blocked").length
    : 0;

  const overallStatus =
    !robots ? null : blockedCount === 0 ? "pass" : blockedCount <= 2 ? "warning" : "fail";

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900">AI Crawler Permissions</p>
        <p className="text-sm text-blue-800 mt-1">
          Your <code className="font-mono text-xs bg-blue-100 px-1 rounded">/robots.txt</code> file
          controls which AI systems can crawl and index your site. Blocking major AI crawlers
          prevents your content from appearing in AI-generated answers.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Fetching robots.txt…
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      {robots && (
        <>
          {overallStatus && (
            <div
              className={`rounded-lg p-3 border text-sm font-medium flex items-center gap-2 ${
                overallStatus === "pass"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : overallStatus === "warning"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              <span aria-hidden>{overallStatus === "pass" ? "✓" : overallStatus === "warning" ? "⚠" : "✗"}</span>
              {overallStatus === "pass"
                ? "All AI crawlers are permitted"
                : overallStatus === "warning"
                  ? `${blockedCount} AI crawler${blockedCount > 1 ? "s" : ""} blocked — partial indexing`
                  : `${blockedCount} AI crawlers blocked — significant coverage loss`}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {CRAWLERS.map((crawler) => (
              <div key={crawler.key} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{crawler.label}</p>
                  <p className="text-xs text-gray-500">{crawler.description}</p>
                </div>
                <StatusBadge permission={robots[crawler.key]} />
              </div>
            ))}
          </div>

          {blockedCount > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-700 mb-1">How to fix</p>
              <p>
                Open <code className="font-mono bg-gray-100 px-1 rounded">/robots.txt</code> at your
                site root and remove or update the <code className="font-mono bg-gray-100 px-1 rounded">Disallow</code> rules
                for the blocked crawlers listed above. Changes take effect on the next crawl cycle.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Domain: <span className="font-mono">{siteDomain}</span>
          </p>
        </>
      )}
    </div>
  );
}
