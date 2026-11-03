import { describe, expect, it } from "vitest";
import { buildPagesEditorUrl, normalizeItemId, tenantNameFromHostState } from "@/lib/pages-editor-url";

describe("tenantNameFromHostState", () => {
  const CLAIM = "https://auth.sitecorecloud.io/claims/tenant_name";

  it("reads the user's tenant_name claim (the dashboard's host, 2026-11-03)", () => {
    const state = { organizationId: "org_x", xmCloudTenantInfo: { url: "https://cm" }, userInfo: { [CLAIM]: "tenant-a" } };
    expect(tenantNameFromHostState(state)).toBe("tenant-a");
  });

  it("prefers xmCloudTenantInfo.name when it's there", () => {
    expect(tenantNameFromHostState({ xmCloudTenantInfo: { name: "tenant-b" }, userInfo: { [CLAIM]: "tenant-a" } })).toBe("tenant-b");
  });

  it("returns empty when neither holds a string", () => {
    expect(tenantNameFromHostState({ xmCloudTenantInfo: { name: "" }, userInfo: { [CLAIM]: ["a", "b"] } })).toBe("");
    expect(tenantNameFromHostState(null)).toBe("");
    expect(tenantNameFromHostState(undefined)).toBe("");
  });
});

describe("normalizeItemId", () => {
  it("dashes the undashed IDs the authoring API returns (2026-11-03)", () => {
    expect(normalizeItemId("c3de83d840d64256a85e77275d2effec")).toBe("c3de83d8-40d6-4256-a85e-77275d2effec");
  });

  it("drops braces and lower-cases", () => {
    expect(normalizeItemId("{374014CE-7840-4FE8-835E-5A600C20E7B2}")).toBe("374014ce-7840-4fe8-835e-5a600c20e7b2");
  });

  it("leaves anything that isn't a GUID as it is", () => {
    expect(normalizeItemId("not-a-guid")).toBe("not-a-guid");
  });
});

describe("buildPagesEditorUrl", () => {
  const params = {
    tenantName: "tenant",
    organization: "org_x",
    itemId: "c3de83d840d64256a85e77275d2effec",
    site: "BrandKS",
  };

  it("matches Page Builder's own URL format", () => {
    const url = new URL(buildPagesEditorUrl(params)!);
    expect(url.origin + url.pathname).toBe("https://pages.sitecorecloud.io/editor");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tenantName: "tenant",
      organization: "org_x",
      sc_itemid: "c3de83d8-40d6-4256-a85e-77275d2effec",
      sc_lang: "en",
      sc_site: "BrandKS",
    });
  });

  it("returns null without a tenant name, so the caller opens the page instead", () => {
    expect(buildPagesEditorUrl({ ...params, tenantName: "" })).toBeNull();
  });
});
