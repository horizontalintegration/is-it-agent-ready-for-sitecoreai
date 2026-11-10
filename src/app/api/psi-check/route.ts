import { NextRequest, NextResponse } from "next/server";
import { safeFetch, validateUrl } from "@/lib/server/safe-fetch";
import { limitCall } from "@/lib/server/rate-limit";
import { refuseCrossOrigin } from "@/lib/server/same-origin";
import type { PsiResult } from "@/lib/rule-engine/types";

export const maxDuration = 100; // seconds — PSI Lighthouse audits can take 20–40s

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface LighthouseAudit {
  score?: number | null;
  title?: string;
  displayValue?: string;
  scoreDisplayMode?: string;
  details?: { type?: string; overallSavingsMs?: number };
}

interface PsiApiResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, LighthouseAudit>;
  };
  error?: { message?: string };
}

const CWV_AUDITS: Array<{ id: string; label: string }> = [
  { id: "largest-contentful-paint", label: "LCP" },
  { id: "first-contentful-paint",   label: "FCP" },
  { id: "total-blocking-time",      label: "TBT" },
  { id: "cumulative-layout-shift",  label: "CLS" },
  { id: "speed-index",              label: "Speed Index" },
  { id: "interactive",              label: "TTI" },
];

function extractCoreWebVitals(audits: Record<string, LighthouseAudit>): string[] {
  return CWV_AUDITS
    .filter(({ id }) => audits[id]?.displayValue)
    .map(({ id, label }) => `${label}: ${audits[id].displayValue}`);
}

function extractOpportunities(audits: Record<string, LighthouseAudit>): string[] {
  return Object.values(audits)
    .filter(
      (a) =>
        a.details?.type === "opportunity" &&
        typeof a.score === "number" &&
        a.score < 1 &&
        a.title &&
        a.displayValue,
    )
    .sort(
      (a, b) =>
        (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0),
    )
    .slice(0, 5)
    .map((a) => `${a.title} — ${a.displayValue}`);
}

export async function GET(req: NextRequest) {
  const refused = refuseCrossOrigin(req);
  if (refused) return refused;
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  // Google fetches the page, not us, but only send it public http(s) URLs.
  try {
    validateUrl(url);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: "blocked_url", detail }, { status: 400 });
  }
  // Each call spends the PageSpeed quota.
  const limited = await limitCall("psi-check", req);
  if (limited) return limited;

  const params = new URLSearchParams({ url, strategy: "mobile" });
  if (process.env.PSI_API_KEY) {
    params.set("key", process.env.PSI_API_KEY);
  }

  try {
    // Full Lighthouse reports run to several MB.
    const res = await safeFetch(`${PSI_ENDPOINT}?${params.toString()}`, {
      timeoutMs: 100_000,
      maxBytes: 30 * 1024 * 1024,
    });
    const data = (await res.json()) as PsiApiResponse;

    if (!res.ok) {
      const detail = data?.error?.message ?? `PSI API returned status ${res.status}`;
      console.error(`[psi-check] PSI API error for ${url}: ${detail}`);
      const result: PsiResult = { performanceScore: 0, isCrawlable: false, psiError: detail, coreWebVitals: [], opportunities: [] };
      return NextResponse.json(result);
    }

    const audits = data.lighthouseResult?.audits ?? {};
    const rawScore = data.lighthouseResult?.categories?.performance?.score ?? 0;
    const isCrawlable = audits["is-crawlable"] ? audits["is-crawlable"].score === 1 : true;

    const result: PsiResult = {
      performanceScore: Math.round(rawScore * 100),
      isCrawlable,
      coreWebVitals: extractCoreWebVitals(audits),
      opportunities: extractOpportunities(audits),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`[psi-check] threw for ${url}: ${message}`);
    const result: PsiResult = { performanceScore: 0, isCrawlable: false, psiError: message, coreWebVitals: [], opportunities: [] };
    return NextResponse.json(result);
  }
}
