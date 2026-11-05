import { describe, expect, it } from "vitest";
import { chooseSite, siteOptionsFromListing, siteOrigin, type SiteOption } from "./sites";

// The shape xmc.sites.listSites returned in SitecoreAI (SPIKE-FINDINGS §11):
// the first site has no host name, and BrandKS is on the BrandX replica.
const LISTING = [
  { id: "ccf402fa", name: "kpdemo", displayName: "KPDemo", hosts: [{ name: "kpdemo", targetHostname: "", homePageId: "d54a4cf1" }] },
  { id: "bfc09fc6", name: "BrandX", displayName: "", hosts: [{ name: "BrandX", targetHostname: "blueprint-brandx.horizontaldigital.com", homePageId: "e9abafa1" }] },
  { id: "4b1eb4e1", name: "BrandKS", displayName: "", hosts: [{ name: "BrandKS", targetHostname: "hztl-page-health-checker-demo.vercel.app", homePageId: "49264871" }] },
  { id: "21edc976", name: "Shared", displayName: "", hosts: [{ name: "Shared", targetHostname: "", homePageId: "16b16daf" }] },
];
const SITES = siteOptionsFromListing(LISTING);
const REPLICA = "https://hztl-page-health-checker-demo.vercel.app";

describe("siteOptionsFromListing", () => {
  it("keeps each site's ID, name, origin and home item", () => {
    expect(SITES).toEqual<SiteOption[]>([
      { id: "ccf402fa", name: "KPDemo", domain: "", homePageId: "d54a4cf1" },
      { id: "bfc09fc6", name: "BrandX", domain: "https://blueprint-brandx.horizontaldigital.com", homePageId: "e9abafa1" },
      { id: "4b1eb4e1", name: "BrandKS", domain: REPLICA, homePageId: "49264871" },
      { id: "21edc976", name: "Shared", domain: "", homePageId: "16b16daf" },
    ]);
  });

  it("reads nothing from a body that isn't a list", () => {
    expect(siteOptionsFromListing({ error: { status: 401 } })).toEqual([]);
    expect(siteOptionsFromListing(undefined)).toEqual([]);
  });
});

describe("siteOrigin", () => {
  it("adds https to a bare host name and drops a path", () => {
    expect(siteOrigin("example.com")).toBe("https://example.com");
    expect(siteOrigin("http://example.com/")).toBe("http://example.com");
    expect(siteOrigin("")).toBe("");
    expect(siteOrigin(null)).toBe("");
  });
});

describe("chooseSite", () => {
  it("opens on the site picked last time", () => {
    expect(chooseSite(SITES, "bfc09fc6", REPLICA)?.name).toBe("BrandX");
  });

  it("falls back when the remembered site no longer exists", () => {
    expect(chooseSite(SITES, "deleted-site", REPLICA)?.name).toBe("BrandKS");
  });

  it("never reopens a remembered site that has no host name", () => {
    expect(chooseSite(SITES, "ccf402fa", REPLICA)?.name).toBe("BrandKS");
  });

  it("opens on the app's default domain when nothing is remembered", () => {
    expect(chooseSite(SITES, null, "hztl-page-health-checker-demo.vercel.app")?.name).toBe("BrandKS");
  });

  it("opens on the first site with a host name otherwise", () => {
    expect(chooseSite(SITES, null, "")?.name).toBe("BrandX");
    expect(chooseSite(SITES, null, "https://not-a-listed-site.example")?.name).toBe("BrandX");
  });

  it("chooses nothing when no site can be scanned", () => {
    expect(chooseSite(SITES.filter((s) => !s.domain), null, REPLICA)).toBeNull();
    expect(chooseSite([], null, REPLICA)).toBeNull();
  });
});
