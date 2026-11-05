"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { isDemoUrl, standaloneDomain, useDemoMode, useStandaloneDomain } from "@/hooks/useDemoMode";
import { useSiteList } from "@/hooks/useSiteList";
import { AppMark } from "@/components/shared/AppMark";
import { DashboardApp } from "@/components/dashboard/DashboardApp";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { makeTestSiteList } from "@/lib/rule-engine/test-fixture";
import { chooseSite, isScannable, readPickedSite, writePickedSite, type SiteOption } from "@/lib/sitecore/sites";

// The full-screen app (Phase 14): the dashboard at full size, opened from
// SitecoreAI's Apps menu. That menu sits outside any site, so there's no
// site.context: a site picker lists the organisation's sites and remembers
// the pick per organisation.

type Mode = "pending" | "sitecore" | "outside" | "offline";

const subscribe = () => () => {};
function modeSnapshot(): Mode {
  if (isDemoUrl() || standaloneDomain()) return "offline";
  return window.self !== window.top ? "sitecore" : "outside";
}
const pendingSnapshot = (): Mode => "pending";

export default function FullscreenExtensionPage() {
  // Known only in the browser. FullscreenApp mounts once it is, so the
  // Marketplace client starts on mount (it never starts if its options change
  // after mount, SPIKE-FINDINGS §11).
  const mode = useSyncExternalStore(subscribe, modeSnapshot, pendingSnapshot);
  if (mode === "pending") return null;
  if (mode === "outside") return <OutsideSitecore />;
  return <FullscreenApp />;
}

function OutsideSitecore() {
  return (
    <main className="flex min-h-screen items-start justify-center bg-subtle-bg p-4 text-body-text sm:p-10">
      <section className="flex max-w-xl flex-col gap-3 rounded-xl border bg-body-bg p-6">
        <div className="flex items-center gap-3">
          <AppMark size={32} />
          <h1 className="text-lg font-bold">Is It Agent-Ready?</h1>
        </div>
        <p className="text-md">
          Open this from the <strong>Apps</strong> menu in SitecoreAI. Outside Sitecore there&apos;s no list of sites to scan.
        </p>
        <p className="text-sm text-subtle-text">
          To look around without Sitecore, add <code>?demo=1</code> to the address.
        </p>
      </section>
    </main>
  );
}

const DEFAULT_SITE_DOMAIN = process.env.NEXT_PUBLIC_DEFAULT_SITE_DOMAIN ?? "";

function FullscreenApp() {
  const { client, isInitialized, error: clientError } = useMarketplaceClient();
  const demo = useDemoMode();
  const standalone = useStandaloneDomain();
  const list = useSiteList(client, isInitialized);
  const demoSites = useMemo(() => (demo ? makeTestSiteList() : []), [demo]);
  const sites = demo ? demoSites : list.sites;

  // The pick made in this session, else the remembered or default site.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const initial = useMemo(
    () => (demo ? demoSites[0] ?? null : list.status === "ready" ? chooseSite(list.sites, readPickedSite(list.organizationId), DEFAULT_SITE_DOMAIN) : null),
    [demo, demoSites, list.status, list.sites, list.organizationId],
  );
  const site = (pickedId ? sites.find((s) => s.id === pickedId) : null) ?? initial;

  const pick = (id: string) => {
    const next = sites.find((s) => s.id === id);
    if (!next || id === site?.id) return;
    // Demo mode has one site's data: the other one is named, not shown.
    if (demo) {
      toast.info(`Demo: in SitecoreAI this scans ${next.name}.`);
      return;
    }
    writePickedSite(list.organizationId, id);
    setPickedId(id);
  };

  const siteError =
    clientError && !client ? (
      <p role="alert" className="rounded-lg border border-warning-bg-active bg-warning-bg px-3 py-2 text-md text-warning-fg">
        Couldn&apos;t connect to SitecoreAI ({clientError.message}). Reload the page to try again.
      </p>
    ) : list.status === "error" ? (
      <>
        <p role="alert" className="rounded-lg border border-warning-bg-active bg-warning-bg px-3 py-2 text-md text-warning-fg">{list.error}</p>
        <Button type="button" size="sm" variant="outline" onClick={list.retry}>Retry</Button>
      </>
    ) : list.status === "ready" && !site ? (
      <p role="alert" className="rounded-lg border border-warning-bg-active bg-warning-bg px-3 py-2 text-md text-warning-fg">
        {list.sites.length === 0
          ? "SitecoreAI lists no sites in this organisation."
          : "None of this organisation's sites has a public host name in SitecoreAI, so there are no pages to fetch."}
      </p>
    ) : null;

  return (
    <DashboardApp
      client={client}
      isInitialized={isInitialized}
      site={site}
      sitePicker={standalone ? undefined : <SitePicker sites={sites} value={site?.id ?? ""} loading={!demo && !clientError && list.status !== "ready" && list.status !== "error"} onChange={pick} />}
      siteError={siteError}
      openPagesInNewTab
    />
  );
}

function siteLabel(site: SiteOption): string {
  const host = site.domain.replace(/^https?:\/\//, "");
  return host ? `${site.name} · ${host}` : site.name;
}

function SitePicker({ sites, value, loading, onChange }: { sites: SiteOption[]; value: string; loading: boolean; onChange: (id: string) => void }) {
  if (loading) return <span role="status" className="text-sm text-subtle-text">Loading sites…</span>;
  if (sites.length === 0) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Site" size="sm" className="mt-0.5 max-w-full min-w-0 text-sm font-medium [&>span]:truncate">
        <SelectValue placeholder="Pick a site" />
      </SelectTrigger>
      <SelectContent>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id} disabled={!isScannable(s)}>
            {isScannable(s) ? siteLabel(s) : `${s.name} · No public host name`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
