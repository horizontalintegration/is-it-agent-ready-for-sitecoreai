interface SparklineProps {
  scores: number[];
  width?: number;
  height?: number;
}

/** The site score over the last scans. Hidden until there are two to compare. */
export function Sparkline({ scores, width = 280, height = 64 }: SparklineProps) {
  if (scores.length < 2) return null;
  const pad = 6;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(10, max - min);
  const lo = Math.max(0, min - (span - (max - min)) / 2);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (scores.length - 1);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  const points = scores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = scores.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Score trend from ${scores[0]} to ${scores[last]} over ${scores.length} scans`}
      style={{ maxWidth: "100%", height: "auto" }}
    >
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(scores[last])} r={4} fill="var(--primary)" />
    </svg>
  );
}
