import { NextRequest, NextResponse } from "next/server";
import { collectMarkdownCheck } from "@/lib/server/markdown-check";
import { SafeFetchError } from "@/lib/server/safe-fetch";
import { refuseCrossOrigin } from "@/lib/server/same-origin";

// Two requests of at most 10 s each, in parallel.
export const maxDuration = 20;

/**
 * Evidence for P5 and P6: GET /api/markdown-check?url=https://example.com/page
 * `&excerpt=1` adds the HTML's first 16 KB, classified (the panel's Agent View).
 */
export async function GET(req: NextRequest) {
  const refused = refuseCrossOrigin(req);
  if (refused) return refused;
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  try {
    const data = await collectMarkdownCheck(url, { excerpt: req.nextUrl.searchParams.get("excerpt") === "1" });
    // A hostname that resolves to a private address is only found at connect time.
    if (data.markdown.error === "blocked_url" && data.html.error === "blocked_url") {
      return NextResponse.json({ error: "blocked_url" }, { status: 400 });
    }
    console.info(
      `[markdown-check] ${data.url}: markdown ${data.markdown.status ?? data.markdown.error} ${data.markdown.contentType ?? ""}, html ${data.html.status ?? data.html.error}`,
    );
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SafeFetchError && err.isBadInput) {
      return NextResponse.json({ error: "blocked_url", detail: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`[markdown-check] failed for ${url}: ${message}`);
    return NextResponse.json({ error: "markdown_check_failed", detail: message }, { status: 502 });
  }
}
