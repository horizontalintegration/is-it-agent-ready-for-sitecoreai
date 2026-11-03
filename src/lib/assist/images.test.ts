import { describe, expect, it } from "vitest";
import { altStatus, imageFieldsOf, isSharedDatasource, matchImages, srcMatchesMediaPath, type ImageField } from "./images";

const PAGE = "/sitecore/content/HztlFoundation/BrandKS/Home/Resources and Insights/Market News and Updates/Banking Sector Earnings Point to Resilience";
// The Banking article's draft (src/lib/html/fixtures/brandx-article-draft.html).
const HERO = "https://xmc-horizontald67e6-hztlxcelerab5d7-prod114f.sitecorecloud.io/-/media/Project/HztlFoundation/BrandKS/Articles/campaign-creators-pypeCEaJeZY-unsplash.jpg";
const INLINE = "https://xmc-horizontald67e6-hztlxcelerab5d7-prod114f.sitecorecloud.io/-/media/37709AE5A88D4198BB56851C51207B05.ashx";

describe("image fields", () => {
  it("finds image fields among an item's values", () => {
    const found = imageFieldsOf(
      { heading: "Banking", image: '<image mediaid="C61FE8F9-7432-4C0D-99D2-500AD6EBF3B3" />', heroImage: "" },
      "page",
      { itemId: "390f45a7", itemPath: PAGE, shared: false },
    );
    expect(found).toEqual([
      { owner: "page", itemId: "390f45a7", itemPath: PAGE, shared: false, field: "image", value: '<image mediaid="C61FE8F9-7432-4C0D-99D2-500AD6EBF3B3" />', mediaId: "c61fe8f9-7432-4c0d-99d2-500ad6ebf3b3" },
    ]);
  });

  it("knows a page-local datasource from a shared one", () => {
    expect(isSharedDatasource(`${PAGE}/Data/Hero`, PAGE)).toBe(false);
    expect(isSharedDatasource("/sitecore/content/HztlFoundation/BrandKS/Data/Feature/Home - Advisor", PAGE)).toBe(true);
  });

  it("matches CM and Edge media URLs to the media path", () => {
    const media = "/Project/HztlFoundation/BrandKS/Articles/campaign-creators-pypeCEaJeZY-unsplash";
    expect(srcMatchesMediaPath(HERO, media)).toBe(true);
    expect(srcMatchesMediaPath(`https://edge.sitecorecloud.io/t/media${media}.jpg?h=1`, media)).toBe(true);
    expect(srcMatchesMediaPath(INLINE, media)).toBe(false);
  });
});

describe("altStatus", () => {
  it("flags a missing alt and a file name", () => {
    expect(altStatus(null, HERO)).toBe("missing");
    expect(altStatus("campaign-creators-pypeCEaJeZY-unsplash", HERO)).toBe("filename");
    expect(altStatus("people-discussing", "https://x/a.jpg")).toBe("filename");
    expect(altStatus("IMG_2041", "https://x/a.jpg")).toBe("filename");
    expect(altStatus("Pioneers working in initial days", INLINE)).toBe("ok");
  });
});

describe("matchImages", () => {
  const field: ImageField = {
    owner: "page",
    itemId: "390f45a7",
    itemPath: PAGE,
    field: "image",
    value: '<image mediaid="C61FE8F9-7432-4C0D-99D2-500AD6EBF3B3" alt="spike test" />',
    mediaId: "c61fe8f9-7432-4c0d-99d2-500ad6ebf3b3",
    mediaPath: "/Project/HztlFoundation/BrandKS/Articles/campaign-creators-pypeCEaJeZY-unsplash",
    shared: false,
  };

  it("pairs each image with its field, takes the field's alt, and puts images that need work first", () => {
    const targets = matchImages(
      [
        { src: INLINE, alt: "Pioneers working in initial days" },
        { src: HERO, alt: "campaign-creators-pypeCEaJeZY-unsplash" },
        { src: "data:image/svg+xml,…", alt: "" },
        { src: "https://x/-/media/logo.svg", alt: null },
      ],
      [field],
    );
    expect(targets.map((t) => [t.src.split("/").pop(), t.status, t.alt, Boolean(t.field)])).toEqual([
      ["logo.svg", "missing", null, false],
      ["37709AE5A88D4198BB56851C51207B05.ashx", "ok", "Pioneers working in initial days", false],
      ["campaign-creators-pypeCEaJeZY-unsplash.jpg", "ok", "spike test", true],
    ]);
  });
});
