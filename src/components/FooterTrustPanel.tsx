"use client";

import { useEffect, useState } from "react";
import type { FooterTrust } from "@/lib/rule-engine/types";

interface FooterTrustPanelProps {
  siteDomain: string;
}

const SIGNALS: Array<{ key: keyof FooterTrust; label: string; description: string }> = [
  { key: "hasAddress", label: "Corporate address", description: "Postal address in footer text" },
  { key: "hasContact", label: "Contact", description: "Support / contact pathway" },
  { key: "hasPrivacy", label: "Privacy", description: "Privacy policy link" },
  { key: "hasTerms", label: "Terms", description: "Terms of service link" },
  { key: "hasSecurity", label: "Security / Trust", description: "Security or trust center link" },
  { key: "hasAbout", label: "About", description: "About / company link" },
];

function StatusBadge({ present }: { present: boolean }) {
  if (present) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <span aria-hidden>✓</span> Present
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      <span aria-hidden>~</span> Missing
    </span>
  );
}

export function FooterTrustPanel({ siteDomain }: FooterTrustPanelProps) {
  const [footer, setFooter] = useState<FooterTrust | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteDomain) return;
    setLoading(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    fetch(`${base}/api/footer-check?domain=${encodeURIComponent(siteDomain)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to fetch"))))
      .then((data: FooterTrust) => {
        setFooter(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not fetch the footer for this domain.");
        setLoading(false);
      });
  }, [siteDomain]);

  const presentCount = footer ? SIGNALS.filter((s) => footer[s.key]).length : 0;
  const missing = footer ? SIGNALS.filter((s) => !footer[s.key]) : [];

  const overallStatus =
    !footer ? null : presentCount >= 5 ? "pass" : presentCount >= 3 ? "warning" : "fail";

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <svg
          className="h-5 w-5 text-blue-600 shrink-0 mt-0.5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-blue-900">
            What this checks &amp; why it matters
          </p>
          <p className="text-sm text-blue-800 mt-1">
            This scans your site footer for visible corporate-identity signals — a postal
            address, a contact pathway, and policy links (Privacy, Terms, Security/Trust,
            About).
          </p>
          <p className="text-sm text-blue-800 mt-2">
            AI systems use these signals to confirm who is behind a site and how trustworthy
            it is. When they&apos;re present as rendered text — not just schema — they reduce
            entity ambiguity, strengthen E-E-A-T, and make your content more likely to be
            cited in AI-generated answers. Think of them as the human-readable counterpart to
            your Organization schema: signals both AI and users can read.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Checking footer…
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      {footer && (
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
                ? `${presentCount} of ${SIGNALS.length} trust signals present`
                : overallStatus === "warning"
                  ? `${presentCount} of ${SIGNALS.length} trust signals present — strengthen the footer`
                  : `Only ${presentCount} of ${SIGNALS.length} trust signals found — high entity ambiguity`}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {SIGNALS.map((signal) => (
              <div key={signal.key} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{signal.label}</p>
                  <p className="text-xs text-gray-500">{signal.description}</p>
                </div>
                <StatusBadge present={footer[signal.key]} />
              </div>
            ))}
          </div>

          {missing.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-700 mb-1">How to fix</p>
              <p>
                Add the missing signals to your site footer:{" "}
                <span className="font-medium">{missing.map((m) => m.label).join(", ")}</span>. Include a
                postal address (city + country or ZIP) and visible links to your Privacy, Terms,
                Security/Trust, Contact, and About pages.
              </p>
              <p className="mt-2 text-gray-500">
                Detection is heuristic — spelled-out or non-US addresses may not be recognized even
                when present.
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
