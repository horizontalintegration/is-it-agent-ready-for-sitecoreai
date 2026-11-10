"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { siteOptionsFromListing, type SiteOption } from "@/lib/sitecore/sites";
import { HOST_AUTH_ERROR_MESSAGE, isHostAuthError } from "@/lib/xmc-errors";

// The organisation's sites for the full-screen app's picker (Phase 14):
// application.context for the Context ID and organisation, then one
// xmc.sites.listSites call. Built-in authorization attaches the token in the
// full-screen host too (SPIKE-FINDINGS §11).

export interface SiteList {
  status: "idle" | "loading" | "ready" | "error";
  sites: SiteOption[];
  /** For remembering the pick per organisation. */
  organizationId: string;
  error: string | null;
  retry: () => void;
}

interface AppContextShape {
  organizationId?: string;
  resourceAccess?: Array<{ context?: { preview?: string; live?: string } }>;
  resources?: Array<{ context?: { preview?: string; live?: string } }>;
}

export function useSiteList(client: ClientSDK | null, isInitialized: boolean): SiteList {
  const [state, setState] = useState<Omit<SiteList, "retry">>({ status: "idle", sites: [], organizationId: "", error: null });

  const load = useCallback(async () => {
    if (!client) return;
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      // The proxy sometimes wraps the payload twice (data.data), as in useSitePages.
      const appRes = await client.query("application.context");
      const outer = (appRes as { data?: unknown })?.data;
      const app = ((outer as { data?: AppContextShape })?.data ?? outer ?? {}) as AppContextShape;
      const resources = app.resourceAccess ?? app.resources ?? [];
      const sitecoreContextId = resources.map((r) => r?.context?.preview || r?.context?.live).find(Boolean);

      const res = await client.query("xmc.sites.listSites", {
        params: sitecoreContextId ? { query: { sitecoreContextId } } : {},
      } as Parameters<ClientSDK["query"]>[1]);
      const body = (res as { data?: unknown })?.data as { data?: unknown; error?: unknown } | undefined;
      if (body?.error) {
        if (isHostAuthError(body.error)) throw new Error("Host authorization refused", { cause: body.error });
        console.warn("[siteList] listSites API error:", body.error);
        throw new Error("SitecoreAI didn't return the sites.");
      }
      const sites = siteOptionsFromListing(body?.data ?? body);
      console.log("[siteList] listSites →", sites.map((s) => ({ name: s.name, domain: s.domain, hasHome: Boolean(s.homePageId) })));
      setState({ status: "ready", sites, organizationId: app.organizationId ?? "", error: null });
    } catch (err) {
      console.error("[siteList] failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: isHostAuthError(err) ? HOST_AUTH_ERROR_MESSAGE : `Could not list the sites: ${message}` }));
    }
  }, [client]);

  useEffect(() => {
    if (client && isInitialized) void load();
  }, [client, isInitialized, load]);

  return { ...state, retry: load };
}
