// ────────────────────────────────────────────────────────────────────────────
// Only the app's own pages may call the API routes (plan Phase 12,
// SPIKE-FINDINGS section 10.2).
//
// - Browsers label every request with `Sec-Fetch-Site`. A call from the app's
//   own page is `same-origin`, also inside the Sitecore iframe (the label
//   compares the calling page with the URL, not with the top window). Another
//   website's call is `cross-site`, even a `text/plain` POST or a `no-cors`
//   GET, which reach the route without a CORS preflight.
// - The POST routes (the ones that call Claude) also need an `Origin` that is
//   the route's own: browsers send it on every POST, same-origin included, so
//   this also turns away a plain curl.
// - Compared with the request's own host, so production, previews and local
//   dev need no configuration.
// - Scripts can send any headers they like; the rate limits cover that.
// ────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

/** The host this request was sent to, as the browser saw it. */
function ownHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("host");
}

/** Why the request isn't from the app's own page, or null when it is. */
export function crossOriginReason(req: Request, opts: { requireOrigin?: boolean } = {}): string | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return `sec-fetch-site: ${site}`;

  const origin = req.headers.get("origin");
  if (!origin) return opts.requireOrigin ? "no origin" : null;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return `origin: ${origin}`;
  }
  const host = ownHost(req);
  if (!host || originHost !== host) return `origin: ${origin}`;
  return null;
}

/**
 * A 403 for a request from another origin, or null to go on. `requireOrigin`
 * on the POST routes.
 */
export function refuseCrossOrigin(req: Request, opts: { requireOrigin?: boolean } = {}): NextResponse | null {
  const reason = crossOriginReason(req, opts);
  if (!reason) return null;
  console.info(`[api] refused ${new URL(req.url).pathname}: ${reason}`);
  return NextResponse.json({ error: "forbidden_origin" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
