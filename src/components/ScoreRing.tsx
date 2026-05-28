"use client";

interface ScoreRingProps {
  score: number;
  maxScore: number;
  size?: number;
}

export function ScoreRing({ score, maxScore, size = 56 }: ScoreRingProps) {
  const pct = maxScore === 0 ? 0 : Math.max(0, Math.min(1, score / maxScore));
  const r = size / 2 - 5;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - pct);

  let stroke = "var(--color-text-danger)";
  if (pct >= 0.8) stroke = "var(--color-text-success)";
  else if (pct >= 0.4) stroke = "#d97706";

  return (
    <svg width={size} height={size} className="block" aria-label={`Score ${score} of ${maxScore}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 300ms ease" }}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={500}
        fill="currentColor"
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}
