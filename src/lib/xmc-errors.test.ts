import { describe, expect, it } from "vitest";
import { isHostAuthError } from "@/lib/xmc-errors";

const HOST_MESSAGE =
  "[HostSDK] Error processing generic api request: Error: Authentication required but getAccessToken method not provided";

describe("isHostAuthError", () => {
  it("matches the host's refusal as an Error", () => {
    expect(isHostAuthError(new Error(HOST_MESSAGE))).toBe(true);
  });

  it("matches the refusal as a plain string", () => {
    expect(isHostAuthError(HOST_MESSAGE)).toBe(true);
  });

  it("matches a core bridge error that carries the text in details.reason", () => {
    const err = { code: "EXECUTION_ERROR", message: "Request failed", details: { reason: HOST_MESSAGE } };
    expect(isHostAuthError(err)).toBe(true);
  });

  it("matches an HTTP error envelope (detail / title)", () => {
    expect(isHostAuthError({ status: 401, title: HOST_MESSAGE })).toBe(true);
    expect(isHostAuthError({ data: { error: { detail: "getAccessToken method not provided" } } })).toBe(true);
  });

  it("matches an Error whose cause is the envelope", () => {
    const envelope = { status: 401, detail: "other text", title: HOST_MESSAGE };
    expect(isHostAuthError(new Error("Host authorization refused", { cause: envelope }))).toBe(true);
  });

  it("ignores a plain 401 from an API, so its fallbacks still run", () => {
    expect(isHostAuthError({ status: 401, title: "Authentication required" })).toBe(false);
    expect(isHostAuthError({ status: 401, detail: "Unauthorized: missing scope sites" })).toBe(false);
  });

  it("matches inside an array of errors", () => {
    expect(isHostAuthError([{ message: "other" }, { message: HOST_MESSAGE }])).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isHostAuthError(new Error("Could not find Home item"))).toBe(false);
    expect(isHostAuthError({ status: 403, title: "Forbidden" })).toBe(false);
    expect(isHostAuthError(null)).toBe(false);
    expect(isHostAuthError(undefined)).toBe(false);
    expect(isHostAuthError(42)).toBe(false);
  });

  it("stops at the depth limit", () => {
    const deep = { error: { error: { error: { error: { error: { message: HOST_MESSAGE } } } } } };
    expect(isHostAuthError(deep)).toBe(false);
  });
});
