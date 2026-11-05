"use client";

import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";
import { DashboardApp } from "@/components/dashboard/DashboardApp";

// The dashboard widget: follows the site selected in SitecoreAI (site.context).
export default function DashboardWidgetPage() {
  const { client, isInitialized } = useMarketplaceClient();
  return <DashboardApp client={client} isInitialized={isInitialized} />;
}
