import { NextRequest, NextResponse } from "next/server";
import { collectAgentAccess } from "@/lib/server/agent-access";
import { SafeFetchError } from "@/lib/server/safe-fetch";

// The scan has its own 17 s deadline; this leaves room for the response.
export const maxDuration = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Evidence for the site checks S1–S12: GET /api/agent-access?domain=example.com */
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "missing_domain" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const data = await collectAgentAccess(domain);
    // A hostname that resolves to a private address is only found at connect time.
    if (data.home.probe.error === "blocked_url") {
      return NextResponse.json({ error: "blocked_url" }, { status: 400, headers: CORS_HEADERS });
    }
    console.info(`[agent-access] ${data.siteUrl}: ${data.requestCount} requests in ${data.durationMs} ms`);
    return NextResponse.json(data, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) {
      return NextResponse.json({ error: "blocked_url", detail: err.message }, { status: 400, headers: CORS_HEADERS });
    }
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`[agent-access] failed for ${domain}: ${message}`);
    return NextResponse.json({ error: "agent_access_failed", detail: message }, { status: 502, headers: CORS_HEADERS });
  }
}
