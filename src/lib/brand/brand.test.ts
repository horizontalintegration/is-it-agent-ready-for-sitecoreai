import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOrganizationJsonLd } from "@/lib/rule-engine/helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadVoice() {
  const { getBrandVoice } = await import("./brand-voice");
  return getBrandVoice();
}

describe("getBrandVoice", () => {
  it("uses the neutral default when nothing is configured", async () => {
    vi.stubEnv("BRAND_VOICE_FILE", "");
    vi.stubEnv("BRAND_NAME", "");
    const voice = await loadVoice();
    expect(voice.name).toBeNull();
    expect(voice.source).toBe("default");
    expect(voice.document).toContain("No brand voice document is configured");
  });

  it("reads BRAND_VOICE_FILE relative to the project root", async () => {
    vi.stubEnv("BRAND_VOICE_FILE", "brand/brandx.md");
    vi.stubEnv("BRAND_NAME", "BrandX");
    const voice = await loadVoice();
    expect(voice.name).toBe("BrandX");
    expect(voice.source).toBe("brand/brandx.md");
    expect(voice.document).toMatch(/^# BrandX/);
  });

  it("falls back to the default when the file can't be read", async () => {
    vi.stubEnv("BRAND_VOICE_FILE", "brand/does-not-exist.md");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const voice = await loadVoice();
    expect(voice.source).toBe("default (file unreadable)");
  });
});

describe("getOrganizationInfo", () => {
  async function load() {
    return (await import("./organization")).getOrganizationInfo;
  }

  it("prefers NEXT_PUBLIC_ORG_* over the site fallbacks", async () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "Acme");
    vi.stubEnv("NEXT_PUBLIC_ORG_URL", "https://acme.example");
    vi.stubEnv("NEXT_PUBLIC_ORG_SAME_AS", " https://x.com/acme , ,https://linkedin.com/company/acme");
    const org = (await load())({ name: "acme-site", url: "https://www.acme-site.example" });
    expect(org).toMatchObject({
      name: "Acme",
      url: "https://acme.example/",
      sameAs: ["https://x.com/acme", "https://linkedin.com/company/acme"],
    });
  });

  it("falls back to the site's name and domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_ORG_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ORG_SAME_AS", "");
    const org = (await load())({ name: "Acme Site", url: "https://www.acme-site.example" });
    expect(org).toEqual({
      name: "Acme Site",
      url: "https://www.acme-site.example/",
      logo: null,
      description: null,
      sameAs: [],
    });
  });
});

describe("buildOrganizationJsonLd", () => {
  it("uses placeholders when the organization isn't configured", () => {
    const snippet = buildOrganizationJsonLd({ name: null, url: null, logo: null, description: null, sameAs: [] });
    expect(snippet).toContain('"name": "YOUR ORGANIZATION NAME"');
    expect(snippet).not.toContain("BrandX");
    expect(snippet).not.toContain("sameAs");
  });

  it("derives the logo placeholder from the site URL", () => {
    const snippet = buildOrganizationJsonLd({
      name: "Acme",
      url: "https://acme.example/",
      logo: null,
      description: null,
      sameAs: [],
    });
    expect(snippet).toContain('"logo": "https://acme.example/YOUR-LOGO.png"');
  });
});
