import { describe, expect, it, vi } from "vitest";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import {
  auditLine,
  imageFieldAlt,
  imageFieldMediaId,
  richTextWithText,
  setImageAlt,
  writeDisabledReason,
  writeField,
  type WriteRequest,
} from "./write";
import { HOST_AUTH_WRITE_MESSAGE } from "@/lib/xmc-errors";

const PAGE_ID = "390f45a7-21f8-44cc-add8-3289a35ce403";

/** A fake client: `mutate(key, args)` answers from the handlers by key. */
function fakeClient(handlers: Record<string, (args: unknown) => unknown>) {
  const calls: Array<{ key: string; args: unknown }> = [];
  const client = {
    mutate: vi.fn(async (key: string, args: unknown) => {
      calls.push({ key, args });
      const h = handlers[key];
      if (!h) throw new Error(`unexpected ${key}`);
      return h(args);
    }),
  } as unknown as ClientSDK;
  return { client, calls };
}

const gqlBody = (args: unknown) => (args as { params: { body: { query: string; variables: Record<string, unknown> } } }).params.body;

const metaRequest: WriteRequest = {
  target: { via: "updateFields", pageId: `{${PAGE_ID.toUpperCase()}}`, language: "en", field: "MetaDescription" },
  label: "Meta description",
  itemLabel: "Banking Sector Earnings Point to Resilience",
  before: "Old.",
  after: "New description.",
};

describe("writeField: updateFields (page fields)", () => {
  it("writes, reads the value back and reports the version", async () => {
    const { client, calls } = fakeClient({
      "xmc.pages.updateFields": () => ({ data: { pageId: PAGE_ID } }),
      "xmc.authoring.graphql": () => ({ data: { data: { item: { version: 1, field: { value: "New description." } } } } }),
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await writeField(client, "ctx", metaRequest);
    expect(res).toMatchObject({ ok: true, value: "New description.", version: 1 });
    // The page ID goes out in normalizeItemId form, with the Context ID.
    const params = (calls[0].args as { params: { path: { pageId: string }; query: unknown } }).params;
    expect(params.path.pageId).toBe(PAGE_ID);
    expect(params.query).toEqual({ sitecoreContextId: "ctx" });
    expect(gqlBody(calls[1].args).variables).toMatchObject({ id: PAGE_ID, field: "MetaDescription" });
    expect(info.mock.calls[0][0]).toMatch(/^\[audit\] wrote: Meta description on Banking/);
    info.mockRestore();
  });

  it("fails when the read-back differs", async () => {
    const { client } = fakeClient({
      "xmc.pages.updateFields": () => ({ data: { pageId: PAGE_ID } }),
      "xmc.authoring.graphql": () => ({ data: { data: { item: { version: 1, field: { value: "Old." } } } } }),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await writeField(client, undefined, metaRequest);
    expect(res).toMatchObject({ ok: false, reason: "Sitecore didn't keep the new value." });
  });

  it("shows the host-refusal message", async () => {
    const { client } = fakeClient({
      "xmc.pages.updateFields": () => {
        throw new Error("[HostSDK] Authentication required but getAccessToken method not provided");
      },
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await writeField(client, undefined, metaRequest);
    expect(res).toMatchObject({ ok: false, reason: HOST_AUTH_WRITE_MESSAGE });
  });

  it("treats an error envelope as a failure", async () => {
    const { client } = fakeClient({ "xmc.pages.updateFields": () => ({ error: { message: "Forbidden" } }) });
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect((await writeField(client, undefined, metaRequest)).ok).toBe(false);
  });
});

describe("writeField: updateItem (datasources)", () => {
  const faq: WriteRequest = {
    target: { via: "updateItem", itemId: "14D517FE-633D-4B93-9BE8-80DB6FBB148B", language: "en", field: "content" },
    label: "FAQ answer",
    itemLabel: "FAQs/Data/Faq1",
    before: "<p>Old</p>",
    after: "<p>New</p>",
  };

  it("sends the ID as ID! and reads the value from the payload", async () => {
    const { client, calls } = fakeClient({
      "xmc.authoring.graphql": () => ({ data: { data: { updateItem: { item: { version: 1, field: { value: "<p>New</p>" } } } } } }),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await writeField(client, undefined, faq);
    expect(res).toMatchObject({ ok: true, version: 1 });
    const body = gqlBody(calls[0].args);
    expect(body.query).toContain("$id: ID!");
    expect(body.variables.id).toBe("14d517fe-633d-4b93-9be8-80db6fbb148b");
  });

  it("fails on any errors entry, even with data alongside", async () => {
    const { client } = fakeClient({
      "xmc.authoring.graphql": () => ({
        data: { data: { updateItem: { item: { version: 1, field: { value: "<p>New</p>" } } } }, errors: [{ message: "Access denied" }] },
      }),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await writeField(client, undefined, faq)).toMatchObject({ ok: false, reason: "Access denied" });
  });
});

describe("auditLine", () => {
  it("names the item, field, change and that nothing was published", () => {
    const line = auditLine(metaRequest, { ok: true, value: "New description.", version: 1, ms: 600 });
    expect(line).toBe(
      `[audit] wrote: Meta description on Banking Sector Earnings Point to Resilience (${PAGE_ID}, field "MetaDescription", en, updateFields): "Old." → "New description.", version 1, 600 ms, not published`,
    );
  });
  it("gives the reason on a failure", () => {
    expect(auditLine(metaRequest, { ok: false, reason: "Access denied", ms: 10 })).toMatch(/^\[audit\] write failed: .* — Access denied$/);
  });
});

describe("writeDisabledReason", () => {
  const ok = { hasClient: true, demo: false, configuredField: "MetaDescription", fieldOnItem: "MetaDescription" };
  it("allows a write when everything is in place", () => expect(writeDisabledReason(ok)).toBeNull());
  it("explains each reason", () => {
    expect(writeDisabledReason({ ...ok, demo: true })).toBe("Demo: nothing is written to Sitecore.");
    expect(writeDisabledReason({ ...ok, hasClient: false })).toMatch(/Open this in SitecoreAI/);
    expect(writeDisabledReason({ ...ok, configuredField: null, fieldOnItem: null })).toMatch(/copy it instead/);
    expect(writeDisabledReason({ ...ok, fieldOnItem: null })).toBe(`This page's template has no "MetaDescription" field.`);
    expect(writeDisabledReason({ ...ok, canEdit: false })).toMatch(/can't edit/);
  });
});

describe("image fields", () => {
  const value = '<image mediaid="C61FE8F9-7432-4C0D-99D2-500AD6EBF3B3" />';
  it("adds alt, replaces an existing one, and escapes it", () => {
    expect(setImageAlt(value, "Bank analysts reviewing results")).toBe(
      '<image mediaid="C61FE8F9-7432-4C0D-99D2-500AD6EBF3B3" alt="Bank analysts reviewing results" />',
    );
    expect(setImageAlt('<image mediaid="X" alt="people-discussing" />', 'A "team" & advisor')).toBe(
      '<image mediaid="X" alt="A &quot;team&quot; &amp; advisor" />',
    );
    expect(setImageAlt("not an image", "x")).toBeNull();
  });
  it("reads alt and the media ID", () => {
    expect(imageFieldAlt('<image mediaid="X" alt="A &amp; B" />')).toBe("A & B");
    expect(imageFieldAlt(value)).toBeNull();
    expect(imageFieldMediaId(value)).toBe("c61fe8f9-7432-4c0d-99d2-500ad6ebf3b3");
  });
});

describe("richTextWithText", () => {
  it("keeps the editor's wrapper", () => {
    expect(richTextWithText('<div class="ck-content"><p>Yes. Our first meeting…</p></div>', "Yes — it's free & there's no obligation."))
      .toBe('<div class="ck-content"><p>Yes — it\'s free &amp; there\'s no obligation.</p></div>');
  });
  it("uses a plain paragraph without a wrapper", () => {
    expect(richTextWithText("<p>a</p><p>b</p>", "One answer.")).toBe("<p>One answer.</p>");
  });
});
