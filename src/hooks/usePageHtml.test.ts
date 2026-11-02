import { describe, expect, it } from "vitest";
import { readWithRetry } from "./usePageHtml";

// What Page Builder answers while the canvas is still loading (2026-11-02).
const NOT_READY = new Error("CoreError: [client SDK] [CANVAS BUG] Service implementation is not provided.");

/** A read that fails `failures` times, then returns the HTML. */
function flakyRead(failures: number) {
  let calls = 0;
  const read = async () => {
    calls++;
    if (calls <= failures) throw NOT_READY;
    return "<body>draft</body>";
  };
  return { read, calls: () => calls };
}

describe("readWithRetry (usePageHtml's first read of a page)", () => {
  const instant = { sleep: async () => {}, isCurrent: () => true };

  it("returns the HTML once the canvas is ready", async () => {
    const { read, calls } = flakyRead(2);
    const waits: number[] = [];
    const result = await readWithRetry(read, { ...instant, delays: [2000, 4000, 8000], onRetry: (_a, delay) => waits.push(delay) });
    expect(result).toEqual({ ok: true, value: "<body>draft</body>" });
    expect(calls()).toBe(3);
    expect(waits).toEqual([2000, 4000]);
  });

  it("gives up after the last delay with the last error", async () => {
    const { read, calls } = flakyRead(10);
    const result = await readWithRetry(read, { ...instant, delays: [2000, 4000, 8000] });
    expect(result).toEqual({ ok: false, error: NOT_READY });
    expect(calls()).toBe(4);
  });

  it("doesn't retry when there are no delays (a refresh of a page that has a draft)", async () => {
    const { read, calls } = flakyRead(1);
    expect(await readWithRetry(read, { ...instant, delays: [] })).toEqual({ ok: false, error: NOT_READY });
    expect(calls()).toBe(1);
  });

  it("stops and returns null when a newer read takes over while waiting", async () => {
    const { read, calls } = flakyRead(10);
    let current = true;
    const result = await readWithRetry(read, {
      delays: [2000, 4000],
      isCurrent: () => current,
      sleep: async () => {
        current = false; // e.g. the author moved to another page
      },
    });
    expect(result).toBeNull();
    expect(calls()).toBe(1);
  });

  it("drops a successful result when a newer read has started", async () => {
    const result = await readWithRetry(async () => "<body>old page</body>", { delays: [], isCurrent: () => false });
    expect(result).toBeNull();
  });
});
