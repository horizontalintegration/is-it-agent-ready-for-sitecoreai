"use client";

import DashboardWidgetPage from "../dashboard-widget-extension/page";
import { FullscreenSpike } from "@/components/spike/FullscreenSpike";
import { useDemoMode } from "@/hooks/useDemoMode";

// TEMPORARY (Phase 14 spike): the full-screen extension point's route. In
// SitecoreAI it shows the spike box; `?demo=1` shows the dashboard's demo,
// with no client and no request. The build PR replaces both with the
// full-screen app.
export default function FullscreenExtensionPage() {
  const demo = useDemoMode();
  return demo ? <DashboardWidgetPage /> : <FullscreenSpike />;
}
