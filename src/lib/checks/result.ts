// Small builders for CheckResult, so each check only states what it found.

import type { CheckResult, CheckStatus } from "./types";

type Text = Partial<Pick<CheckResult, "fixSuggestion" | "details" | "flaggedItems" | "codePreview">>;

/** Default status for a credit: full → pass, at least half → warning, else fail. */
export function statusForCredit(credit: number): CheckStatus {
  if (credit >= 1) return "pass";
  if (credit >= 0.5) return "warning";
  return "fail";
}

export function scored(
  credit: number,
  value: string,
  message: string,
  extra: Text & { status?: CheckStatus } = {},
): CheckResult {
  const { status, ...text } = extra;
  return {
    state: "scored",
    credit,
    status: status ?? statusForCredit(credit),
    value,
    message,
    fixSuggestion: "",
    details: [],
    ...text,
  };
}

/** The data isn't available yet (or the fetch failed). Excluded from the score. */
export function notChecked(value: string, message: string, extra: Text = {}): CheckResult {
  return { state: "not-checked", credit: 0, status: "info", value, message, fixSuggestion: "", details: [], ...extra };
}

/** The check doesn't apply. Excluded from the score, never failed. */
export function notApplicable(value: string, message: string, extra: Text = {}): CheckResult {
  return { state: "not-applicable", credit: 0, status: "info", value, message, fixSuggestion: "", details: [], ...extra };
}

/** "Not yet scanned" result shared by the checks that read the live HTML. */
export const htmlNotScanned = () =>
  notChecked("Not yet scanned", "Run a scan to check this from the rendered page.");
