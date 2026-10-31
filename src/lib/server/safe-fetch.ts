// ────────────────────────────────────────────────────────────────────────────
// SSRF-safe fetch for every server route that fetches a caller-supplied URL.
//
// - Only http(s), and no user:password@ in the URL.
// - Blocks private, loopback, link-local (incl. cloud metadata), CGNAT,
//   multicast, reserved and documentation addresses, IPv4 and IPv6.
// - The address check runs when the socket connects (a custom DNS lookup on
//   the undici Agent), so a hostname can't pass a check and then re-resolve
//   to a private address (DNS rebinding). IP-literal hosts skip DNS, so they
//   are checked up front.
// - Follows at most `maxRedirects` redirects, re-checking every hop, and
//   drops the caller's headers (e.g. the editing token) on a cross-origin hop.
// - One timeout covers redirects and the body; the body is capped at `maxBytes`.
//
// SAFE_FETCH_ALLOW_HOSTS (comma-separated hostnames) skips the address check
// for those hosts, e.g. `localhost` when scanning a local rendering host in
// development. Leave it unset in production.
// ────────────────────────────────────────────────────────────────────────────

import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export type SafeFetchErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "too_many_redirects"
  | "too_large"
  | "timeout"
  | "fetch_failed";

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }

  /** True when the caller's URL was rejected (answer 400), not when the fetch failed (502). */
  get isBadInput(): boolean {
    return this.code === "invalid_url" || this.code === "blocked_url";
  }
}

// IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are matched against the IPv4
// rules by net.BlockList. Don't add ::ffff:0:0/96 itself: BlockList would then
// match every IPv4 address against it and block the whole internet.
const BLOCKED_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

const BLOCKED_IPV6: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback (::1) and IPv4-compatible
  ["64:ff9b::", 96], // NAT64 (embeds an IPv4 address)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo (embeds an IPv4 address)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds an IPv4 address)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];

const BLOCK_LIST = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV4) BLOCK_LIST.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of BLOCKED_IPV6) BLOCK_LIST.addSubnet(address, prefix, "ipv6");

/** True for any address a server-side fetch must not reach (and for anything that isn't an IP). */
export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 0) return true;
  try {
    return BLOCK_LIST.check(address, version === 4 ? "ipv4" : "ipv6");
  } catch {
    return true; // e.g. an IPv6 zone ID BlockList can't parse
  }
}

function normaliseHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

/**
 * Parse and check a URL before fetching it. DNS names are checked later, at
 * connect time; IP literals (including forms like `http://2130706433/`, which
 * URL parsing normalises to 127.0.0.1) are checked here.
 */
export function validateUrl(raw: string, allowHosts: ReadonlySet<string> = ENV_ALLOW_HOSTS): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", `Not a valid URL: ${raw.slice(0, 200)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("blocked_url", `Only http and https URLs are allowed (got ${url.protocol})`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError("blocked_url", "URLs with credentials are not allowed");
  }
  const host = normaliseHost(url.hostname);
  if (!host) throw new SafeFetchError("invalid_url", "URL has no host");
  if (!allowHosts.has(host) && net.isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new SafeFetchError("blocked_url", `Address ${host} is not allowed`);
  }
  return url;
}

type LookupFn = typeof dns.lookup;

/** A dns.lookup replacement for net.connect that refuses blocked addresses. */
function createGuardedLookup(allowHosts: ReadonlySet<string>, baseLookup: LookupFn): net.LookupFunction {
  return (hostname, options, callback) => {
    baseLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) {
        callback(err, "", 0);
        return;
      }
      const list = addresses as unknown as dns.LookupAddress[];
      if (!allowHosts.has(normaliseHost(hostname))) {
        const blocked = list.find((a) => isBlockedAddress(a.address));
        if (blocked || list.length === 0) {
          callback(
            new SafeFetchError(
              "blocked_url",
              `${hostname} resolves to an address that is not allowed (${blocked?.address ?? "none"})`,
            ),
            "",
            0,
          );
          return;
        }
      }
      if (options.all) callback(null, list);
      else callback(null, list[0].address, list[0].family);
    });
  };
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  /** Covers every redirect hop and reading the body. Default 10 s. */
  timeoutMs?: number;
  /** Largest response body accepted. Default 5 MB. */
  maxBytes?: number;
  /** Default 3. */
  maxRedirects?: number;
}

export interface SafeFetchConfig {
  /** Hostnames that skip the address check. */
  allowHosts?: Iterable<string>;
  /** DNS lookup to guard (tests inject a fake one). */
  lookup?: LookupFn;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError("too_large", `Response is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toSafeFetchError(err: unknown): SafeFetchError {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if (e instanceof SafeFetchError) return e;
    const name = (e as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") {
      return new SafeFetchError("timeout", "The request timed out");
    }
  }
  const cause = (err as { cause?: { message?: string } })?.cause?.message;
  const message = err instanceof Error ? err.message : String(err);
  return new SafeFetchError("fetch_failed", cause ? `${message}: ${cause}` : message);
}

export function createSafeFetch(config: SafeFetchConfig = {}) {
  const allowHosts = new Set([...(config.allowHosts ?? [])].map(normaliseHost));
  const dispatcher = new Agent({
    connect: { lookup: createGuardedLookup(allowHosts, config.lookup ?? dns.lookup) },
  });

  /** GET a URL safely. Resolves to a standard Response with the (capped) body buffered. */
  return async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
    const {
      headers = {},
      timeoutMs = 10_000,
      maxBytes = DEFAULT_MAX_BYTES,
      maxRedirects = 3,
    } = options;
    const signal = AbortSignal.timeout(timeoutMs);
    let url = validateUrl(rawUrl, allowHosts);
    const firstOrigin = url.origin;

    try {
      for (let redirects = 0; ; redirects++) {
        const res = await undiciFetch(url.href, {
          headers: url.origin === firstOrigin ? headers : {},
          redirect: "manual",
          signal,
          dispatcher,
        });

        const location = res.headers.get("location");
        if (REDIRECT_STATUSES.has(res.status) && location) {
          await res.body?.cancel();
          if (redirects >= maxRedirects) {
            throw new SafeFetchError("too_many_redirects", `More than ${maxRedirects} redirects`);
          }
          url = validateUrl(new URL(location, url).href, allowHosts);
          continue;
        }

        const declared = Number(res.headers.get("content-length"));
        if (declared > maxBytes) {
          await res.body?.cancel();
          throw new SafeFetchError("too_large", `Response is larger than ${maxBytes} bytes`);
        }
        const body = await readCapped(res.body as ReadableStream<Uint8Array> | null, maxBytes);
        return new Response(NULL_BODY_STATUSES.has(res.status) ? null : body, {
          status: res.status,
          statusText: res.statusText,
          headers: Array.from(res.headers.entries()),
        });
      }
    } catch (err) {
      throw toSafeFetchError(err);
    }
  };
}

const ENV_ALLOW_HOSTS: ReadonlySet<string> = new Set(
  (process.env.SAFE_FETCH_ALLOW_HOSTS ?? "")
    .split(",")
    .map((h) => normaliseHost(h.trim()))
    .filter(Boolean),
);

/** The app-wide safe fetch, honouring SAFE_FETCH_ALLOW_HOSTS. */
export const safeFetch = createSafeFetch({ allowHosts: ENV_ALLOW_HOSTS });
