import { NextRequest, NextResponse } from "next/server";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { safeFetch, SafeFetchError } from "@/lib/server/safe-fetch";
import { refuseCrossOrigin } from "@/lib/server/same-origin";

export async function GET(req: NextRequest) {
  const refused = refuseCrossOrigin(req);
  if (refused) return refused;
  const url = req.nextUrl.searchParams.get("url");
  const token = req.nextUrl.searchParams.get("token");

  if (!url) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Token is optional. When present, request the in-editing preview render
  // (Next.js head app honours x-prerender-revalidate); when absent, fetch the
  // published page as a normal request.
  const fetchHeaders: Record<string, string> = {};
  if (token) fetchHeaders["x-prerender-revalidate"] = token;

  try {
    const res = await safeFetch(url, {
      headers: fetchHeaders,
      timeoutMs: 10_000,
    });

    if (!res.ok) {
      console.error(`[preview-fetch] ${res.status} fetching ${url}`);
      return NextResponse.json(
        { error: "preview_fetch_failed", status: res.status, url },
        { status: 502 }
      );
    }

    const html = await res.text();
    const parsed = extractParsedHtml(html);
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    if (err instanceof SafeFetchError && err.isBadInput) {
      console.warn(`[preview-fetch] blocked ${url}: ${message}`);
      return NextResponse.json(
        { error: "blocked_url", detail: message, url },
        { status: 400 }
      );
    }
    console.error(`[preview-fetch] threw fetching ${url}: ${message}`);
    return NextResponse.json(
      { error: "preview_fetch_failed", detail: message, url },
      { status: 502 }
    );
  }
}
