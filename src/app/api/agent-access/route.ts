import { NextRequest, NextResponse } from "next/server";
import { collectAgentAccess } from "@/lib/server/agent-access";
import { SafeFetchError } from "@/lib/server/safe-fetch";
import { refuseCrossOrigin } from "@/lib/server/same-origin";

// The scan has its own 17 s deadline; this leaves room for the response.
export const maxDuration = 30;

/** Evidence for the site checks S1–S12: GET /api/agent-access?domain=example.com */
export async function GET(req: NextRequest) {
  const refused = refuseCrossOrigin(req);
  if (refused) return refused;
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "missing_domain" }, { status: 400 });
  }

  try {
    const data = await collectAgentAccess(domain);
    // A hostname that resolves to a private address is only found at connect time.
    if (data.home.probe.error === "blocked_url") {
      return NextResponse.json({ error: "blocked_url" }, { status: 400 });
    }
    console.info(`[agent-access] ${data.siteUrl}: ${data.requestCount} requests in ${data.durationMs} ms`);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) {
      return NextResponse.json({ error: "blocked_url", detail: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`[agent-access] failed for ${domain}: ${message}`);
    return NextResponse.json({ error: "agent_access_failed", detail: message }, { status: 502 });
  }
}
