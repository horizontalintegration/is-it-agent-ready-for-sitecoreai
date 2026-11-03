import { describe, expect, it } from "vitest";
import { buildSitePagesQuery } from "./useSitePages";

// ItemQueryInput, from the authoring schema (2026-11-03): itemId is ID, path is
// String. Sitecore rejected `$rootItemId: String!` with "The specified value
// type of field `itemId` does not match the field type".
describe("buildSitePagesQuery", () => {
  it("declares the home item ID as ID!", () => {
    const query = buildSitePagesQuery(2, "itemId");
    expect(query).toContain("query GetSitePages($rootItemId: ID!, $language: String!)");
    expect(query).toContain("item(where: { itemId: $rootItemId, language: $language })");
  });

  it("declares the home path as String!", () => {
    const query = buildSitePagesQuery(2, "path");
    expect(query).toContain("query GetSitePages($rootPath: String!, $language: String!)");
    expect(query).toContain("item(where: { path: $rootPath, language: $language })");
  });

  it("nests children to the requested depth", () => {
    expect(buildSitePagesQuery(3, "itemId").match(/children \{ nodes \{/g)).toHaveLength(3);
  });
});
