// The panel and the dashboard must show the same score for the same page
// (Phase 3 acceptance). Both read the same Sitecore fields by the same names
// and the same live HTML, and go through the same context builder.

import { describe, expect, it } from "vitest";
import { buildPageContext, pageFieldsFromFieldMap, pageFieldsFromValues, SCORING_FIELD_NAMES } from "./context";
import { runPageChecks } from "./engine";
import { summarisePageReport } from "./adapters";
import { makeTestPageData, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import { labelForPct } from "@/lib/score-thresholds";

// Raw values as Sitecore returns them (untrimmed, empty strings).
const RAW = {
  metaTitle: "  How to build an effective content strategy in 2026 ",
  metaDescription: "",
  robotsMetaTag: "index, follow",
  updated: "20261001T090000Z",
};

describe("panel vs dashboard", () => {
  it("read the same field values", () => {
    // Panel: authoring GraphQL fields(ownFields: false), keyed by lower-cased name.
    const panel = pageFieldsFromFieldMap({
      [SCORING_FIELD_NAMES.metaTitle.toLowerCase()]: RAW.metaTitle,
      [SCORING_FIELD_NAMES.metaDescription.toLowerCase()]: RAW.metaDescription,
      [SCORING_FIELD_NAMES.robotsMetaTag.toLowerCase()]: RAW.robotsMetaTag,
      [SCORING_FIELD_NAMES.updated.toLowerCase()]: RAW.updated,
      othertemplatefield: "ignored",
    });
    // Dashboard: aliased field(name: …) { value } nodes from the tree walk.
    const dashboard = pageFieldsFromValues(RAW);
    expect(panel).toEqual(dashboard);
    expect(dashboard).toEqual({
      metaTitle: "How to build an effective content strategy in 2026",
      metaDescription: null,
      robotsMetaTag: "index, follow",
      updated: "20261001T090000Z",
    });
  });

  it("give the same score for the same page", () => {
    const data = makeTestPageData();
    const common = {
      pageUrl: data.pageUrl,
      templateName: data.templateName,
      html: data.parsedHtml,
      ai: data.ai,
      psi: null, // the dashboard doesn't run PageSpeed
      organization: data.organization,
    };
    const panel = runPageChecks(buildPageContext({ ...common, route: data.route, fields: pageFieldsFromFieldMap({ pagetitle: RAW.metaTitle, robotsmetatag: RAW.robotsMetaTag, __updated: RAW.updated }) }));
    const dashboard = summarisePageReport(
      runPageChecks(buildPageContext({ ...common, route: data.route, fields: pageFieldsFromValues({ ...RAW, metaDescription: null }) })),
    );
    expect(dashboard.score).toBe(panel.score);
    expect(dashboard.label).toBe(labelForPct(panel.score!));
  });

  it("show the same score for the demo page in both demo views", () => {
    const data = makeTestPageData();
    const panel = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
    const row = makeTestSitePages().find((r) => r.route === data.route)!;
    expect(row.score?.score).toBe(panel.score);
  });
});

describe("labelForPct (shared thresholds: 80 / 60)", () => {
  it.each([
    [0, "critical"],
    [59.9, "critical"],
    [60, "warning"],
    [79.9, "warning"],
    [80, "good"],
    [100, "good"],
  ] as const)("%d%% → %s", (pct, label) => {
    expect(labelForPct(pct)).toBe(label);
  });
});
