import { NextRequest, NextResponse } from "next/server";
import { extractFooterTrust } from "@/lib/server/extract-html";
import { safeFetch, SafeFetchError } from "@/lib/server/safe-fetch";
import type { FooterTrust } from "@/lib/rule-engine/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALL_ABSENT: FooterTrust = {
  hasAddress: false,
  hasContact: false,
  hasPrivacy: false,
  hasTerms: false,
  hasSecurity: false,
  hasAbout: false,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "missing_domain" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    // The footer is a shared layout element, so the site root is representative.
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const url = `${base.replace(/\/+$/, "")}/`;
    const res = await safeFetch(url, { timeoutMs: 8_000 });

    if (!res.ok) {
      return NextResponse.json(ALL_ABSENT, { headers: CORS_HEADERS });
    }

    const body = await res.text();
    return NextResponse.json(extractFooterTrust(body), { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) {
      return NextResponse.json({ error: "blocked_url", detail: err.message }, { status: 400, headers: CORS_HEADERS });
    }
    return NextResponse.json(ALL_ABSENT, { headers: CORS_HEADERS });
  }
}
