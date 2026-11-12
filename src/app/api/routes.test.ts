import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as agentAccess from "./agent-access/route";
import * as aiCheck from "./ai-check/route";
import * as assist from "./assist/route";
import * as citationProbe from "./citation-probe/route";
import * as generateMeta from "./generate-meta/route";
import * as markdownCheck from "./markdown-check/route";
import * as previewFetch from "./preview-fetch/route";
import * as psiCheck from "./psi-check/route";

// Plan Phase 12: every route refuses another website before it does any work,
// and none answers a CORS preflight.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const APP = "app.example";
const GET_ROUTES = { "agent-access": agentAccess, "markdown-check": markdownCheck, "preview-fetch": previewFetch, "psi-check": psiCheck };
const POST_ROUTES = { "ai-check": aiCheck, assist, "citation-probe": citationProbe, "generate-meta": generateMeta };

const req = (route: string, method: string, headers: Record<string, string>) =>
  new NextRequest(`https://${APP}/api/${route}?url=https://example.com/&domain=example.com`, {
    method,
    headers: { host: APP, ...headers },
    ...(method === "POST" ? { body: "{}" } : {}),
  });

describe.each(Object.entries({ ...GET_ROUTES, ...POST_ROUTES }))("/api/%s", (route, mod) => {
  const handler = "POST" in mod ? mod.POST : (mod as typeof agentAccess).GET;
  const method = "POST" in mod ? "POST" : "GET";

  it("refuses another website with a 403", async () => {
    const res = await handler(req(route, method, { "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("has no OPTIONS handler (no CORS preflight)", () => {
    expect("OPTIONS" in mod).toBe(false);
  });
});

describe.each(Object.entries(POST_ROUTES))("/api/%s (Claude)", (route, mod) => {
  it("refuses a POST with no Origin (a plain curl)", async () => {
    const res = await mod.POST(req(route, "POST", { "content-type": "application/json" }));
    expect(res.status).toBe(403);
  });

  it("refuses a text/plain POST from another site (no preflight)", async () => {
    const res = await mod.POST(req(route, "POST", { "content-type": "text/plain", origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
  });
});
