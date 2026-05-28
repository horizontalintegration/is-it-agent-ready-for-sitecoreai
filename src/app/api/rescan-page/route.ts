import { NextRequest, NextResponse } from "next/server";
import { extractParsedHtml, fetchWithTimeout } from "@/lib/server/extract-html";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Module-level rate limiter: max 10 requests per minute per IP
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = requestLog.get(ip) ?? [];
  const recent = history.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: CORS_HEADERS });
  }

  let body: { pageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.pageUrl) {
    return NextResponse.json({ error: "missing_pageUrl" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const res = await fetchWithTimeout(body.pageUrl, { timeoutMs: 10_000 });
    if (!res.ok) {
      return NextResponse.json(
        { error: "fetch_failed", status: res.status },
        { status: 502, headers: CORS_HEADERS }
      );
    }
    const html = await res.text();
    const parsed = extractParsedHtml(html);
    return NextResponse.json(parsed, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { error: "fetch_failed", detail: message },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
