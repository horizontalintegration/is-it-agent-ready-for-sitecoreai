# Page Matrix — Technical Reference

Engineering-oriented reference for the **dashboard**: how it scans pages, how it scores them, how it rolls them up, the site checks, AI citations, "What changed", and the Phase 5 UI. Since Phase 3 the dashboard uses **the same check engine as the panel** — the old 5-pillar model (`site-score.ts`: Crawlability, Structured, Answerability, Authority, Retrievability) is gone. The checks themselves (IDs, thresholds, credit) are documented once, in `PAGE-CHECKS-TECHNICAL.md`.

**Source of truth:**
- `src/hooks/useSitePages.ts` — page enumeration, scanning, the score cache, site-check inputs
- `src/lib/checks/` — the engine (see `PAGE-CHECKS-TECHNICAL.md`)
- `src/lib/checks/view-model.ts` — `PageScoreSummary`, `CATEGORY_META`, Fix first grouping, status words
- `src/lib/site-aggregate.ts` — site roll-up
- `src/app/dashboard-widget-extension/page.tsx` and `src/components/dashboard/*.tsx` — the UI (one component per tab)
- `src/hooks/useScoreHistory.ts` — the last 8 site scores
- `src/hooks/useWhatChanged.ts`, `src/lib/history/` — "What changed" snapshots and the storage interface
- `src/app/api/citation-probe/route.ts`, `src/lib/server/citation-probe.ts`, `src/lib/citations/`, `src/hooks/useCitationProbe.ts` — AI citations
- `src/hooks/useSiteType.ts` — the Site type setting
- `src/types/dashboard.ts` — `PageMatrixRow`, `MatrixFilter`

---

## Scoring model

Each page is scored by `runPageChecks` with a context from `buildPageContext` — the same function the panel uses — and summarised by `summarisePageReport` into a `PageScoreSummary`:

| Field | Meaning |
|---|---|
| `score` | 0–100, or `null` when the gate blocks the page or nothing could be scored |
| `label` | `not-ready` / `almost-there` / `agent-ready` from `labelForPct` (80 / 60), or `null` |
| `blocked`, `gateReason` | the gate (P1): Sitecore Robots Meta Tag field, or a rendered noindex / nosnippet / max-snippet:0 |
| `categories` | earned and max points for `reach`, `read`, `understand`, `trust` (max 0 when nothing in that category was scored) |
| `issues` | every scored check that isn't passing: `{ id, status, gain }` with `status` "warning" or "fail" and `gain` = `maxPoints − points`. Empty when blocked. Feeds Fix first |
| `descriptionGain` | points a meta description would add: half of P9's `maxPoints` when P9's details include `DESCRIPTION_MISSING`, else 0 (Phase 9; absent in summaries cached earlier, where P9's gain stands in) |

**Pools:** Essential checks share 80 points, Recommended 20, Bonus adds up to 5, capped at 100. N/A and not-checked results are left out of the pools. Full detail in `PAGE-CHECKS-TECHNICAL.md`.

### Rating bands — `labelForPct`, `src/lib/score-thresholds.ts`

| Label | Range | Shown as (`LABEL_TEXT`) |
|-------|-------|----------|
| `agent-ready` | ≥ 80 | Agent-ready |
| `almost-there` | 60–79 | Almost there |
| `not-ready` | < 60 | Not ready |

The same `READY_PCT` (80) and `ALMOST_PCT` (60) drive the score rings, the heatmap cells, the verdicts and the site roll-up.

---

## Scanning a page (`scanOne`, `useSitePages.ts`)

- **Context first:** `application.context` is read before any XM Cloud call, and its Context ID (`resourceAccess[].context.preview`, else `.live`) is sent as `sitecoreContextId` on `xmc.sites.retrieveSite` and every authoring GraphQL call. The console line `[sitePages] application.context →` shows the Marketplace app type (`custom` / `public`), the extension points (for dashboard blocks, each widget's route is under `blocks`, and the top-level route is null), and whether a Context ID was found. It names fields one by one, because the raw context can hold the editing secret. `[sitePages] host.state →` shows which Sitecore host runs the widget: `isNull: true` for the Cloud Portal, `environment` and `language` for SitecoreAI.
- **Host refusing authorization:** if the Sitecore host refuses a call with "getAccessToken method not provided" (plan section 13, item 1), `isHostAuthError` (`src/lib/xmc-errors.ts`) recognises it. The Overview then says Sitecore didn't authorize the request, instead of falling back to the content-tree walk and reporting a missing Home item. Other errors, including a plain 401 from an API, keep the existing fallbacks.
- **Enumeration:** authoring GraphQL walks the site's Home item 5 levels deep; items with `__Renderings` or `__Final Renderings` are pages. For each it reads `template { name }`, `__Updated`, and the fields the checks read, by the shared names in `SCORING_FIELD_NAMES` (`pageTitle`, `MetaDescription` — overridable with `NEXT_PUBLIC_FIELD_TITLE` / `NEXT_PUBLIC_FIELD_META_DESCRIPTION` — and `robotsMetaTag`). `pageFieldsFromValues` normalises them into `row.fields`, exactly as the panel does. The OG description is also read, only as the llms.txt summary fallback.
- **Scan:** `/api/preview-fetch` for the live HTML and `/api/markdown-check` for P5 and P6 (the page requested as an agent and as a browser: 2 more requests per page, in parallel with preview-fetch; without `excerpt=1`, so each page gets the HTML's token breakdown but not the panel's 16 KB of it; a failed request leaves P5 "not checked"; see PAGE-CHECKS-TECHNICAL, "P5 and P6 in detail"), then `/api/ai-check` with `ParsedHtml.mainText` (on `ANTHROPIC_MODEL_BULK`, cached by content hash in localStorage, shared with the panel, and on the server). PageSpeed doesn't run in the dashboard, so P7 is "not checked" and left out of the score. The dashboard is **live-only**: it has no Page Builder draft (`getPageHTML` works only in Page Builder), so it passes no `draft` to `buildPageContext`, and P3 is "not checked" ("Page Builder only") and left out too. The same inputs give the panel's score; the panel's can differ when it scores a draft (PAGE-CHECKS-TECHNICAL, "Draft and live"). `mainText` now includes collapsed FAQ answers, so accordion pages get a new AI cache key once.
- **Concurrency:** 5 pages at a time; all unscanned rows scan in the background after enumeration.

### Score cache

Summaries are cached in localStorage under **`aiDiscovery:scores:v6:<siteId>`**, keyed by page URL and reused while the page's `__Updated` is unchanged. **v6** (Phase 7) adds P5 and P6 and `servesMarkdown` (P5 scored with any credit → true, with none → false, not checked → null); **v5** (Phase 5) added `issues` and the new label names; **v4** was the unified engine. A cached score doesn't follow a site-wide Markdown change, since `__Updated` doesn't change: **Scan site** after the developer turns Markdown on. A new version makes the dashboard rescan every page once. The AI results have their own content-hash cache, so pages whose text hasn't changed don't call `ai-check` again. **Scan site** clears the cache and re-fetches the site-check inputs.

---

## Site roll-up (`site-aggregate.ts`)

- **Overall score:** mean of the page scores. Unscanned and **blocked** pages are left out; blocked pages are counted separately ("N Blocked" in the summary).
- **Category cards:** for each category, the mean of `earned ÷ max` over pages where that category was scored. A page "needs work" in a category below 60% (`FAIL_THRESHOLD`, the Almost there line; it was 40% before Phase 5). The "What's included" list comes from the check registry (`pageCheckTitles`), so it always matches what's scored; P3 and P7 are marked "(Page Builder panel only)". The **Read** card shows "N of M pages not served as Markdown" in red instead of its "needs work" line when any scored page doesn't serve Markdown (`SiteAggregate.markdown`: `served` and `checked` over the scored pages, from `servesMarkdown`), as in the mockup.
- **Pages heatmap:** a category cell shows `round(earned ÷ max × 100)`, coloured by `labelForPct`, or N/A when nothing in it was scored. Blocked pages show the gate reason across the cells and sort with the unscanned ones.

## Fix first (`view-model.ts`)

- **Page issues:** `groupPageIssues` groups every page's `issues` by check ID. `gainEach` is the mean gain, rounded ("+N pts each"); groups under 1 point are dropped. The worst status wins (any `fail` → Fix). Sorted by the total gain across pages.
- **Site issues:** `siteIssueGroups` turns the site checks that need work into groups that sort first ("Affects every page").
- **Markdown once** (`fixFirstGroups`): S3 and P5 are the same developer fix, so once pages have been checked, P5's page group (its page count, "+N pts each" and the list of pages in the note) replaces S3's site row and comes right after the site issues. Before any page has been checked, S3's row shows.
- **Meta description missing** (`metaDescriptionGroup`, Phase 9): the scanned, unblocked pages whose Meta Description field is empty, `gainEach` from `descriptionGain`. It sorts with the page issues by total gain and carries `bulk: "meta-description"`. It sits next to P9's own row, which also covers the title.
- **Buttons:** site issues and Developer page issues get **Send to developer**, which copies `issueNote` (the issue, why, and each page's URL; for a site issue, `developerNote` with its fix and snippet). Author page issues get **Review pages**, which opens the Pages tab filtered to `pageIds`. A `bulk` group gets **Generate for all**.

## Generate for all (`BulkMetaDialog.tsx`, Phase 9)

- **Generate:** up to `BULK_MAX` (25) pages a run, 3 at a time, each `POST /api/generate-meta` with `{ field: "metaDescription", pageTitle, currentValue: "", pageUrl }`. The route reads the published page through `safeFetch` and caches by content hash, so a second run on unchanged pages costs nothing. About 1 cent a page on Opus 5.5 at effort low.
- **Review:** an editable suggestion per page with its length (target 120–160), and an **Approve** checkbox, unticked by default. A page can't be approved when `writeDisabledReason` gives a reason (no client outside demo mode, or no Meta Description field on its template: `PageMatrixRow.metaDescriptionField` is null when `field(name)` came back null in the page-list query).
- **Write:** one confirm (`useConfirmWrite`) lists every approved change before → after; then `writeField` per page with `xmc.pages.updateFields` (page ID in `normalizeItemId` form, `PageMatrixRow.language`, the Context ID from `useSitePages().siteContext.sitecoreContextId`), each with its `[audit]` line, a toast with the count, and ✓ / ✕ with the reason on each row. Nothing is published, so the scores change after publishing and a rescan.
- **No client, no writes:** demo mode answers from `makeTestAssist().bulkMeta` with no request. Approve and **Write N approved** work, and the confirm dialog shows every change, but **Write to Sitecore** writes nothing ("Demo: nothing was written to Sitecore."). "Saving for retirement at any age" has no Meta Description field, so it shows that reason instead. The standalone `?domain=` dashboard has no page list, so no such row.
- Write rules, the audit line and the confirm dialog: `PAGE-CHECKS-TECHNICAL.md`, "AI Assist and write-back".
- The hero sentence comes from the same groups: the number of site issues, or the biggest page issue, and how many issues authors can fix.

## History (`useScoreHistory.ts`, `useWhatChanged.ts`)

**Storage** (plan section 12, decision 2, decided 2026-11-02): **localStorage only**, per browser, through `HistoryStore` (`src/lib/history/store.ts`: `read` / `write` / `remove`, never throws; `memoryHistoryStore` for tests). Shared server storage (Upstash Redis through the Vercel Marketplace was the named candidate) is deferred: the API routes have no authentication, so a shared store would let anyone read or overwrite a site's history. Swapping the store needs no hook changes.

`useSiteHistory` keeps the last 8 site scores (`aiDiscovery:siteHistory:v1:<siteId>`). It adds one when a scan finishes in this session (pages were scanning, now none are), not on every load from cache. The hero shows "▲ N since last scan" (the last two entries) and the trend line from two scans on.

**What changed since last scan** (`useWhatChanged`, comparison in `src/lib/history/what-changed.ts`; the card is `WhatChangedCard` in `OverviewTab.tsx`, next to Fix first):
- **Snapshots.** `scanSnapshot` when a site scan finishes (the trend's trigger): each scanned page's route, score, label, blocked flag, issue IDs and `lastModified` (`aiDiscovery:scanSnapshots:v1:<siteId>`). `accessSnapshot` for each new agent-access scan, keyed by its `checkedAt`, so reading the cached scan adds nothing: status, outcome, live column and fail status of the search and user agents (`aiDiscovery:accessSnapshots:v1:<domain>`). `pushSnapshot` keeps the last two of each.
- **Items, worst first:** page drops of `DROP_THRESHOLD` (5) points or more ("▼ 18 /x dropped after the Oct 28 publish. Now needs work: <check titles>"; the publish part when `lastModified` is after the previous snapshot); pages that became noindex or nosnippet; agents that went from pass to fix ("New: ChatGPT-User now gets 403 from your firewall (it got 200 last time)"); fewer citations; then pages that became agent-ready (grouped, with the issue they all fixed when there is one), agents let back in, and more citations. The card shows 5, with **Show all**.
- **Citations:** for each listed page, `citedDelta` of its stored probe runs (the latest run against the previous run of the same question set), counted only when the latest run is newer than the previous scan snapshot. The tab fires `aiDiscovery:citationRun` on `window` when it stores a run, and the card re-reads.
- Training agents are left out (blocking them is a choice). Before there are two snapshots: "Changes show here after the next scan, compared with this one."

---

## Agent access tab: site checks

All twelve site checks (S1–S12, Phase 6) grade one scan: `GET /api/agent-access?domain=<domain>` (`src/app/api/agent-access/route.ts`, collector in `src/lib/server/agent-access.ts`). It returns `AgentAccessData` (`src/lib/agent-access/types.ts`): raw evidence only, no grades. The checks in `src/lib/checks/site/` grade it synchronously, so the engine stays pure and the panel, the dashboard and the demo fixture all go through the same code. The check definitions and their credit are in `PAGE-CHECKS-TECHNICAL.md` ("Site checks").

**The scan.** Every request goes through `safeFetch`. The bot and browser requests send their User-Agent and Accept as `publicHeaders`, which `safeFetch` keeps across a cross-origin redirect (example.com → www.example.com), so a redirect doesn't silently turn a bot request into a default one.
- **Round 1:** robots.txt, the home page as a browser (Chrome's User-Agent), the home page with `Accept: text/markdown`, `/llms.txt`, a random path (`/agent-ready-check-<hex>`), and 11 well-known paths (`src/lib/agent-access/well-known.ts`).
- **Round 2**, once robots.txt and the home page are in: two sample pages (the first internal page links on the home page, links in `<main>` first, no files), each bot × (home + samples), the sitemap (robots.txt's `Sitemap:` line on the site's own origin, else its first `Sitemap:` line, else `/sitemap.xml`; for an index, the first child sitemap), and the about, contact and privacy pages linked from the home page (footer first, shortest path).
- **Bots** (`src/lib/agent-access/bots.ts`): 12, grouped Search / User / Training. Google-Extended and Applebot-Extended are robots.txt tokens only, so they're never requested. A bot that robots.txt disallows on `/` isn't requested either.
- **Budget:** at most 6 requests at a time (a priority queue: robots.txt and the home page, then the bot requests, then the rest), 6 s per request, and a 17 s deadline for the whole scan. Requests not finished by then come back with `error: "deadline"`. The route sets `maxDuration = 30`. About 50 requests for a site that allows the agents; BrandX (2026-11-02), whose robots.txt disallows everyone, took 22 requests in 1–3 s; its Vercel replica, which lets in four of the bots, took 34 requests (12 of them as bots) in 1.4–3.1 s.
- **Bad input:** a private or invalid domain → 400 `blocked_url` (a hostname that resolves to a private address is caught at connect time, on the home request).

**The grid** (`src/lib/agent-access/grid.ts`, `botGrid`) turns the evidence into one row per bot: robots.txt verdict for `/` (RFC 9309 matching, `src/lib/agent-access/robots.ts`), the live column (`200`, `403`, `200 · 403 on /insights`, `Challenge page`, `Not requested`, `robots.txt rule only`) and the result. Each bot page is compared with the browser's request for the same page: a 4xx/5xx is **blocked**; a 2xx with challenge markers the browser didn't get, or under 20% of the browser's size (when the browser's page is at least 5 KB), is a **challenge page**; a failed request is **Couldn't check**; a page the browser couldn't load either isn't compared. The worst page wins. A blocked training agent is "your choice" (info), never a fail. S1 and S2 grade these same rows, so the grid and the checklist can't disagree.

**Fetching and caching** (`src/hooks/useAgentAccess.ts`): once per domain, kept in localStorage for an hour (`aiDiscovery:agentAccess:v1:<domain>`), shared with the panel. **Scan site** calls `refresh`, which skips the cache. The dashboard runs `runSiteChecks` with the scan, the home page HTML it fetched (for S7), the organisation for the snippet (`getOrganizationInfo`) and the expected one (`getConfiguredOrganization`), and the site type. `useSitePages` no longer fetches robots.txt or the home page. Site checks never feed page scores.

**Agent access tab** (`AgentAccessTab.tsx`): the checklist (status word, title, tier, message, and a button: S2 → **Open robots.txt help**, S5 → **Open generator**, S9 when not set → **Generate line**, all opening Files; S7 → **Copy snippet**; S3 → **See fixes**, which opens the Agent View's fix cards (`MarkdownFixes`) and **Send to developer** under the row; other developer checks → **Send to developer**; S6 is the author's, so no button). S3's message adds "Markdown on N of M scanned pages" (`SiteContext.markdownPages` from the page roll-up); its credit stays the home page's. A scored Bonus result with no credit shows **Not set** instead of N/A. Beside it, the bot grid with an All / Search / User / Training filter, a red box when search or user agents are blocked by the firewall (with **Send to developer**, which copies S1's developer note), the caveat that requests come from our server, and "Checked N ago · N requests in N s". While the scan runs: "Requesting your pages as each AI agent. This takes up to 20 seconds."; on failure, **Try again**.

**Files tab** (`FilesTab.tsx`): the llms.txt generator (`buildLlmsTxt`, `whenToUse` → `## When to use this site`, the 60 threshold) with a **✓ Published / ✕ Not published** chip from the scan; and the robots.txt helper: checkboxes for the search, user and training groups and the Content-Signal line, which start from what robots.txt allows today (the card re-mounts per scan). `buildRobotsLines` (`src/lib/agent-access/robots-helper.ts`) writes a group per purpose with `Allow: /` or `Disallow: /`, then `User-agent: *` / `Content-Signal: search=…, ai-input=…, ai-train=…` / `Allow: /`, then the site's own `Sitemap:` URL from robots.txt (`siteSitemap`, as in the scan; or `/sitemap.xml`). **Send to developer** adds a note to keep the existing rules.

**Site type** (Content site / Commerce / App or API) is a select in the header, stored per site in localStorage (`aiDiscovery:siteType:v1:<siteId>`). S11 applies only to App or API, S12 only to Commerce; otherwise they're N/A ("Only for App or API sites. Change the site type to include it."). The well-known paths are fetched for every type, so changing the type needs no rescan.

---

## AI citations tab (Phase 8, plan section 8)

`CitationsTab.tsx`. A page select (content pages first, articles first, the home page last) and **Or a page URL**, accepted only on the site's hosts (`matchesHosts`), so the tab works without Sitecore's page list.

**Layer 1: "Can each engine cite this page?"** (`engineEstimates`, `src/lib/citations/readiness.ts`). No AI call. Inputs: `botGrid` of the agent-access scan (the rows S1 and S2 grade) and the page's `PageScoreSummary` (null for a typed URL).
- ChatGPT, Claude and Perplexity: their search agent (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and user agent (ChatGPT-User, Claude-User, Perplexity-User). Both blocked (a `robots`, `blocked` or `challenge` outcome) → **Blocked**; one → **Limited**, with the row's reason ("gets 403 from the firewall", "is blocked by robots.txt"); a row that couldn't be checked → unknown; otherwise **Ready**.
- Gemini: Google-Extended disallowed in robots.txt → Limited; otherwise Ready. Copilot (Bing's index): Ready unless the page rules below apply.
- Page rules on top: a gated page (noindex or nosnippet) → every engine Blocked with the gate reason; a Ready engine becomes **Limited** when P3 `read.no-js-content` fails (graded only where a draft exists) or the page is **Not ready**. Missing Markdown alone never limits an engine: engines cite HTML pages.

**Layer 2: citation probes** (`/api/citation-probe`, `src/lib/server/citation-probe.ts`). POST JSON, one action per request, `maxDuration = 90`:
- `{ action: "questions", pageUrl }`: the page fetched through `safeFetch` (`readPageForQuestions`: title, headings and `mainText`, the first 8,000 characters in the prompt), then `structuredCall` (`ANTHROPIC_MODEL`, effort `medium`, zod schema, refusal fallback) for 8 non-branded questions. `cleanQuestions` trims, dedupes, drops questions over 300 characters and keeps at most 10. Returns `{ questions, model }`.
- `{ action: "run", pageUrl, question, country? }`: one question (300 characters at most; `country` one of `PROBE_COUNTRIES`, otherwise none). `probeQuestion` calls `beta.messages.create` with `web_search_20260209` (`max_uses: 3`, `allowed_callers: ["direct"]`, `user_location` when a country is set), effort `low`, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), a stable system prompt that requires a search, with `cache_control`, a 60 s timeout and no SDK retry (a retried timeout would pay for the searches twice). `pause_turn` sends the paused turn back, up to 3 times. When no search returned results and the answer wasn't refused, it asks once more (forced `tool_choice` isn't available on Opus 5.5). No continuation or retry starts after 80 s. Returns `{ evidence, cached }`.
- **Evidence, not verdicts** (`ProbeEvidence`, `extractEvidence`): `searched` (at least one `web_search_tool_result` whose content is a list; an error object goes to `searchErrors` and isn't a search), every result URL (whichever model searched), the `web_search_result_location` citation URLs and the excerpt from the answer after the last `fallback` block, the queries, `refused`, `retried`, the model and `ranAt`. The estimated cost is logged (Opus 5.5: $4 / $20 per MTok, $10 per 1,000 searches) with `cache_read`.
- **Found and Cited** (`classify`, `src/lib/citations/classify.ts`, run in the browser): the site's hosts are its domain plus the user's extra hosts (`siteHostsFor`; "www." ignored, subdomains match). Found = a result URL on the site; Cited = a citation URL on the site; `pageFound` / `pageCited` = the exact page (protocol, query, hash and trailing slash ignored); `citedInstead` = the other cited hosts, first citation first. Not searched → Found and Cited are `null`. The evidence keeps raw URLs, so changing the extra hosts re-classifies without asking again. `probeTotals` counts only searched questions and picks the host cited most often instead.
- **Caches.** Server: `probeCache` (LRU of 1,000, this instance only), key `probeKey` = SHA-256 of a version, the model, page URL, question and country; 7 days (`PROBE_CACHE_MS`). Browser (`src/lib/citations/storage.ts`): `aiDiscovery:citationProbe:v1:<hash>` per page, question and country, 7 days from `ranAt` (an expired entry is removed when read). Only searched results are cached, so a Not searched question is asked again. **Rate limit:** `SiteRateLimiter`, 40 uncached probes per site (the page's host) per hour, in memory → 429 `rate_limited`.
- **The hook** (`useCitationProbe`): the question set and country per page (`aiDiscovery:citationQuestions:v1:<pageUrl>`, default country US), extra hosts per site (`aiDiscovery:citationHosts:v1:<host>`), and up to 10 runs per page (`aiDiscovery:citationRuns:v1:<pageUrl>`, `ProbeRun`: `at`, `setKey` = a hash of the questions and country, `evidence`). **Run** probes 4 questions at a time, browser cache first; each row shows a spinner, then its result or error. A run where every answer came from the cache and the last run is the same set adds no run, and the tab says "Nothing was asked again". Results for a page the user has left are dropped.
- **The card:** "N real questions asked with live web search on <date> from <country>. Results are kept for 7 days.", **Edit questions** (the questions, Ask from, extra hosts, **Suggest new questions**), **Run probe** / **Run again**, three tiles (Cited in the answer, N of M, with "▲ N since last run" from `citedDelta`; Found in search results, with "Found but not cited N times"; Most cited instead), the Not searched line, the table (Found, Cited, Cited instead; a row expands to the excerpt, the queries and what it means), **Earlier runs**, and the caveat `PROBE_CAVEAT` ("AI answers vary by time, location and engine. This is a sample, not a ranking.") with "Probes use Claude with web search". Extra engines (plan section 12, decision 3) stay out: Claude only.

---

## What changed from the pillar model

| Old pillar signal | Now |
|---|---|
| Crawlability: AI crawler permissions | S2 `reach.robots-ai-rules` (site check, bot groups by purpose since Phase 6) and S1 `reach.ai-bot-access` (live requests) |
| Crawlability: canonical | P2 `reach.canonical` (Essential) |
| Crawlability: robots meta | P1 gate — blocks the score instead of costing 4 points |
| Structured: FAQPage / Article / BreadcrumbList | P10 `understand.json-ld` — now validates required properties, reads `@graph` and `@type` arrays, expects FAQPage from real Q&A pairs instead of question H2s |
| Structured: Organization (home page) | S7 `understand.org-schema` (site check) |
| Answerability: headings | P8 `understand.headings` |
| Answerability: question H2s | P13 `understand.question-headings` |
| Answerability: reading grade + paragraph length | P14 `understand.readability` |
| Authority: AI uniqueness | P16 `trust.uniqueness` |
| Authority: content depth | P19 `trust.depth` |
| Authority: freshness | P18 `trust.freshness` (adds JSON-LD `dateModified`; reads Sitecore's compact date format) |
| Authority: descriptive anchors | P20 `trust.anchor-text` (prefix rule narrowed, SPIKE-FINDINGS §2) |
| Retrievability: title + description | P9 `understand.title-meta` (Sitecore field first; title band now 50–60) |
| Retrievability: OG tags | P11 `understand.metadata` (adds `html lang`, `og:type`) |
| Retrievability: landmarks | P4 `read.landmarks` |
| Retrievability: image alt | P15 `understand.image-alt` (N/A without images) |

New in the dashboard because it now shares the panel's checks: P11's lang and og:type, P12 FAQ answer quality, P17 author (article templates), P21 follow-up gaps (Bonus).

## UI (Phase 5)

Blok tokens and components (`src/components/ui`), `@mdi/js` icons, and the shared components in `src/components/shared` (also used by the panel; see PAGE-CHECKS-TECHNICAL). Tabs are Radix tabs: arrow keys move between them. A URL hash (`#pages`, `#agent-access`, `#citations`, `#files`) opens that tab; it's read after mount so hydration matches. **Standalone:** `?domain=https://example.com` opened directly (not in an iframe, not in demo mode; `standaloneDomain()` in `useDemoMode.ts`) runs the dashboard for that origin without the Marketplace client: Agent access, AI citations (with a page URL) and Files work, Overview and Pages have no page list, the header says "Outside Sitecore: site checks only", and **Scan site** re-runs the agent-access scan. It's for checking those tabs while the dashboard can't load pages in Sitecore (plan section 13, item 1), and it answers item 10's question of how to open Agent access without Sitecore. Header: site name and domain, Site type, "Last scan N ago" (the newest `lastScannedAt`), and **Scan site** (`clearAndRefresh`). The page-list error shows on Overview and Pages with **Retry**; the other tabs only need the domain.

---

## Demo mode (`?demo=1`)

`makeTestSitePages()` (`src/lib/rule-engine/test-fixture.ts`) builds 12 rows by running the **real engine** on variants of the panel's demo page, so the numbers are consistent. Every row also gets `makeTestMarkdownCheck`: by default the page returns HTML for `Accept: text/markdown`, as in the mockup (P5: Fix on every page), so the site has 5 Not ready, 4 Almost there, 2 Agent-ready and 1 blocked (noindex), a site score of 62, and the Read card says "11 of 11 pages not served as Markdown". The rows are a BrandX-style financial adviser's pages ("About us", "Annuities", "Fees and pricing", …). The row "Retirement planning in your 40s" is the panel's demo page unchanged, scored on live HTML only (74). The panel demo also scores its demo draft (`makeTestDraft`: an edited heading and client-rendered Related Articles cards), so it shows 70, with the "Draft differs" banner and a P3 warning. **`?demo=1&md=1`** (`useDemoServesMarkdown`) switches the panel, the rows and the agent-access fixture to a site that serves Markdown (P5 4 of 4, P6 Pass, S3 Pass): 2 Not ready, 4 Almost there, 5 Agent-ready, a site score of 79; the retirement row 91, the panel 84. The demo page's HTML (`makeTestPageSource`, live and draft) is real markup, so the Agent View converts it like a real page. Since Phase 13 the published version is weighted like the BrandX replica (chunk scripts, JSON-LD, utility classes, image `srcSet`s, inline SVG and `__NEXT_DATA__`; about 55% markup, 40% scripts, 2% content), and its token count is measured from it rather than set. `makeTestSiteContext()` gives the Agent access tab a BrandX-style home page with no JSON-LD (S7: 0, warning, snippet) and `makeTestAgentAccess()`, the scan from the Symposium mockup: the firewall answers ChatGPT-User and Perplexity-User with 403 although robots.txt allows them (S1: Fix, the Phase 6 accept-when case), robots.txt opts GPTBot out of training (S2: Pass with a note), HTML for `Accept: text/markdown` (S3: Fix), a 128-URL sitemap listed in robots.txt (S4: Pass), no llms.txt (S5: Improve), about, contact and privacy published (S6: Pass), a real 404 (S8: Pass), no Content-Signal line or Link header (S9, S10: Not set).

Demo mode never starts the Marketplace client (`useMarketplaceClient` checks `isDemoUrl()`), in the dashboard or the panel. So it makes no SitecoreAI calls and can't write to a real page, even if `?demo=1` is opened inside a Sitecore extension point. The panel doesn't auto-scan in demo mode either: the fixture already holds the HTML, the draft and the AI results, so nothing fetches the fixture URL, reads `getPageHTML` or calls `ai-check` on load. Agent access, Files and the panel's site-issues strip use `makeTestAgentAccess()` (`useAgentAccess` returns the fixture and never fetches), so neither the dashboard nor the panel calls `/api/agent-access` in demo mode; `useMarkdownCheck` likewise returns the panel's Markdown fixture without calling `/api/markdown-check`, and the preview is converted in the browser. The trend line uses `DEMO_SITE_HISTORY_BEFORE` plus the current score, and **Scan site** is off. **AI citations** opens on "Retirement planning in your 40s" with `makeTestCitationDemo()`: 8 questions and two runs of them, so the tab shows every outcome (2 cited, 3 found but not cited, 2 not found, 1 not searched: "2 of 7", "5 of 7", retirementwise.example cited instead in 4) and "▲ 2 since last run"; Layer 1 shows ChatGPT and Perplexity Limited (the fixture's 403s) and the rest Ready. Suggest questions, Run again and the editor work, but nothing is fetched or stored ("Demo data: these are sample results, and nothing was asked."). **What changed** uses `makeTestWhatChanged()`, built from the demo rows and scan so it matches the other tabs: the weakest unready page ▼ 18 after a publish two days ago, ChatGPT-User 200 → 403, 2 pages agent-ready after structured data was fixed, and 2 more citations for the retirement article. **Generate for all** answers from the fixture, and its writes stop at the confirm dialog (see above). The header shows the site as "BrandX". The Symposium walk-through is `docs/SYMPOSIUM-DEMO-SCRIPT.md`.

---

## Key files

| Aspect | File |
|--------|------|
| Enumeration, scanning, score cache | `src/hooks/useSitePages.ts` |
| Site checks' scan: route, collector, client cache | `src/app/api/agent-access/route.ts`, `src/lib/server/agent-access.ts`, `src/hooks/useAgentAccess.ts` |
| Bots, robots.txt parsing, the grid, the robots.txt helper, well-known paths | `src/lib/agent-access/` |
| P5/P6's requests (one page as an agent and as a browser) | `src/app/api/markdown-check/route.ts`, `src/lib/server/markdown-check.ts`, `src/lib/markdown/` |
| Host authorization refusal | `src/lib/xmc-errors.ts` |
| Demo mode check (`?demo=1`, `&md=1`), standalone `?domain=` | `src/hooks/useDemoMode.ts` |
| Check engine, registry, scoring | `src/lib/checks/` |
| Summary shape, category labels, Fix first grouping, developer notes | `src/lib/checks/view-model.ts` |
| Site roll-up | `src/lib/site-aggregate.ts` |
| Dashboard UI | `src/app/dashboard-widget-extension/page.tsx`, `src/components/dashboard/{OverviewTab,PagesTab,AgentAccessTab,CitationsTab,FilesTab,Sparkline}.tsx` |
| Shared UI (rings, chips, status icons, buttons) | `src/components/shared/`, Blok in `src/components/ui/` |
| Score history | `src/hooks/useScoreHistory.ts` |
| History storage, "What changed" | `src/lib/history/store.ts`, `src/lib/history/what-changed.ts`, `src/hooks/useWhatChanged.ts` |
| AI citations: route, probes, classification, readiness, browser storage, tab | `src/app/api/citation-probe/route.ts`, `src/lib/server/citation-probe.ts`, `src/lib/citations/`, `src/hooks/useCitationProbe.ts`, `src/components/dashboard/CitationsTab.tsx` |
| llms.txt builder | `src/lib/llms-txt/build.ts` |
| Site type setting | `src/hooks/useSiteType.ts` |
| Dashboard types | `src/types/dashboard.ts` |
| Demo data | `src/lib/rule-engine/test-fixture.ts` |
