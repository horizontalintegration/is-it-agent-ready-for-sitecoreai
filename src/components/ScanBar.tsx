"use client";

import { useEffect, useState } from "react";

interface ScanBarProps {
  isScanning: boolean;
  lastScannedAt: Date | null;
  onScan: () => void;
}

function formatRelative(date: Date | null): string {
  if (!date) return "Not yet scanned";
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "Scanned just now";
  if (mins === 1) return "Scanned 1 min ago";
  return `Scanned ${mins} mins ago`;
}

export function ScanBar({ isScanning, lastScannedAt, onScan }: ScanBarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const label = formatRelative(lastScannedAt);

  return (
    <div className="border-t border-gray-200 bg-white px-3 py-2 flex items-center gap-3">
      <span className="text-xs text-gray-500 flex-1 truncate">{label}</span>
      <button
        onClick={onScan}
        disabled={isScanning}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${
          isScanning
            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
        }`}
      >
        {isScanning ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M22 12a10 10 0 0 1-10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Scanning…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
            Re-scan page
          </>
        )}
      </button>
    </div>
  );
}
