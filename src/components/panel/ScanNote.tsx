"use client";

import { useEffect, useState } from "react";

function formatRelative(date: Date | null): string {
  if (!date) return "Not scanned yet.";
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "Live page checked just now.";
  if (mins === 1) return "Live page checked 1 min ago.";
  return `Live page checked ${mins} mins ago.`;
}

interface ScanNoteProps {
  isScanning: boolean;
  lastScannedAt: Date | null;
  demo: boolean;
}

/** When the live page was last read. Draft edits update the score without a re-scan. */
export function ScanNote({ isScanning, lastScannedAt, demo }: ScanNoteProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const text = demo ? "Demo data: nothing is fetched." : isScanning ? "Checking the live page…" : formatRelative(lastScannedAt);
  return <p className="px-4 pb-4 text-xs text-subtle-text">{text}</p>;
}
