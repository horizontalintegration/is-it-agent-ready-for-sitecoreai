// The panel and the dashboard give the same score for the same inputs (Phase 3
// acceptance). Both read the same Sitecore fields by the same names and the
// same live HTML, and go through the same context builder. Since Phase 4 the
// panel also scores its Page Builder draft, so its score follows unpublished
// edits and client-rendered content, and can differ from the dashboard's.

import { describe, expect, it } from "vitest";
import { buildPageContext, pageFieldsFromFieldMap, pageFieldsFromValues, SCORING_FIELD_NAMES } from "./context";
import { runPageChecks } from "./engine";
import { summarisePageReport } from "./view-model";
import { makeTestDraft, makeTestPageData, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
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

  it("show the same score for the demo page on live HTML", () => {
    const data = makeTestPageData();
    const panel = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
    const row = makeTestSitePages().find((r) => r.route === data.route)!;
    expect(row.score?.score).toBe(panel.score);
  });

  it("differ when the panel scores a draft (plan section 7): the dashboard has none", () => {
    const data = makeTestPageData();
    const live = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
    const draft = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml, draft: makeTestDraft() }));
    expect(live.outcomes.find((o) => o.check.ref === "P3")!.result.state).toBe("not-checked");
    expect(draft.outcomes.find((o) => o.check.ref === "P3")!.result.state).toBe("scored");
    expect(draft.score).not.toBe(live.score);
  });
});

describe("labelForPct (shared thresholds: 80 / 60)", () => {
  it.each([
    [0, "not-ready"],
    [59.9, "not-ready"],
    [60, "almost-there"],
    [79.9, "almost-there"],
    [80, "agent-ready"],
    [100, "agent-ready"],
  ] as const)("%d%% → %s", (pct, label) => {
    expect(labelForPct(pct)).toBe(label);
  });
});
