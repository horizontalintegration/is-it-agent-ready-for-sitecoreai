import { describe, expect, it } from "vitest";
import { timeAgo } from "./relative-time";

describe("timeAgo", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  it.each([
    ["2026-11-02T11:59:30Z", "just now"],
    ["2026-11-02T11:55:00Z", "5 min ago"],
    ["2026-11-02T10:00:00Z", "2 h ago"],
    ["2026-11-01T11:00:00Z", "1 day ago"],
    ["2026-10-30T12:00:00Z", "3 days ago"],
  ])("%s → %s", (at, text) => {
    expect(timeAgo(at, now)).toBe(text);
  });
  it("is null without a date", () => {
    expect(timeAgo(null)).toBeNull();
    expect(timeAgo("not a date")).toBeNull();
  });
});
