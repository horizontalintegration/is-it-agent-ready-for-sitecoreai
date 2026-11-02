"use client";

import { useEffect, useState } from "react";
import { labelForPct, type ScoreLabel } from "@/lib/score-thresholds";

const STROKE: Record<ScoreLabel, string> = {
  "agent-ready": "var(--success)",
  "almost-there": "var(--warning)",
  "not-ready": "var(--destructive)",
};

interface ScoreRingProps {
  /** 0–100, or null before anything is scored. */
  score: number | null;
  size?: number;
  /** For the label: "Score" or "Site score". */
  label?: string;
}

/** The 0–100 score ring. It fills from empty on first render (plan section 6.2, item 8). */
export function ScoreRing({ score, size = 88, label = "Score" }: ScoreRingProps) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score ?? 0));
    return () => cancelAnimationFrame(id);
  }, [score]);

  const stroke = Math.max(6, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, shown)) / 100;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={score === null ? `${label} not available yet` : `${label} ${score} out of 100`}
      className="shrink-0"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-gray-100)" strokeWidth={stroke} />
      {score !== null && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={STROKE[labelForPct(score)]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      )}
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.round(size * 0.3)}
        fontWeight={700}
        fill="currentColor"
      >
        {score === null ? "—" : score}
      </text>
    </svg>
  );
}
