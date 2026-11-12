import { beforeEach, describe, expect, it, vi } from "vitest";
import { crossOriginReason, refuseCrossOrigin } from "./same-origin";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const APP = "is-it-agent-ready-for-sitecoreai.vercel.app";

function request(headers: Record<string, string>, method = "POST") {
  return new Request(`https://${APP}/api/ai-check`, { method, headers: { host: APP, ...headers } });
}

// The header sets come from the browser test in SPIKE-FINDINGS section 10.2.
describe("crossOriginReason", () => {
  it("accepts the app's own page, framed by Sitecore or standalone", () => {
    expect(crossOriginReason(request({ "sec-fetch-site": "same-origin", origin: `https://${APP}` }), { requireOrigin: true })).toBeNull();
    // A same-origin GET carries no Origin.
    expect(crossOriginReason(request({ "sec-fetch-site": "same-origin" }, "GET"))).toBeNull();
  });

  it("refuses another website, whatever the request looks like", () => {
    expect(crossOriginReason(request({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe("sec-fetch-site: cross-site");
    // A no-cors GET carries no Origin.
    expect(crossOriginReason(request({ "sec-fetch-site": "cross-site" }, "GET"))).toBe("sec-fetch-site: cross-site");
    expect(crossOriginReason(request({ "sec-fetch-site": "same-site" }))).toBe("sec-fetch-site: same-site");
    // Typed into the address bar.
    expect(crossOriginReason(request({ "sec-fetch-site": "none" }, "GET"))).toBe("sec-fetch-site: none");
  });

  it("refuses an Origin that isn't the route's own", () => {
    expect(crossOriginReason(request({ origin: "https://evil.example" }))).toBe("origin: https://evil.example");
    // A sandboxed frame without allow-same-origin.
    expect(crossOriginReason(request({ origin: "null" }))).toBe("origin: null");
    // Another port is another origin.
    expect(crossOriginReason(request({ origin: `https://${APP}:8443` }))).toBe(`origin: https://${APP}:8443`);
  });

  it("needs an Origin on the POST routes, so a plain curl is turned away", () => {
    expect(crossOriginReason(request({}), { requireOrigin: true })).toBe("no origin");
    expect(crossOriginReason(request({}, "GET"))).toBeNull();
  });

  it("compares with the forwarded host when there is one", () => {
    const req = new Request("http://internal:3000/api/ai-check", {
      method: "POST",
      headers: { host: "internal:3000", "x-forwarded-host": APP, origin: `https://${APP}` },
    });
    expect(crossOriginReason(req, { requireOrigin: true })).toBeNull();
  });

  it("works for local dev on any port", () => {
    const req = new Request("http://localhost:3001/api/ai-check", {
      method: "POST",
      headers: { host: "localhost:3001", origin: "http://localhost:3001", "sec-fetch-site": "same-origin" },
    });
    expect(crossOriginReason(req, { requireOrigin: true })).toBeNull();
  });
});

describe("refuseCrossOrigin", () => {
  it("answers 403 forbidden_origin, or null to go on", async () => {
    const res = refuseCrossOrigin(request({ "sec-fetch-site": "cross-site" }));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "forbidden_origin" });
    expect(refuseCrossOrigin(request({ "sec-fetch-site": "same-origin", origin: `https://${APP}` }))).toBeNull();
  });
});
