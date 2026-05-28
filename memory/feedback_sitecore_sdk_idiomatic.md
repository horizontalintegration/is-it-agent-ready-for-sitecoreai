---
name: feedback-sitecore-sdk-idiomatic
description: User prefers OOTB Marketplace SDK mechanisms over custom workarounds; knows the SDK well
metadata:
  type: feedback
---

When building on the Sitecore Marketplace SDK, prefer the SDK's first-class mechanisms over custom workarounds. Before reaching for env vars, HTML scraping, or hand-built API endpoints, look harder at what the SDK already provides (queries, subscriptions, brokered API calls).

**Why:** During the Page-fields work the user corrected two non-idiomatic approaches in a row — (1) reading `pages.context.pageInfo.fields` directly / scraping rendered HTML for OG tags, and (2) treating `pages.content.fieldsUpdated` as a data source. The user knows the SDK well and pointed to the correct path each time: identify the page via `pages.context`, then fetch field values through the **Authoring GraphQL API** (`xmc.authoring.graphql`), with the Marketplace runtime brokering authenticated requests on the author's behalf (no separate OAuth). `pages.content.fieldsUpdated` is a change *notification*, not data.

**How to apply:** For this project, when a feature needs Sitecore data, first check the installed `@sitecore-marketplace-sdk/*` packages and the developer guide (doc.sitecore.com/mp) for the idiomatic call. Treat custom env-var fallbacks and manual endpoint construction as last resorts and flag them as such. Note the SDK version matters — field/subscription APIs required upgrading client to 0.3.x+ and xmc to 0.4.x+. See [[project-page-seo-health-checker]].
