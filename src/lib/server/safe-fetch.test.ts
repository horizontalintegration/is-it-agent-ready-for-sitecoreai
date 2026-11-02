import http from "node:http";
import type dns from "node:dns";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSafeFetch,
  isBlockedAddress,
  SafeFetchError,
  validateUrl,
} from "./safe-fetch";

const NO_ALLOW = new Set<string>();

async function expectCode(p: Promise<unknown>, code: SafeFetchError["code"]) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected ${code}`).toBeInstanceOf(SafeFetchError);
  expect((err as SafeFetchError).code).toBe(code);
}

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:a00:1", // IPv4-mapped 10.0.0.1, hex form
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1", // NAT64
    "2002:7f00:1::", // 6to4
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  // Guards against a net.BlockList trap: an ::ffff:0:0/96 rule would block every IPv4 address.
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.32.0.1", // just outside 172.16.0.0/12
    "::ffff:8.8.8.8",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
  ])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("treats anything that isn't an IP as blocked", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("validateUrl", () => {
  it.each(["https://example.com/page", "http://example.com:8080/a?b=1", "https://93.184.216.34/"])(
    "accepts %s",
    (url) => {
      expect(validateUrl(url, NO_ALLOW).href).toBeTruthy();
    },
  );

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://user:pass@example.com/",
  ])("rejects %s", (url) => {
    expect(() => validateUrl(url, NO_ALLOW)).toThrowError(SafeFetchError);
  });

  it.each([
    "http://127.0.0.1/",
    "http://2130706433/", // decimal 127.0.0.1
    "http://0x7f.1/", // hex
    "http://017700000001/", // octal
    "http://127.1/",
    "http://0.0.0.0:3000/",
    "http://10.0.0.5:8080/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fe80::1]/",
  ])("rejects the private IP literal %s", (url) => {
    try {
      validateUrl(url, NO_ALLOW);
      expect.unreachable();
    } catch (err) {
      expect((err as SafeFetchError).code).toBe("blocked_url");
      expect((err as SafeFetchError).isBadInput).toBe(true);
    }
  });

  it("rejects garbage as invalid_url", () => {
    expect(() => validateUrl("not a url", NO_ALLOW)).toThrowError(/Not a valid URL/);
  });

  it("lets allow-listed hosts through", () => {
    expect(validateUrl("http://127.0.0.1:3000/", new Set(["127.0.0.1"])).port).toBe("3000");
  });
});

describe("DNS check at connect time", () => {
  // A fake resolver: no real DNS, and nothing is ever connected to.
  const fakeLookup = ((hostname: string, _options: unknown, callback: (...args: unknown[]) => void) => {
    const table: Record<string, dns.LookupAddress[]> = {
      "rebind.test": [{ address: "10.0.0.1", family: 4 }],
      "metadata.test": [{ address: "169.254.169.254", family: 4 }],
      "mixed.test": [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      "v6loop.test": [{ address: "::1", family: 6 }],
    };
    const hit = table[hostname];
    if (!hit) callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
    else callback(null, hit);
  }) as unknown as typeof dns.lookup;

  const safeFetch = createSafeFetch({ lookup: fakeLookup });

  it.each(["rebind.test", "metadata.test", "mixed.test", "v6loop.test"])(
    "blocks a hostname resolving to a private address (%s)",
    async (host) => {
      await expectCode(safeFetch(`http://${host}/`, { timeoutMs: 2_000 }), "blocked_url");
    },
  );

  it("blocks localhost through the real resolver", async () => {
    // Not port 1: fetch refuses it as a "bad port" before any DNS lookup.
    await expectCode(createSafeFetch()("http://localhost:65000/", { timeoutMs: 2_000 }), "blocked_url");
  });

  it("reports a DNS failure as fetch_failed", async () => {
    await expectCode(safeFetch("http://nowhere.test/", { timeoutMs: 2_000 }), "fetch_failed");
  });
});

describe("safeFetch against a local server", () => {
  let server: http.Server;
  let other: http.Server;
  let base = "";
  let otherBase = "";
  let lastOtherToken: string | undefined;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/ok") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`token=${req.headers["x-prerender-revalidate"] ?? ""}`);
      } else if (url === "/redirect-same") {
        res.writeHead(302, { location: "/ok" });
        res.end();
      } else if (url === "/redirect-metadata") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (url === "/redirect-localhost") {
        // localhost isn't allow-listed, so the DNS check must stop this hop.
        res.writeHead(302, { location: `http://localhost:${(server.address() as AddressInfo).port}/ok` });
        res.end();
      } else if (url === "/redirect-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
      } else if (url === "/loop") {
        res.writeHead(302, { location: "/loop" });
        res.end();
      } else if (url === "/redirect-other") {
        res.writeHead(302, { location: `${otherBase}/token` });
        res.end();
      } else if (url === "/big-chunked") {
        res.writeHead(200, { "content-type": "text/plain" });
        const chunk = "x".repeat(64 * 1024);
        for (let i = 0; i < 40; i++) res.write(chunk); // 2.5 MB, no content-length
        res.end();
      } else if (url === "/big-declared") {
        res.writeHead(200, { "content-length": String(10 * 1024 * 1024) });
        res.end();
      } else if (url === "/hang") {
        // never respond
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    other = http.createServer((req, res) => {
      lastOtherToken = req.headers["x-prerender-revalidate"] as string | undefined;
      res.writeHead(200);
      res.end(`other ua=${req.headers["user-agent"] ?? ""}`);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    otherBase = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    other.closeAllConnections();
    server.close();
    other.close();
  });

  const safeFetch = createSafeFetch({ allowHosts: ["127.0.0.1"] });
  const token = { "x-prerender-revalidate": "secret" };

  it("fetches an allowed URL and sends the caller's headers", async () => {
    const res = await safeFetch(`${base}/ok`, { headers: token });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("token=secret");
  });

  it("follows a same-origin redirect and keeps the headers", async () => {
    const res = await safeFetch(`${base}/redirect-same`, { headers: token });
    expect(await res.text()).toBe("token=secret");
  });

  it("drops the caller's headers on a cross-origin redirect", async () => {
    lastOtherToken = "unset";
    const res = await safeFetch(`${base}/redirect-other`, { headers: token });
    expect(await res.text()).toMatch(/^other/);
    expect(lastOtherToken).toBeUndefined();
  });

  it("keeps the public headers on a cross-origin redirect", async () => {
    const res = await safeFetch(`${base}/redirect-other`, { headers: token, publicHeaders: { "user-agent": "GPTBot/1.1" } });
    expect(await res.text()).toBe("other ua=GPTBot/1.1");
    expect(lastOtherToken).toBeUndefined();
  });

  it("reports the final URL after redirects", async () => {
    expect((await safeFetch(`${base}/redirect-other`)).url).toBe(`${otherBase}/token`);
    expect((await safeFetch(`${base}/ok`)).url).toBe(`${base}/ok`);
  });

  it("stops when the caller's signal aborts, reported as a timeout", async () => {
    await expectCode(safeFetch(`${base}/hang`, { timeoutMs: 5_000, signal: AbortSignal.timeout(200) }), "timeout");
  });

  it("blocks a redirect to the cloud metadata address", async () => {
    await expectCode(safeFetch(`${base}/redirect-metadata`), "blocked_url");
  });

  it("blocks a redirect to a host that resolves to loopback", async () => {
    await expectCode(safeFetch(`${base}/redirect-localhost`), "blocked_url");
  });

  it("blocks a redirect to a non-http scheme", async () => {
    await expectCode(safeFetch(`${base}/redirect-file`), "blocked_url");
  });

  it("stops after maxRedirects", async () => {
    await expectCode(safeFetch(`${base}/loop`, { maxRedirects: 3 }), "too_many_redirects");
  });

  it("caps a streamed body", async () => {
    await expectCode(safeFetch(`${base}/big-chunked`, { maxBytes: 1024 * 1024 }), "too_large");
  });

  it("rejects a declared Content-Length over the cap", async () => {
    await expectCode(safeFetch(`${base}/big-declared`, { maxBytes: 1024 * 1024 }), "too_large");
  });

  it("times out", async () => {
    await expectCode(safeFetch(`${base}/hang`, { timeoutMs: 200 }), "timeout");
  });

  it("returns non-2xx responses rather than throwing", async () => {
    const res = await safeFetch(`${base}/missing`);
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });
});
