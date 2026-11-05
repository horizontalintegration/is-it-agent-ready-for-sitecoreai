"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY — Phase 14 spike (plan section 10, Phase 14; SPIKE-FINDINGS §11):
// what the full-screen extension point (`xmc:fullscreen`, opened from
// SitecoreAI's Apps menu) gives the app. Logs the host type, application,
// site and pages context, built-in authorization on xmc.sites.listSites,
// retrieveSite and one authoring GraphQL query, the tenant name, the
// language and theme, and the widget's localStorage. Read-only: no writes,
// no /api call. "Open in Page Builder" navigates only when clicked.
// Replaced by the real full-screen app in the Phase 14 build PR.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { buildSitePagesQuery } from "@/hooks/useSitePages";
import { buildPagesEditorUrl, tenantNameFromHostState } from "@/lib/pages-editor-url";

const STORAGE_KEY = "spike:fullscreen:v1";
const TENANT_NAME_CLAIM = "https://auth.sitecorecloud.io/claims/tenant_name";
const HOST_TIMEOUT_MS = 5_000;
const API_TIMEOUT_MS = 20_000;
const LANGUAGE = "en";

const subscribe = () => () => {};
const inFrameSnapshot = () => window.self !== window.top;

type Json = unknown;

interface Step {
  ms: number;
  ok: boolean;
  summary: string;
  detail?: Json;
}

interface SpikeReport {
  capturedAt: string;
  steps: Record<string, Step>;
}

interface SiteSummary {
  id: string;
  name: string;
  displayName: string;
  collectionId: string | null;
  languages: string[] | null;
  hosts: Array<{ name: string | null; targetHostname: string | null; homePageId: string | null }>;
}

/** Resolves with the value, or says the host didn't answer in time. Never throws. */
async function timed<T>(p: Promise<T>, ms: number): Promise<{ ms: number; value?: T; threw?: string; timedOut?: boolean }> {
  const t0 = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), ms);
    });
    const r = await Promise.race([p, timeout]);
    const elapsed = Math.round(performance.now() - t0);
    return r === "timeout" ? { ms: elapsed, timedOut: true } : { ms: elapsed, value: r as T };
  } catch (err) {
    return { ms: Math.round(performance.now() - t0), threw: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function failed(r: { ms: number; threw?: string; timedOut?: boolean }, label: string): Step {
  return { ms: r.ms, ok: false, summary: r.timedOut ? `${label}: no answer in ${r.ms} ms` : `${label} threw: ${r.threw}` };
}

/** The proxy sometimes wraps the payload twice (data.data). */
function unwrap(res: unknown): unknown {
  const outer = (res as { data?: unknown })?.data;
  const inner = (outer as { data?: unknown })?.data;
  return inner ?? outer ?? res;
}

function keysOf(v: unknown): string[] {
  return v && typeof v === "object" ? Object.keys(v) : [];
}

function summariseSite(s: Record<string, unknown>): SiteSummary {
  const hosts = Array.isArray(s.hosts) ? (s.hosts as Array<Record<string, unknown>>) : [];
  return {
    id: String(s.id ?? ""),
    name: String(s.name ?? ""),
    displayName: String(s.displayName ?? ""),
    collectionId: (s.collectionId as string | null) ?? null,
    languages: (s.languages as string[] | null) ?? null,
    hosts: hosts.map((h) => ({
      name: (h.name as string | null) ?? null,
      targetHostname: (h.targetHostname as string | null) ?? null,
      homePageId: (h.homePageId as string | null) ?? null,
    })),
  };
}

/** An xmc.* call's outcome: the body, or the HTTP error the SDK envelope carries. */
function apiOutcome(res: unknown): { error?: Json; body?: unknown } {
  const outer = (res as { data?: unknown })?.data;
  const error = (outer as { error?: unknown })?.error;
  if (error) return { error };
  return { body: (outer as { data?: unknown })?.data ?? outer };
}

function loadReports(): SpikeReport[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveReports(r: SpikeReport[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r.slice(-5)));
  } catch {
    // storage blocked: reports stay in memory and the console
  }
}

interface Ids {
  contextId?: string;
  organization: string;
  tenantName: string;
}

export function FullscreenSpike() {
  const inFrame = useSyncExternalStore(subscribe, inFrameSnapshot, () => false);
  const { client, isInitialized, error: clientError } = useMarketplaceClient({ autoInit: inFrame });

  const [reports, setReports] = useState<SpikeReport[]>([]);
  // Read after mount, so the server render and hydration agree.
  useEffect(() => setReports(loadReports()), []);
  const [current, setCurrent] = useState<Record<string, Step>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [ids, setIds] = useState<Ids>({ organization: "", tenantName: "" });

  const record = useCallback((key: string, step: Step) => {
    console.groupCollapsed(`[spike:fullscreen] ${key}: ${step.summary}`);
    console.log(step);
    console.groupEnd();
    setCurrent((prev) => ({ ...prev, [key]: step }));
    return step;
  }, []);

  // ── Steps 5–6: retrieveSite and one authoring query on the picked site ──
  const runSite = useCallback(
    async (c: ClientSDK, site: SiteSummary, contextId: string | undefined): Promise<Record<string, Step>> => {
      const out: Record<string, Step> = {};
      const ctxQuery = contextId ? { query: { sitecoreContextId: contextId } } : {};

      const rs = await timed(
        c.query("xmc.sites.retrieveSite", { params: { path: { siteId: site.id }, ...ctxQuery } } as Parameters<ClientSDK["query"]>[1]),
        API_TIMEOUT_MS,
      );
      if (rs.value === undefined) {
        out["5 retrieveSite"] = record("5 retrieveSite", failed(rs, "retrieveSite"));
      } else {
        const { error, body } = apiOutcome(rs.value);
        const retrieved = body && typeof body === "object" ? summariseSite(body as Record<string, unknown>) : null;
        out["5 retrieveSite"] = record("5 retrieveSite", error
          ? { ms: rs.ms, ok: false, summary: `retrieveSite error for ${site.name}`, detail: { error } }
          : { ms: rs.ms, ok: true, summary: `retrieveSite ${site.name}: ${retrieved?.hosts.length ?? 0} host(s), home ${retrieved?.hosts.find((h) => h.homePageId)?.homePageId ?? "none"}`, detail: { hosts: retrieved?.hosts } });
      }

      const homePageId = site.hosts.find((h) => h.homePageId)?.homePageId;
      if (!homePageId) {
        out["6 authoring GraphQL"] = record("6 authoring GraphQL", { ms: 0, ok: false, summary: `No homePageId for ${site.name} in listSites: query not sent` });
        return out;
      }
      const gq = await timed(
        c.mutate("xmc.authoring.graphql", {
          params: { body: { query: buildSitePagesQuery(1, "itemId"), variables: { rootItemId: homePageId, language: LANGUAGE } }, ...ctxQuery },
        } as Parameters<ClientSDK["mutate"]>[1]),
        API_TIMEOUT_MS,
      );
      if (gq.value === undefined) {
        out["6 authoring GraphQL"] = record("6 authoring GraphQL", failed(gq, "authoring GraphQL"));
        return out;
      }
      const envelope = ((gq.value as { data?: unknown })?.data ?? gq.value) as {
        data?: { item?: { name?: string; children?: { nodes?: Array<Record<string, { value?: string } | null> | null> } } | null };
        errors?: Array<{ message?: string }>;
        error?: unknown;
      };
      const root = envelope?.data?.item;
      const children = (root?.children?.nodes ?? []).filter(Boolean) as Array<Record<string, { value?: string } | null>>;
      const withLayout = children.filter((n) => n.renderings?.value?.trim() || n.finalRenderings?.value?.trim()).length;
      out["6 authoring GraphQL"] = record("6 authoring GraphQL", {
        ms: gq.ms,
        ok: Boolean(root),
        summary: root
          ? `Home "${root.name}" with ${children.length} children (${withLayout} pages)${envelope.errors?.length ? `, ${envelope.errors.length} non-fatal error(s)` : ""}`
          : `No item for ${site.name}'s home`,
        detail: { errors: (envelope.errors ?? []).slice(0, 3).map((e) => e.message), error: envelope.error, topKeys: keysOf(gq.value) },
      });
      return out;
    },
    [record],
  );

  // ── Steps 1–4 and 7–9, then 5–6 on the default site ─────────────────────
  const runAll = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setCurrent({});
    setStatus("Running…");
    const steps: Record<string, Step> = {};

    // 1. host.state, host.route, host.user
    const hs = await timed(client.query("host.state"), HOST_TIMEOUT_MS);
    const state = hs.value !== undefined ? (hs.value as { data?: unknown })?.data : undefined;
    const s = state as { environment?: unknown; language?: unknown; organizationId?: unknown; xmCloudTenantInfo?: Record<string, unknown>; userInfo?: Record<string, unknown> } | null | undefined;
    const hostType = state === null ? "portal (null)" : s?.environment !== undefined ? "xmc:xmapps ({ environment, language })" : s?.xmCloudTenantInfo || s?.userInfo ? "xmc:pages-contextview ({ organizationId, xmCloudTenantInfo, userInfo })" : "unknown";
    steps["1 host.state"] = record("1 host.state", hs.value === undefined ? failed(hs, "host.state") : {
      ms: hs.ms,
      ok: true,
      summary: `Host type: ${hostType}`,
      detail: {
        isNull: state === null,
        keys: keysOf(state),
        environment: s?.environment,
        language: s?.language,
        hasOrganizationId: Boolean(s?.organizationId),
        // Keys and names only: userInfo holds the user's profile.
        xmCloudTenantInfoKeys: keysOf(s?.xmCloudTenantInfo),
        xmCloudTenantInfoNames: {
          name: s?.xmCloudTenantInfo?.name,
          environmentName: s?.xmCloudTenantInfo?.environmentName,
          projectName: s?.xmCloudTenantInfo?.projectName,
          customerEnvironmentType: s?.xmCloudTenantInfo?.customerEnvironmentType,
        },
        userInfoKeys: keysOf(s?.userInfo),
      },
    });
    const hr = await timed(client.query("host.route"), HOST_TIMEOUT_MS);
    steps["1b host.route"] = record("1b host.route", hr.value === undefined ? failed(hr, "host.route") : { ms: hr.ms, ok: true, summary: `host.route: ${JSON.stringify((hr.value as { data?: unknown })?.data)}` });
    const hu = await timed(client.query("host.user"), HOST_TIMEOUT_MS);
    steps["1c host.user"] = record("1c host.user", hu.value === undefined ? failed(hu, "host.user") : { ms: hu.ms, ok: true, summary: "host.user answered (keys only)", detail: { keys: keysOf((hu.value as { data?: unknown })?.data) } });

    // 2. application.context: named fields only (the raw context can hold the editing secret).
    let contextId: string | undefined;
    let organization = "";
    let appTenantName = "";
    const ac = await timed(client.query("application.context"), HOST_TIMEOUT_MS);
    if (ac.value === undefined) {
      steps["2 application.context"] = record("2 application.context", failed(ac, "application.context"));
    } else {
      const app = unwrap(ac.value) as {
        type?: string; installationId?: string; organizationId?: string; touchpoints?: unknown[];
        permissions?: { iframe?: { sandbox?: string[]; allow?: string[] } };
        extensionPoints?: Array<{ extensionPointId?: string; route?: string | null; meta?: Array<{ id?: string; route?: string; title?: string }> }>;
        resourceAccess?: Array<{ tenantName?: string; context?: { preview?: string; live?: string } }>;
        resources?: Array<{ tenantName?: string; context?: { preview?: string; live?: string } }>;
      };
      const list = app?.resourceAccess ?? app?.resources ?? [];
      for (const r of list) {
        if (!appTenantName && r?.tenantName) appTenantName = r.tenantName;
        if (!contextId) contextId = r?.context?.preview || r?.context?.live || undefined;
      }
      organization = app?.organizationId ?? "";
      const extensionPoints = (app?.extensionPoints ?? []).map((e) => ({
        id: e?.extensionPointId,
        route: e?.route,
        blocks: (e?.meta ?? []).map((m) => ({ id: m?.id, route: m?.route, title: m?.title })),
      }));
      const fullscreen = extensionPoints.find((e) => e.id === "xmc:fullscreen");
      steps["2 application.context"] = record("2 application.context", {
        ms: ac.ms,
        ok: true,
        summary: `Context ID: ${contextId ? "yes" : "no"}; xmc:fullscreen route: ${fullscreen ? JSON.stringify(fullscreen.route) : "not listed"}`,
        detail: {
          marketplaceAppType: app?.type,
          installationId: app?.installationId,
          organization,
          tenantName: appTenantName,
          resourceCount: list.length,
          hasContextId: Boolean(contextId),
          extensionPoints,
          touchpointCount: app?.touchpoints?.length ?? 0,
          iframePermissions: app?.permissions?.iframe,
        },
      });
    }

    // 3. site.context and pages.context: does this host answer them?
    const sc = await timed(client.query("site.context"), HOST_TIMEOUT_MS);
    const siteInfo = sc.value !== undefined ? (unwrap(sc.value) as { siteInfo?: { siteId?: string; name?: string } })?.siteInfo : undefined;
    steps["3 site.context"] = record("3 site.context", sc.value === undefined ? failed(sc, "site.context") : {
      ms: sc.ms,
      ok: Boolean(siteInfo?.siteId),
      summary: siteInfo?.siteId ? `site.context: ${siteInfo.name} (${siteInfo.siteId})` : "site.context answered with no site",
      detail: { keys: keysOf(unwrap(sc.value)) },
    });
    const pc = await timed(client.query("pages.context"), HOST_TIMEOUT_MS);
    const pctx = pc.value !== undefined ? (unwrap(pc.value) as { siteInfo?: { id?: string; name?: string; language?: string }; pageInfo?: { id?: string; name?: string } }) : undefined;
    steps["3b pages.context"] = record("3b pages.context", pc.value === undefined ? failed(pc, "pages.context") : {
      ms: pc.ms,
      ok: Boolean(pctx?.siteInfo || pctx?.pageInfo),
      summary: pctx?.siteInfo || pctx?.pageInfo ? `pages.context: site ${pctx?.siteInfo?.name ?? "-"}, page ${pctx?.pageInfo?.name ?? "-"}` : "pages.context answered with no site or page",
      detail: { keys: keysOf(pctx), siteId: pctx?.siteInfo?.id, siteLanguage: pctx?.siteInfo?.language, pageId: pctx?.pageInfo?.id },
    });

    // 4. xmc.sites.listSites with the Context ID; once more without it if that fails.
    let listed: SiteSummary[] = [];
    for (const withCtx of contextId ? [true, false] : [false]) {
      const key = withCtx ? "4 listSites" : contextId ? "4b listSites (no Context ID)" : "4 listSites (no Context ID)";
      const ls = await timed(
        client.query("xmc.sites.listSites", { params: withCtx ? { query: { sitecoreContextId: contextId } } : {} } as Parameters<ClientSDK["query"]>[1]),
        API_TIMEOUT_MS,
      );
      if (ls.value === undefined) {
        steps[key] = record(key, failed(ls, "listSites"));
        continue;
      }
      const { error, body } = apiOutcome(ls.value);
      if (error || !Array.isArray(body)) {
        steps[key] = record(key, { ms: ls.ms, ok: false, summary: "listSites returned no list", detail: { error, bodyKeys: keysOf(body) } });
        continue;
      }
      listed = (body as Array<Record<string, unknown>>).map(summariseSite);
      steps[key] = record(key, { ms: ls.ms, ok: true, summary: `listSites: ${listed.length} site(s): ${listed.map((x) => x.name).join(", ")}`, detail: listed });
      break;
    }
    setSites(listed);

    // 7. Tenant name for Open in Page Builder.
    const hostTenantName = tenantNameFromHostState(state);
    const tenantSource = typeof s?.xmCloudTenantInfo?.name === "string" && s.xmCloudTenantInfo.name.trim()
      ? "xmCloudTenantInfo.name"
      : typeof s?.userInfo?.[TENANT_NAME_CLAIM] === "string" ? "userInfo tenant_name claim" : "none";
    const tenantName = appTenantName || hostTenantName;
    steps["7 tenant name"] = record("7 tenant name", {
      ms: 0,
      ok: Boolean(tenantName),
      summary: tenantName ? `Tenant name "${tenantName}" from ${appTenantName ? "application.context" : tenantSource}` : "No tenant name anywhere",
      detail: { applicationContext: appTenantName || null, hostState: hostTenantName || null, hostStateSource: tenantSource },
    });
    setIds({ contextId, organization, tenantName });

    // 8. Language and theme: the SDK types have no theme, so look for one.
    const themeKeys = Object.fromEntries(
      Object.entries(state && typeof state === "object" ? (state as Record<string, unknown>) : {})
        .filter(([k]) => /theme|colou?r|mode|dark|appearance/i.test(k))
        .map(([k, v]) => [k, JSON.stringify(v)?.slice(0, 200)]),
    );
    const queryNames = [...new URLSearchParams(window.location.search).keys()];
    steps["8 language and theme"] = record("8 language and theme", {
      ms: 0,
      ok: true,
      summary: `Language: ${String(s?.language ?? pctx?.siteInfo?.language ?? "not given")}; theme keys in host.state: ${Object.keys(themeKeys).length ? Object.keys(themeKeys).join(", ") : "none"}`,
      detail: {
        hostStateLanguage: s?.language ?? null,
        themeKeys,
        iframeQueryParamNames: queryNames,
        hasHash: Boolean(window.location.hash),
        prefersDark: window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
    });

    // 9. localStorage: is the widget's cache (same origin, same Sitecore host) visible here?
    const groups: Record<string, { count: number; bytes: number }> = {};
    const scoreSiteIds: string[] = [];
    let storageError: string | undefined;
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) ?? "";
        if (!k.startsWith("aiDiscovery:")) continue;
        const prefix = k.split(":").slice(0, 3).join(":") + ":";
        const g = (groups[prefix] ??= { count: 0, bytes: 0 });
        g.count++;
        g.bytes += (window.localStorage.getItem(k) ?? "").length;
        if (prefix === "aiDiscovery:scores:v6:") scoreSiteIds.push(k.slice(prefix.length));
      }
    } catch (err) {
      storageError = String(err);
    }
    const cachedSites = listed.filter((x) => scoreSiteIds.includes(x.id)).map((x) => x.name);
    const ancestors = Array.from((window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins ?? []);
    steps["9 localStorage"] = record("9 localStorage", {
      ms: 0,
      ok: !storageError,
      summary: storageError
        ? `localStorage blocked: ${storageError}`
        : `${Object.values(groups).reduce((n, g) => n + g.count, 0)} aiDiscovery keys; widget page cache for: ${cachedSites.length ? cachedSites.join(", ") : scoreSiteIds.length ? `${scoreSiteIds.length} site ID(s) not in listSites` : "none"}`,
      detail: { groups, scoreSiteIds, ancestorOrigins: ancestors, referrerOrigin: document.referrer ? new URL(document.referrer).origin : "" },
    });

    // 5–6 on the default site: BrandX, else the first one listed.
    const pick = listed.find((x) => /brandx/i.test(x.name)) ?? listed[0];
    if (pick) {
      setSiteId(pick.id);
      Object.assign(steps, await runSite(client, pick, contextId));
    }

    const report = { capturedAt: new Date().toISOString(), steps };
    setReports((prev) => {
      const next = [...prev, report].slice(-5);
      saveReports(next);
      return next;
    });
    setStatus("Done. Copy the report and paste it into the chat.");
    setBusy(false);
  }, [client, record, runSite]);

  useEffect(() => {
    if (client && isInitialized) void runAll();
  }, [client, isInitialized, runAll]);

  const picked = sites.find((x) => x.id === siteId);

  const rerunSite = async (id: string) => {
    setSiteId(id);
    const site = sites.find((x) => x.id === id);
    if (!client || !site) return;
    setBusy(true);
    const steps = await runSite(client, site, ids.contextId);
    setReports((prev) => {
      const next = [...prev, { capturedAt: new Date().toISOString(), steps }].slice(-5);
      saveReports(next);
      return next;
    });
    setBusy(false);
  };

  // 10. Open the picked site's home in Page Builder, as the dashboard's Open in Page Builder does.
  const openHome = async () => {
    const homePageId = picked?.hosts.find((h) => h.homePageId)?.homePageId ?? "";
    const url = buildPagesEditorUrl({ tenantName: ids.tenantName, organization: ids.organization, itemId: homePageId, site: picked?.name ?? "", lang: LANGUAGE });
    if (!client || !url) {
      record("10 Open in Page Builder", { ms: 0, ok: false, summary: "Missing a parameter: no URL built", detail: { tenantName: Boolean(ids.tenantName), organization: Boolean(ids.organization), homePageId, site: picked?.name } });
      return;
    }
    const nav = await timed(client.navigateToExternalUrl(url, true), HOST_TIMEOUT_MS);
    const step = record("10 Open in Page Builder", nav.threw || nav.timedOut
      ? { ...failed(nav, "navigateToExternalUrl"), detail: { url } }
      : { ms: nav.ms, ok: true, summary: "navigateToExternalUrl resolved (say what opened)", detail: { url } });
    setReports((prev) => {
      const next = [...prev, { capturedAt: new Date().toISOString(), steps: { "10 Open in Page Builder": step } }].slice(-5);
      saveReports(next);
      return next;
    });
  };

  const json = JSON.stringify(reports, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setStatus(`Copied ${reports.length} report(s).`);
    } catch {
      setStatus("Clipboard blocked: select the text below and copy it.");
    }
  };

  return (
    <main className="min-h-screen bg-subtle-bg p-4 text-body-text">
      <section className="mx-auto max-w-[1320px] rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm" aria-label="Phase 14 spike">
        <h1 className="text-lg font-bold">Is It Agent-Ready? · Full-screen spike (temporary)</h1>
        <p className="mt-1 text-xs">
          Read-only: host queries, xmc.sites.listSites, retrieveSite and one authoring query. Nothing is written and no /api route is called.
        </p>

        {!inFrame ? (
          <p className="mt-3 rounded border bg-white p-3">Open this from SitecoreAI&apos;s Apps menu. Outside Sitecore there is no host to ask. For the demo, add <code>?demo=1</code>.</p>
        ) : !client ? (
          <p className="mt-3" role="status">{clientError ? `The Marketplace client didn't start: ${clientError.message}` : "Connecting to SitecoreAI…"}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="rounded bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={runAll}>Run again</button>
              {sites.length > 0 && (
                <label className="flex items-center gap-1 text-xs">
                  Site for steps 5, 6 and 10
                  <select className="rounded border bg-white px-2 py-1" value={siteId} disabled={busy} onChange={(e) => void rerunSite(e.target.value)}>
                    {sites.map((x) => <option key={x.id} value={x.id}>{x.displayName || x.name}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={busy || !picked} onClick={openHome}>Open home in Page Builder</button>
            </div>
            <ol className="mt-3 space-y-1">
              {Object.entries(current).map(([key, step]) => (
                <li key={key} className="break-words">
                  <span className={step.ok ? "font-semibold text-green-800" : "font-semibold text-red-700"}>{step.ok ? "OK" : "Failed"}</span>{" "}
                  <span className="font-mono text-xs">{key}</span> · {step.summary}{step.ms ? ` (${step.ms} ms)` : ""}
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!reports.length} onClick={copy}>Copy {reports.length} report(s)</button>
          <button type="button" className="rounded border bg-white px-3 py-1 disabled:opacity-50" disabled={!reports.length} onClick={() => { setReports([]); saveReports([]); }}>Clear</button>
          <span role="status" className="text-xs">{status}</span>
        </div>
        {reports.length > 0 && <textarea readOnly aria-label="Spike reports" className="mt-2 h-64 w-full rounded border p-1 font-mono text-xs" value={json} />}
      </section>
    </main>
  );
}
