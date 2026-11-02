# "Is It Agent-Ready?" — v2 Implementation Plan

> **How to use this file:** start a new Claude Code session in this repo and say:
> *"Read `docs/IS-IT-AGENT-READY-PLAN.md`. We are starting Phase 0. Follow the working agreement in section 1."*
> Work one phase at a time. Each phase has its own branch, PR, and acceptance criteria.

---

## 1. Working agreement (for the implementing session)

1. **One phase per branch:** `feature/v2-phase-<n>-<slug>`, PR into `main`, matching the repo's existing PR flow. Don't start the next phase until the user approves the PR.
2. **Read before changing.** Every phase lists the key files, but confirm current behaviour in the code first. This plan was written on 2026-10-23 against commit `28963dc`.
3. **Keep demo mode working.** Every new check or screen needs fixture data in `src/lib/rule-engine/test-fixture.ts` so `?demo=1` shows it. The Symposium demo depends on this.
4. **Keep the docs current.** Update `docs/*-EXPLAINED.md` (for marketers) and `docs/*-TECHNICAL.md` (for engineers) in the same PR, then rebuild them with `node docs/build-docs.js`.
5. **Prefer the SDK.** Use Marketplace SDK calls (`client.query` / `client.mutate`, `xmc.*`) over custom workarounds. This is a standing user preference.
6. **Spikes come first.** Questions marked **[SPIKE]** must be answered with real output and written to `docs/SPIKE-FINDINGS.md` before any code that depends on them.
7. **No Scrunch.** The user doesn't have a Scrunch subscription. Don't add Scrunch dependencies. A connector may be added later (section 11).
8. **The design reference is the Symposium mockups:** https://claude.ai/artifact/W14BiRPGnEoUwitMkPeB7D
   - It's a private claude.ai artifact. Read it with the Artifact tool (`action: "read"`); each screen is a `project/*.dc.html` file.
   - Screens: Cover, Current → v2 mapping, Page Builder (Score / Agent View / AI Assist), Dashboard (Overview / Pages / Agent access / AI citations / Files).
   - When this plan and the mockups disagree on layout or copy, follow the mockups. When they disagree on behaviour or scoring, follow this plan.
9. **Check the open items (section 13)** at the start of each phase, pick up the ones assigned to it, and add anything a phase leaves open before its PR is merged.

---

## 2. Background (why v2)

| Change in the market | What it means for this app |
|---|---|
| Sitecore bought **Scrunch** (June 2026). SitecoreAI now has "AI discoverability powered by Scrunch": Signals, AEO opportunities in Page Builder, AXP agent-readable pages, and Knowledge Studio. | That covers brand-level monitoring and content rewrites, but only for customers with a separate Scrunch subscription. It doesn't check whether agents can technically reach and parse the site, and it doesn't write technical fixes into Sitecore. **Our position: technical agent-readiness plus fixes inside the editor, for every SitecoreAI customer, with no extra licence.** |
| Agent-readiness scanners are now public: **isitagentready.com** (Cloudflare) and **is-agentic.com**. | Agent-readiness is now its own category. We adopt their strongest checks and their scoring style: Essential / Recommended / Bonus, with N/A checks excluded. |
| **Markdown for agents** has become a convention: send `Accept: text/markdown` and get Markdown back (accept.md, Cloudflare Markdown for Agents). | New "Agent View" tab plus checks in the style of the accept.md audit. |
| **`getPageHTML()`** was added to the Marketplace SDK client on 2026-09-17. It returns the rendered canvas HTML of the page open in Page Builder, including unsaved edits. It has no `<head>` or scripts, and it keeps some editor artifacts that must be removed (`docs/SPIKE-FINDINGS.md` §3). | Content checks can run on the **draft** without a network fetch. It also fixes the bug where Claude receives an empty page body. |
| Claude API: `claude-sonnet-4-6` → current models, structured outputs, server-side web search (`web_search_20260209`). | Better, cheaper AI calls, and **measured** citation probes instead of guessed stars. |

Reference URLs:
- https://doc.sitecore.com/sai/en/users/sitecoreai/ai-discoverability-powered-by-scrunch.html
- https://is-agentic.com/methodology
- https://isitagentready.com
- https://www.accept.md/markdown-audit
- https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/get-the-page-html.html
- https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
- https://blog.cloudflare.com/content-signals/

---

## 3. Current state (as of `28963dc`)

Sitecore Marketplace app (Next.js 15, React 19, Tailwind 4, `node-html-parser`) with two extension points:

- **Pages Context Panel** (`src/app/pages-contextpanel-extension/page.tsx`): 15 checks, 81 points, 3 groups (Technical SEO, Structured Data, Content Quality), a noindex gate, and an AI meta/OG generator that writes 4 fields through `xmc.pages.updateFields`.
- **Dashboard Widget** (`src/app/dashboard-widget-extension/page.tsx`): a separate 5-pillar model (Crawlability / Structured / Answerability / Authority / Retrievability), worst pages, a page matrix, and the AI Citation, LLMs.txt, Robots.txt and Footer trust tabs.

Key files: `src/lib/rule-engine/{engine,types,helpers,site-score}.ts`, `src/lib/site-aggregate.ts`, `src/hooks/{usePageFields,useScan,useSitePages}.ts`, `src/app/api/*/route.ts`, `src/lib/server/extract-html.ts`, `src/components/*`.

### Known defects to fix (Phase 1)

| # | Defect | Where |
|---|---|---|
| D1 | The panel sends `richTextFull` (always `""`) as `bodyText`, so the uniqueness check and the meta generator only see the title | `pages-contextpanel-extension/page.tsx`, `mapFieldsToAuthoring` |
| D2 | `aeo-organization-schema`, `aeo-structured-data` and `aeo-faq-schema` always pass. They output a snippet but never check the page | `src/lib/rule-engine/engine.ts` |
| D3 | The Organization JSON-LD and the brand document are hardcoded to "BrandX" | `helpers.ts` `buildOrganizationJsonLd`, `src/lib/brand/brand-document.ts` |
| D4 | Two scoring models with different thresholds (ScoreRing green ≥ 80%, site "good" > 70%) | `ScoreRing.tsx`, `site-aggregate.ts` |
| D5 | Comments disagree with the code (Authority "25" vs `MAX_PILLARS` 28; Structured "0–20" vs a reachable max of 17) | `site-score.ts` |
| D6 | `/api/rescan-page` is unused | `src/app/api/rescan-page` |
| D7 | Starter branding left over: `package.json` name `xmcloud-extension-starter`, the starter README, title "Sitecore Marketplace Extensions" | root, `src/app/layout.tsx` |
| D8 | The dashboard calls Claude for every page on every scan, with no cache keyed on content | `useSitePages.ts`, `api/ai-check` |
| D9 | **SSRF risk:** server routes fetch caller-supplied URLs (`preview-fetch?url=`, robots, footer, citation) without checking the host | `src/app/api/*` |
| D10 | The AI uniqueness check re-runs on every page change in the panel | `useScan.ts` |

---

## 4. Name and branding

- **App name:** **Is It Agent-Ready?**
- **Marketplace listing:** "Is It Agent-Ready? for SitecoreAI". The suffix is required to tell us apart from Cloudflare's "Is It Agent Ready?" (isitagentready.com). Never shorten the name in a way that drops the hyphen and the "for SitecoreAI".
- **Panel headline:** "Is this page agent-ready?" **Dashboard headline:** "Is this site agent-ready?"
- **Verdicts:** **Agent-ready** (≥ 80) · **Almost there** (60–79) · **Not ready** (< 60). Use the same thresholds everywhere (fixes D4).
- **Tagline:** "Make every page reachable, readable and citable by AI agents, then fix it right in Sitecore."
- **Rename touch points:**
  - `package.json` (`"name": "is-it-agent-ready"`)
  - `src/app/layout.tsx` metadata
  - README (rewrite it; drop the starter text)
  - Panel and dashboard headers
  - `docs/*`
  - The app registration in the Sitecore Cloud Portal (manual step for the user)
- **Keep these unchanged:** the localStorage key prefixes, so existing caches survive. If a key must change, bump its version.

---

## 5. Target scoring model (replaces both current models)

### 5.1 Structure

- **Four categories**, phrased as plain-language questions and used in both the panel and the dashboard:

  | Category | Question shown to authors | Covers |
  |---|---|---|
  | **Reach** | Can AI agents get to it? | Bot access, robots, canonical, indexability, sitemap, status codes |
  | **Read** | Can they read it? | Markdown negotiation, content without JS, landmarks, speed |
  | **Understand** | Do they understand it? | Headings, title and meta, JSON-LD, FAQ, readability |
  | **Trust** | Will they trust and cite it? | Uniqueness, author, freshness, depth, trust pages |

- **Three tiers**, after is-agentic:
  - **Essential:** 80-point pool.
  - **Recommended:** 20-point pool.
  - **Bonus:** up to +5. The total is capped at 100.
  - Each pool is split equally across the checks that apply. A partial pass earns partial credit (0–1). **N/A checks are excluded, never failed.**
- **Gate:** keep the existing noindex / nosnippet gate. A blocked page shows the gate instead of a score.
- **Two scopes:**
  - **Site checks:** computed once per site, shown on the dashboard, and summarised in the panel as "Site issues affecting this page".
  - **Page checks:** computed per page in the panel and in dashboard scans.
- **Site type setting** (dashboard, stored per site): Content site (default) / Commerce / App or API. It decides which Bonus protocol checks apply.

### 5.2 Check registry

Create `src/lib/checks/registry.ts`. Each check is a typed object:

```ts
interface CheckDef {
  id: string;                      // e.g. "reach.ai-bot-access"
  title: string;                   // outcome phrasing, e.g. "AI agents can open your site"
  why: string;                     // one sentence on why it matters to AI
  category: "reach" | "read" | "understand" | "trust";
  tier: "essential" | "recommended" | "bonus";
  scope: "site" | "page";
  source: "draft" | "live" | "fields" | "ai" | "psi" | "probe";  // shown as a chip in the UI
  owner: "author" | "developer";   // who can fix it; drives the "You can fix" / "Developer" badge
  applies(ctx): boolean;           // N/A logic
  run(ctx): Promise<CheckResult>;  // returns credit 0..1, status, evidence, fix
  fix?: FixAction;                 // generate | apply-field | copy-snippet | send-to-developer
}
```

- **As built in Phase 3** (agreed with the user on 2026-11-01; code in `src/lib/checks/`):
  - `run(ctx)` is **synchronous** and returns `CheckResult`: all data is fetched before the checks run, so the engine stays pure. Data that needs fetching (e.g. Phase 6's `api/agent-access`) goes in a loader, not in `run`.
  - `source` is `sources: Source[]`, because several checks read two sources (e.g. P9 is fields + live). Each check also has `ref` (P2, S7, …) and the optional `weight` (default 1, none set).
  - A result has a `state`: `scored`, `not-applicable`, or `not-checked` (AI pending, PageSpeed not run, fetch failed). Both non-scored states are left out of the pools.
  - **Site checks get their own site score** and never feed page scores.
  - **Same inputs in both views:** every page check reads the live HTML, plus the same Sitecore fields by the same names (title, meta description, Robots Meta Tag, `__Updated`). FAQ Q&A pairs come from the rendered HTML, not the AccordionItem datasources. The only difference is PageSpeed, which only the panel runs.

- **Data sources:**
  - `draft` = `getPageHTML()` (Phase 4)
  - `live` = HTTP fetch of the published URL
  - `fields` = authoring GraphQL
  - `ai` = Claude
  - `psi` = PageSpeed Insights
  - `probe` = citation probe
- **Site checks** (dashboard; S = site):

| ID | Title (author-facing) | Tier | Cat. | Source | Notes |
|---|---|---|---|---|---|
| S1 `reach.ai-bot-access` | AI agents can open your site | Essential | Reach | live | Fetch the home page and 2 sample pages using the user agents of GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot and meta-externalagent. Compare status and body size with a browser user agent. Catches WAF/CDN blocks that robots.txt doesn't show. |
| S2 `reach.robots-ai-rules` | robots.txt lets AI search in | Essential | Reach | live | Group bots by purpose: **search / user-fetch / training**. Blocking search or user-fetch bots = fail. Blocking only training bots = pass with an "info" note (a legitimate choice). Replaces the 6-bot check. |
| S3 `read.markdown-site` | Your site can serve Markdown to agents | Essential | Read | live | The accept.md checks (see P5), run on the home page |
| S4 `reach.sitemap` | Sitemap is published and linked | Recommended | Reach | live | `/sitemap.xml` (or the robots `Sitemap:` line) returns 200, is valid XML and has `lastmod` |
| S5 `read.llms-txt` | llms.txt is published | Recommended | Read | live | `/llms.txt` returns 200, follows the llmstxt.org format, and has a "when to use this site" section. Link to the existing generator. |
| S6 `trust.trust-pages` | About, contact and privacy pages exist | Recommended | Trust | live | Upgrades the footer-trust check: each linked page returns 200, and privacy has ≥ 500 characters |
| S7 `understand.org-schema` | Your organisation is described for AI | Recommended | Understand | live | Home page Organization JSON-LD, read from the live site and graded with the four agreed rules (see the note below the table). Required: `name`, `url` on the site's own domain, `logo`. Recommended: `sameAs`, `description`, `contactPoint`. Bonus: `address` (PostalAddress), `legalName`. Built in Phase 3. |
| S8 `reach.not-found` | Missing pages return a real 404 | Recommended | Reach | live | A random path must return 404, not a soft 404 |
| S9 `reach.content-signals` | Content-use signals are declared | Bonus | Reach | live | `Content-Signal:` directive in robots.txt |
| S10 `read.link-headers` | Discovery links in HTTP headers | Bonus | Read | live | RFC 8288 `Link` headers on the home page (e.g. to llms.txt or the sitemap) |
| S11 `read.agent-protocols` | Agent protocols published | Bonus | Read | live | MCP server card, WebMCP, A2A agent card, agent skills, API catalog, OAuth discovery. **Applies only to the App/API site type.** |
| S12 `read.commerce-protocols` | Agentic checkout protocols | Bonus | Read | live | ACP, UCP, x402, MPP. **Applies only to the Commerce site type.** |

- **S7 scoring rules** (agreed with the user on 2026-10-31). The check runs once per site on the home page, not on every page. In the panel it shows as a site issue, and as a full check only when the home page is open.

  | What the home page has | Score | What the user sees |
  |---|---|---|
  | Organization schema, complete | Full | Pass |
  | Organization schema, missing fields | Partial | Warning listing the missing fields, plus a corrected snippet |
  | No Organization schema (page fetched fine) | 0, shown as a warning (amber), not a red fail | "Not added yet" and a ready-to-paste snippet from `NEXT_PUBLIC_ORG_*` ("+N pts") |
  | Couldn't check (site unreachable or unpublished) | N/A, excluded from the score | "Couldn't check" and the snippet |

  - **Detection:** parse every `application/ld+json` block, including `@graph` bundles, `@type` arrays (`["Organization", "LocalBusiness"]`) and Organization subtypes (`Corporation`, `LocalBusiness`, `FinancialService`, `BankOrCreditUnion`, …). A `WebSite.publisher` that points to an Organization by `@id` also counts. A block that doesn't parse is a fail, with the parse error shown.
  - **Config is the expected value, not the result:** when `NEXT_PUBLIC_ORG_*` is set, a schema naming a different organisation or domain is a warning.
  - **The fix snippet** starts from the schema already on the site and fills only the gaps from config.
  - Duplicate Organization entries with conflicting data are a warning; Organization schema on inner pages is fine.
  - Live only: the `getPageHTML` draft has no `<head>` scripts.
  - Today's `extract-html.ts` reads only top-level `@type` strings, so it misses all of these patterns. The shared P10/S7 parser must fix that for the dashboard's schema checks too.
  - Evidence (2026-10-31): the BrandX home page has no JSON-LD at all, yet the current `aeo-organization-schema` gives it 5/5.

- **Page checks** (panel and dashboard; P = page):

| ID | Title | Tier | Cat. | Source | Notes / origin |
|---|---|---|---|---|---|
| P1 `reach.indexable` | Page is indexable and snippet-eligible | Gate | Reach | fields + live | Existing gate |
| P2 `reach.canonical` | Canonical points to this page | Essential | Reach | live | Existing `seo-canonical` |
| P3 `read.no-js-content` | Content is visible without JavaScript | Essential | Read | draft vs live | Compare the main text of `getPageHTML()` with the raw server HTML. Flag components that only render in the browser. **[SPIKE: does `getPageHTML` include content rendered by client-side scripts?]** |
| P4 `read.landmarks` | Page structure is machine-readable | Recommended | Read | draft | Existing `cq-agentic-readiness` (landmarks plus unlabelled controls) |
| P5 `read.markdown-page` | Agents can get this page as Markdown | Essential | Read | live | accept.md checks: (a) 200 + `text/markdown` + a Markdown body; (b) HTML fallback for `text/html`; (c) `Vary: Accept`; (d) Markdown differs from the HTML, with the size saving. Details in Phase 7. |
| P6 `read.markdown-quality` | The Markdown version is complete | Recommended | Read | live + fields | Front matter title and description match the Sitecore fields; ≥ 90% coverage of headings, paragraphs and FAQ answers; layout chrome (nav/footer) < 25% of tokens. **N/A if P5 fails.** |
| P7 `read.speed` | Page loads fast | Recommended | Read | psi | Existing `cq-page-experience`, still on demand |
| P8 `understand.headings` | One clear H1 and logical headings | Essential | Understand | draft | Existing `seo-headings` |
| P9 `understand.title-meta` | Title and description are set | Essential | Understand | fields + live | Merges `seo-meta-title` and `seo-meta-description` |
| P10 `understand.json-ld` | Structured data is present and valid | Essential | Understand | live (+ draft) | **Fixes D2.** Parse the real `application/ld+json` from the live page; the draft has no scripts, so it's used only to detect Q&A pairs. Expect BreadcrumbList on inner pages, FAQPage when there are Q&A pairs, and Article/BlogPosting on article templates. Check that it parses and that required properties exist. Keep the snippet generator as the fix. |
| P11 `understand.metadata` | Page identity metadata is complete | Recommended | Understand | live | `html lang`, `og:type`, `og:image`, `og:title`/`og:description` (extends `seo-og-tags`) |
| P12 `understand.faq-quality` | FAQ answers are quotable | Recommended | Understand | draft | Existing check, but find Q&A in **any** component (not only the AccordionItem rendering ID) |
| P13 `understand.question-headings` | Sections answer real questions | Recommended | Understand | draft | Re-enable `aeo-question-headings` (currently disabled) |
| P14 `understand.readability` | Easy to read and quote | Recommended | Understand | draft | Reading grade plus paragraph length (merges the panel and matrix versions) |
| P15 `understand.image-alt` | Images are described | Recommended | Understand | draft | Existing `seo-image-alt` |
| P16 `trust.uniqueness` | Content is original, not generic | Recommended | Trust | ai (draft body) | Existing check, now receiving the full body (fixes D1) |
| P17 `trust.author` | Author is named and linked | Recommended | Trust | draft + fields | Re-enable `cq-author`. **Applies only to article templates.** |
| P18 `trust.freshness` | Content is recently updated | Recommended | Trust | live + fields | Re-enable `cq-freshness` |
| P19 `trust.depth` | Enough depth to be cited | Recommended | Trust | draft | Word count (from the matrix) |
| P20 `trust.anchor-text` | Links say where they go | Recommended | Trust | draft | Existing `seo-anchor-text`, now scored |
| P21 `trust.follow-up-gaps` | Answers the next question too | Bonus | Trust | ai | Re-enable `cq-followup-gaps` |

- **Weights:** set by the pool formula in 5.1, not by hand. If a demo needs tuning, add an optional `weight` multiplier to `CheckDef`, defaulting to 1.

### 5.3 Current → v2 mapping (nothing is removed)

**Page Builder panel checks**

| Current check (code ID) | v2 check |
|---|---|
| Noindex gate | P1 `reach.indexable` |
| `seo-canonical` | P2 `reach.canonical` |
| `seo-meta-title` + `seo-meta-description` | P9 `understand.title-meta` (merged) |
| `seo-headings` | P8 `understand.headings` |
| `seo-image-alt` | P15 `understand.image-alt`, plus an AI alt-text fix |
| `seo-og-tags` | P11 `understand.metadata` (adds `html lang`, `og:type`) |
| `seo-anchor-text` (info only) | P20 `trust.anchor-text` (now scored) |
| `aeo-organization-schema` | S7 `understand.org-schema` (becomes a site check, built in Phase 3) |
| `aeo-structured-data` + `aeo-faq-schema` | P10 `understand.json-ld` (real detection; merged) |
| `aeo-faq-answer-quality` | P12 `understand.faq-quality` (any component) |
| `cq-uniqueness` | P16 `trust.uniqueness` (full body) |
| `cq-page-experience` | P7 `read.speed` |
| `cq-agentic-readiness` | P4 `read.landmarks` |
| `cq-reading-grade` | P14 `understand.readability` (plus paragraph length from the matrix) |
| Disabled: `cq-author`, `cq-freshness`, `aeo-question-headings`, `cq-followup-gaps` | P17, P18, P13, P21 (switched back on) |
| Disabled: `aeo-howto-schema` | **Stays off.** Revisit only if HowTo content templates exist. |
| `MetaGenerator` | AI Assist tab (Phase 9) |

**Dashboard**

| Current feature | v2 |
|---|---|
| 5 pillars | Replaced by the 4 categories |
| Site summary and category cards | Overview tab |
| Worst 10 pages and all-pages matrix | Pages tab (heatmap) |
| Robots.txt tab | Agent access tab (S1/S2) and Files tab (robots.txt helper) |
| Footer trust tab | S6 `trust.trust-pages` in Agent access |
| LLMs.txt tab | Files tab (generator) and S5 `read.llms-txt` |
| AI Citation tab | AI citations tab (section 8) |
| Matrix-only signals (word count, freshness, question H2s, paragraph length) | P19, P18, P13, P14 |

---

## 6. UI / UX redesign

### 6.1 Problems with the current UI

1. **Two vocabularies.**
   - Panel: "Page health" with Technical SEO / Structured Data / Content Quality.
   - Dashboard: "Site content health" / "AI Search Readiness" with Crawlability / Structured / Answerability / Authority / Retrievability, abbreviated in the matrix as CRAWL / STRUCT / ANSWER / AUTH / RETRIEV.
2. **Points jargon.** "5 / 8", "35 pts" and different maximums per page mean nothing to a marketer.
3. **Diagnosis without direction.**
   - Results come back as a long flat list in rule order, with no "fix this first".
   - Fixes are blue "→" text or raw JSON-LD code blocks.
4. **Hard to scan.**
   - Status dots are 4 px (`w-1 h-1`), and colour is the only status signal (an accessibility problem).
   - Tiny 10–11 px grey text.
5. **Tabs named after files.** "LLMs.txt", "Robots.txt" and "Footer trust" are implementation details, not outcomes.
6. **It doesn't say who should act.** A marketer can't tell which fixes are theirs and which need a developer.
7. **It looks generic.** Plain Tailwind greys that don't match the SitecoreAI shell, and no visual identity.
8. **Hidden actions.** PSI and AI checks need a small "Run scan" chip, and the AI meta generator sits at the bottom of a long scroll.

### 6.2 Design principles

1. **Answer first.** One verdict, one score and one sentence at the top: "Almost there: 2 quick fixes would make this page agent-ready."
2. **Act, don't just diagnose.** A **"Top fixes"** list ranked by points gained. Every fix has a verb button: *Generate*, *Apply*, *Copy snippet*, *Send to developer*.
3. **One language everywhere.**
   - Use the four categories **Reach · Read · Understand · Trust**, written as questions.
   - Name checks by their outcome ("AI agents can open your site"), not the mechanism ("robots.txt").
   - Put jargon such as AEO, GEO and JSON-LD in an info tooltip.
4. **Say who fixes it.** Every check shows a **You can fix** badge (author) or a **Developer** badge.
5. **Show, don't tell.** The Agent View shows what an AI actually receives.
6. **Status never by colour alone.** Every status has an icon, a colour and a word:
   - ✓ Pass
   - ! Improve
   - ✕ Fix
   - — N/A
7. **Show the data source.**
   - A small chip on every check: **Draft** (from `getPageHTML`), **Live** (published site) or **AI**.
   - A banner when the draft differs from the live page.
8. **Show progress.** A score change since the last scan ("▲ 6"), an animated ring, and a positive empty state when everything passes.
9. **Look native.** Use Sitecore's **Blok** design system if it's practical **[SPIKE: package or registry, and how it fits Tailwind 4]**. Otherwise build Tailwind tokens that copy SitecoreAI's typography, radius and colours.
   - Panel minimum width: 320 px.
   - Body text ≥ 13 px.
   - Support both light and dark themes if the host passes a theme.

### 6.3 Page Builder panel: target layout

Header:
- App mark, then "Is It Agent-Ready?"
- Draft/Live chip
- Re-scan icon

Tabs: **Score · Agent View · AI Assist**

**Score tab**
1. **Verdict card:**
   - Score ring (0–100) and verdict.
   - "▲ 6 since last scan".
   - A one-sentence summary.
2. **Category bars:** Reach / Read / Understand / Trust. Each is a mini progress bar with a score; tapping it filters the list.
3. **Top fixes (3):**
   - Each row shows the title, "+N pts", a You can fix or Developer badge, and the primary action button.
4. **Site issues strip.** Shown only when site checks fail, e.g. "2 site issues affect every page: ChatGPT-User is blocked by your firewall · View in dashboard".
5. **All checks:**
   - Grouped by category, with a filter: Needs work / All.
   - Each row: status icon, outcome title, source chip, credit.
   - Expanding a row shows why it matters, the evidence and the fix.
   - Code snippets sit behind a "Show code" toggle.

**Agent View tab** (Phase 7)
- A status row with the 4 accept.md checks.
- A token savings bar (HTML tokens vs Markdown tokens).
- A Human / Agent toggle: the rendered Markdown, or the local conversion preview labelled "Preview: your site doesn't serve this yet".
- Markdown quality checks.
- How-to-fix cards.

**AI Assist tab** (Phase 9)
- The existing meta & social generator, plus alt text, FAQ answers, question headings and a summary paragraph.
- Every suggestion shows before → after, with an **Apply to field** button (staged as a draft, respecting workflow) or **Copy**.

### 6.4 Dashboard: target layout

Header:
- App name and site name
- Site type selector
- "Last scan 2 h ago"
- **Scan site** button

Tabs: **Overview · Pages · Agent access · AI citations · Files**

**Overview**
- **Hero:** site score ring, verdict, a trend sparkline of the last 8 scans, and page counts (Agent-ready / Almost there / Not ready).
- **Four category cards:** question, score, pages failing, and "What's included".
- **Fix first (grouped by issue, not by page).** For example:
  - "14 pages: meta description missing → **Generate for all**"
  - "ChatGPT-User blocked by firewall → **Developer**"
- **What changed since last scan.** Replaces Scrunch Signals. Lists score drops, newly blocked bots, and pages that got worse after publishing.

**Pages**
- A heatmap matrix with full category names (no abbreviations), search, filter chips, and sorting.
- Each row has "Open in Page Builder".

**Agent access**
- Site checks S1–S12 as a checklist.
- The S1 bot × status grid, grouped Search / User / Training, each with ✓ / ✕ and the HTTP status.

**AI citations** (Phase 8): see section 8.

**Files**
- **llms.txt generator** (existing), with:
  - a "Published? ✓/✕" status
  - the score filter
  - a new editable "When should AI tools use this site?" text, which becomes a `## When to use this site` section
  - Copy, Download and Send to developer buttons
- **robots.txt helper:**
  - Checkboxes for search bots, user-fetch bots, training bots and the Content-Signal line.
  - The generated text updates live, using Allow/Disallow per group, the `Content-Signal: search=…, ai-input=…, ai-train=…` line, and the Sitemap line.
  - A note that robots.txt is a request and the firewall decides real access, linking to Agent access.

### 6.5 Visual identity

- **Accent colour.** One brand accent for the app mark and primary buttons: a deep indigo/violet that reads as "AI" and sits well next to SitecoreAI's UI.
- **Status colours** stay semantic (green / amber / red / grey) and always come with an icon.
- **Category colours:** a fixed palette for Reach / Read / Understand / Trust, used consistently in bars, chips and the heatmap legend.
- **Type and spacing:**
  - Panel: one size scale (12 / 13 / 15 / 20 / 28).
  - Card radius 8–10 px, 1 px borders, soft shadows only on the hero.
- **Icons:** one icon set (e.g. `lucide-react` at a pinned version) instead of inline one-off SVGs.

---

## 7. Data sources: draft vs live

- **Draft = `client.getPageHTML()`.** Works only in Page Builder extension points. It is a snapshot, so call it again (debounced 1–2 s) on `pages.content.fieldsUpdated` and on page change.
  - It returns the `<body>` only, with an empty `<head>` and no scripts, so it's good for body checks only. Head checks (title, canonical, meta, OG, JSON-LD) stay on `live` and `fields`.
  - Run every capture through a **sanitiser** before any check: strip `Fallback: …` hint text, `[No text in field]` placeholders, `contenteditable`, the `editing-mode` wrapper, and empty-datasource messages. Unit-test it with fixtures taken from the spike captures.
- **Live = the existing `/api/preview-fetch`** for anything that needs HTTP headers or status codes, the `<head>`, robots, the sitemap or Markdown negotiation.
- **Fallback:** if `getPageHTML()` rejects (unsupported host), use `preview-fetch` with the editing secret, as today, and mark checks "Live".
- **The dashboard** can't use `getPageHTML`. It stays live-only.

**[SPIKE — answer all of these before Phase 4]:** all answered on 2026-10-29/30 (see `docs/SPIKE-FINDINGS.md` §3): `string`; no `<head>`; unsaved edits included; client-rendered content included (but client-fetched listings can be empty in the editor); editor artifacts present; works in the context panel.
1. Exact return type after the SDK upgrade: `string` (Sitecore docs) or `{ html }` (blog example)?
2. Is `<head>` included (title, canonical, meta, JSON-LD)?
3. Are unsaved edits included, or only saved ones?
4. Is content rendered by client-side scripts included?
5. Do placeholders, empty datasources or leftover editor attributes (`data-*`) appear?
6. Which extension points support it (the context panel, for certain)?

---

## 8. AI citations without Scrunch (replaces the current forecast)

**What exists today.** `api/citation-forecast` asks Claude to *guess* 1–5 stars for ChatGPT, Perplexity, Copilot and Gemini from the page, the home page and robots.txt. Nothing is measured, and one model is pretending to be four engines.

**v2 has two layers, clearly labelled.**

### Layer 1 — Readiness estimate (instant, free, deterministic)

- Derived from the category scores plus each engine's bot access (from S1/S2). For example, if PerplexityBot or Perplexity-User is blocked, Perplexity shows **"Can't cite: blocked"**.
- Shown per engine as **Ready / Limited / Blocked**, with the reasons. There is no LLM call, so it's explainable and repeatable.

### Layer 2 — Citation probes (measured, on demand)

1. Claude generates 5–10 realistic **non-branded** questions the page should answer (structured output; the user can edit them).
2. Each question goes to Claude with the server-side **web search tool** (`web_search_20260209`, `max_uses` ≈ 3, `allowed_callers: ["direct"]`, optional `user_location`). Direct calls are required: with the default dynamic filtering the answer carries no citations (see `docs/SPIKE-FINDINGS.md` §5).
   - Claude can skip searching and answer from its own knowledge, and forced `tool_choice` isn't available (section 9). The system prompt must require a search. Retry once when `usage.server_tool_use.web_search_requests` is 0.
3. Measured in code from the response, not by asking the model:
   - **Found:** the site's domain or page URL appears in the `web_search_tool_result` results.
   - **Cited:** it appears in the citation locations attached to the answer text.
   - **Not searched:** no search ran, even after the retry. Found and Cited are unknown, not false.
   - **Cited instead:** the other domains cited, used as a competitor list.
   - "The site" means its domain plus any extra hosts the user marks as its own (dev, staging, regional domains). Otherwise those hosts show up as competitors.
4. Show the totals, e.g. **"Cited in 2 of 8 questions · Found in 5 of 8"**, plus a table of questions → our status → who was cited instead. Not-searched questions are left out of the totals and listed separately (e.g. "1 question not searched").
5. **Optional extra engines.** When their API keys are configured, run the same questions through engines that return sources:
   - Perplexity Sonar API
   - Gemini API with Google Search grounding
   - OpenAI Responses API web search

   Each engine gets its own label. Hide any engine whose key is missing. The default is Claude only.
6. **Cost and controls:**
   - Probes run only on demand, never in bulk dashboard scans.
   - Cache results for 7 days per page and question set, and rate-limit per site.
   - Show the date of each run.
   - Web search costs $10 per 1,000 searches. A measured probe cost about $0.08 per question in direct mode (`docs/SPIKE-FINDINGS.md` §5).
7. **Honesty caveat in the UI:** "AI answers vary by time, location and engine. This is a sample, not a ranking."
8. **History:** store each probe run so the trend shows. Use localStorage first; Phase 8 asks the user about server storage.

### Other things that assumed Scrunch, re-analysed

| Was | Now |
|---|---|
| Scrunch Signals | **"What changed since last scan"**: compare score snapshots per page and per site. Needs history storage. Today localStorage holds history per browser; **decide in Phase 8** whether to add shared server storage (e.g. Vercel KV / Upstash Redis or Postgres). |
| Scrunch AEO opportunities | **AI Assist suggestions** (Phase 9): question headings, quotable FAQ answers, a summary paragraph, meta, and alt text. Generated from the draft HTML, applied through `updateFields` where a field exists, and copy-only otherwise. |
| Scrunch AXP (agent-readable pages) | The **Agent View** fix guidance: `npx accept-md init` in the Next.js head app, Cloudflare Markdown for Agents, or custom Next.js middleware. |
| Scrunch Knowledge Studio | Dropped (DAM-specific, out of scope). |
| "Complements Scrunch" positioning | **"Works for every SitecoreAI customer, with no extra licence."** A Scrunch connector stays an optional future item (section 11). |

---

## 9. Claude API modernisation

- **Switch from raw `fetch`** to the official `@anthropic-ai/sdk` (TypeScript) in `api/ai-check`, `api/citation-forecast` (to become `api/citation-probe`) and `api/generate-meta`. Put shared client setup in `src/lib/server/anthropic.ts`.
- **Model:** default `claude-opus-5-5`, configurable through `ANTHROPIC_MODEL`.
  - The app used Sonnet before. If the user wants lower cost for high-volume dashboard scans, `claude-sonnet-5-5` is the current Sonnet. **Ask the user; don't downgrade silently.**
- **Opus 5.5 specifics:**
  - Thinking can't be disabled. Control depth with `output_config.effort`: use `low` for classification, ratings and meta copy, and `medium` for question generation. The default is `medium`, so always set it explicitly.
  - Forced `tool_choice` returns a 400. Use `auto`.
  - Use **structured outputs** (`output_config: { format: … }`) for every JSON response instead of "respond with JSON only" prompts.
  - Enable server-side **refusal fallbacks**: beta `server-side-fallback-2026-07-01` with `fallbacks: "default"`. Check `stop_reason` before reading content.
- **Web search tool:**
  - `{ type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_callers: ["direct"] }`. Dynamic filtering (the tool default) runs searches inside code execution and returns no citations.
  - Search errors come back as HTTP 200 with an error object in `web_search_tool_result.content`; check the shape before indexing into it.
  - Don't declare `code_execution` alongside it.
- **Prompt caching:** use stable system prompts with `cache_control: { type: "ephemeral" }`, and put per-page content after the cached prefix. Verify with `usage.cache_read_input_tokens`.
- **Cache AI results by content hash** (SHA-256 of the normalised body text plus the check ID). Re-run only when the content changes (fixes D8 and D10).
- **Read the claude-api skill** (`/claude-api`) before writing this code.

---

## 10. Phases

### Phase 0 — Setup and spikes (no user-visible change)
- Upgrade `@sitecore-marketplace-sdk/client` and `@sitecore-marketplace-sdk/xmc` to their latest versions. Fix any breaking changes.
- Add `vitest` for unit tests of the pure rule-engine functions.
- **Spike: `getPageHTML`** (section 7 questions). Add a temporary debug button in the panel that logs the output for 3 pages: a simple page, an article, and a page with an FAQ.
- **Spike: Blok** design system feasibility with Tailwind 4 and React 19.
- **Spike: web search pricing** and a single test probe.
- Write `docs/SPIKE-FINDINGS.md`.
- **Accept when:** findings are documented, the app builds and runs on the new SDK, and `npm run lint` and `vitest` pass.

### Phase 1 — Rename, clean-up, correctness and security
- Rename (section 4) and rewrite the README (what it is, setup, env vars, extension points, demo mode).
- Fix D1: body text comes from the main text parsed out of `preview-fetch`. Phase 4 switches it to the sanitised `getPageHTML` body (the spike confirmed it carries the full draft body).
- Fix D3: Organization data comes from config or site settings. Replace the BrandX brand document with a configurable brand-voice file and env vars. Keep BrandX as demo fixture data only.
- Fix D5 and D6.
- Fix D9: create `src/lib/server/safe-fetch.ts`. It allows only `http(s)`, blocks private, loopback and link-local IPs after DNS resolution, limits redirects, times out, and caps response size. Use it in every server route.
- **Accept when:** the AI uniqueness check sees the full body (shown in a debug log), no starter branding remains, and SSRF unit tests pass.

### Phase 2 — Claude API modernisation (section 9)
- **Accept when:** all AI routes use the SDK with structured outputs, the model comes from env, caching hits show on repeat calls, and fixtures are unchanged.

### Phase 3 — Unified scoring engine (section 5)
- Build the check registry, the tier/pool scoring, the gate, N/A handling and site type.
- Move every existing check to its new ID. Delete `site-score.ts` and the old pillar types once nothing imports them.
- Make D2 real JSON-LD detection (P10).
- Build S7 `understand.org-schema` with the same JSON-LD parser, using the four scoring rules in section 5.2. Its home-page detection and grading move here from Phase 6, so the false 5/5 is gone before the UI redesign. Phase 6 only adds it to the Agent access tab.
- The engine is UI-agnostic. Keep the old UI temporarily through an adapter.
- **Accept when:** vitest covers the scoring maths (pools, partial credit, N/A, bonus cap, gate), and the panel and dashboard show the **same** score for the same page. S7 has vitest cases for all four rules, plus `@graph`, `@type` arrays and subtypes, and BrandX's home page (no JSON-LD) scores 0 with a warning and a snippet.
- **Status (2026-11-01):** merged in PR #6. All automated checks pass, and both demo views show the same score (89). The parity check inside Sitecore is still open, because the dashboard can't load pages there (section 13, item 1).

### Phase 4 — Draft and live data sources (section 7)
- Create a `usePageHtml` hook (getPageHTML with debounced refresh on `fieldsUpdated`, plus fallback).
- Add the draft HTML sanitiser (section 7) and use it in the hook, so no check ever sees raw editor output.
- Decode HTML entities (`&nbsp;` etc.) in `preview-fetch` text extraction, so draft and live text compare cleanly.
- Include collapsed accordion answers in the body text (section 13, item 3).
- Show a source chip on each result.
- Show a "Draft differs from live" banner when the main-text hashes differ.
- Add P3 (content without JS). The spike confirmed the draft includes client-rendered content. Compare the sanitised draft with the full server `<body>` text, and treat empty-state messages ("No articles found") as "couldn't render in the editor", not content. Use the BrandX Related Articles cards as the test case.
- **Accept when:** an unpublished page scores from its draft, and editing a heading updates the score without a manual re-scan.
- **Status (2026-11-02): accepted.** Merged in PR #11, with the retry fix in PR #12. Checked in Page Builder on production on 2026-11-02, and all passed:
  - Opening a page reads the draft without a Re-scan.
  - Editing a heading updates the score on its own, and the "Draft differs" banner appears.
  - Switching pages reads the new page.
  - An unpublished page scores from its draft.
  - The Banking article shows the P3 warning for `relatedarticles`, with no banner.
- **Built (2026-11-01):** the panel's body checks and AI checks read the sanitised draft and its head checks read live; the dashboard stays live-only. Agreed decisions: the panel's score can differ from the dashboard's (draft edits and client-rendered content), P3 is panel-only, and the AI checks don't re-run on every edit (they're marked stale with a Re-run link). The banner compares main-text blocks rather than a hash, so client-rendered blocks don't trigger it. vitest covers the sanitiser, P3, the banner rule and the body/head split, including real BrandX captures next to their published pages (SPIKE-FINDINGS §3.1), and `?demo=1` shows them. The first production run found that Page Builder can't serve `getPageHTML` until its canvas has loaded, so a page's first read is now retried (SPIKE-FINDINGS §3.2).

### Phase 5 — UI redesign shell (section 6)
- Design tokens and the icon set, then new shared components: `VerdictCard`, `CategoryBars`, `TopFixes`, `CheckRow` (with source chip and owner badge), `StatusIcon`, `Tabs`, `EmptyState`.
- Rebuild the panel (Score tab) and the dashboard (Overview, Pages, Agent access, Files) on the new engine.
- Agent View, AI Assist and AI citations can be placeholder tabs until their phases.
- **Accept when:**
  - The UI matches the approved Symposium mockups (section 1, item 8).
  - No points jargon is visible except "+N pts" on fixes.
  - All statuses have icon + text.
  - Keyboard navigation works.
  - The panel works at 320 px.
- **Status (2026-11-02): accepted.** Merged in PR #14. Checked in Page Builder on production on 2026-11-02, and all passed:
  - The panel fits the panel width: no sideways scroll, and the header chip, Re-scan and status words are visible.
  - The Draft/Live chip reads Draft, and its tooltip isn't clipped.
  - Tabs work by mouse and keyboard (arrow keys, then Tab).
  - Copy snippet and Send to developer copy inside the iframe; Generate opens AI Assist; Show how opens and scrolls to the check.
  - "Since last scan" appears after a Re-scan and follows a heading edit without another re-scan.
  - The category bars and Needs work / All filter the list.
  - The Banking article shows P3 as Improve with a Draft vs Live chip and no banner.
  - The dashboard was reviewed in `?demo=1`; its check with real pages waits for section 13, item 1 (item 8).
- **Built (2026-11-02)** (branch `feature/v2-phase-5-ui-shell`):
  - **Blok** (SPIKE-FINDINGS §4): the theme tokens and six components from the registry at Sitecore/blok `0a7997e`, light theme only. Icons are `@mdi/js`, the set Blok's components use, instead of lucide. Blok's violet is the accent.
  - **Panel:** header with a Draft/Live chip and Re-scan; tabs Score / Agent View (placeholder) / AI Assist (the existing meta generator). Score tab: verdict card with "▲ N since last scan" (localStorage), category bars that filter the list, Top fixes with "+N pts", owner badge and a verb button (Generate, Copy snippet, Send to developer, Show how), and All checks with status icon and word, source chip and Needs work / All. The site-issues strip waits for Phase 6's site data.
  - **Dashboard:** tabs Overview / Pages / Agent access / AI citations (the existing forecast) / Files. Overview: hero with the last 8 scans (localStorage) and page counts, category cards with "What's included", and Fix first grouped by issue (site issues first; Send to developer or Review pages). Pages: heatmap with search, verdict filter and sort. Agent access: S2, S7 and the footer links (not scored) as a checklist, and the robots.txt result per crawler. Files: llms.txt with "When should AI tools use this site?" and robots.txt help. "What changed" waits for Phase 8.
  - **Agreed decisions:** a status word replaces the mockup's credit fractions ("½", "0/1"), which would be points jargon; "+N pts" is `maxPoints − points`, rounded; "Send to developer" copies a note to the clipboard (no write-back until Phase 9); the dashboard's page cache moves to v5 (adds each page's issues, so every page rescans once; AI results stay cached); a page "needs work" in a category below 60% (was 40%).
  - **Checked:** vitest (305 tests), lint, `next build`, and `?demo=1` in headless Chrome: no horizontal scroll at 320 px (panel) or 375 px (dashboard), keyboard focus order and visible focus, arrow keys on the tabs, and a clean console. Still to check in Sitecore: section 13, item 8.

### Phase 6 — Site agent-access checks (S1–S12)
- Create `api/agent-access` (bot user-agent matrix, robots parsing with bot groups, sitemap, llms.txt, trust pages, 404, Content-Signal, Link headers, protocol well-knowns).
- Build the Agent access tab and the panel's site-issues strip. S7 (organisation schema) comes from Phase 3; this phase only displays it.
- Extend the robots.txt helper to generate the AI rules and Content-Signal lines.
- **Accept when:** a demo fixture shows a blocked user agent (403 for ChatGPT-User), and a real site scan finishes in under 20 s.
- **Status (2026-11-02): panel accepted.** Merged in PR #16. Checked in Page Builder on production on 2026-11-02, and all passed:
  - The panel loads.
  - The home page shows the Site check row (S7).
  - There's no site-issues strip, as expected while the BrandX replica passes S1 and S2.
  - The dashboard part (Agent access and Files with the real scan of the replica) stays open under section 13, item 8.
- **Built (2026-11-02)** (branch `feature/v2-phase-6-agent-access`):
  - **`/api/agent-access`** (`src/lib/server/agent-access.ts`): one scan per site, raw evidence only; S1–S6 and S8–S12 grade it in the engine (`src/lib/checks/site/`), synchronously. Every request through `safeFetch`, which gained `publicHeaders` (User-Agent and Accept kept across a cross-origin redirect), a `signal` and the final URL. At most 6 requests at a time, 6 s each, a 17 s deadline, `maxDuration = 30`. Replaces `robots-check` and `footer-check` (removed), and the dashboard's separate robots.txt and home-page fetches.
  - **Bots:** the 12 in 5.2, grouped Search / User / Training. Each is requested on the home page and 2 sample pages linked from it, and compared with a browser (status, size, challenge markers). Not requested: bots robots.txt disallows on `/`, and Google-Extended / Applebot-Extended (robots.txt tokens with no crawler). Blocking only training agents never costs credit, in S1 or S2.
  - **Agent access tab:** S1–S12 checklist with buttons (S2, S5, S9 open the Files tools), the bot × status grid with the purpose filter, the firewall box with Send to developer, and the caveat that requests come from our server, not the AI companies' networks. **Files:** llms.txt Published chip; robots.txt helper with Search / User / Training and Content-Signal checkboxes, starting from today's robots.txt.
  - **Panel:** a red site-issues strip for failing Essential Reach site checks (S1, S2) with View in dashboard (`#agent-access`). Other site checks stay on the dashboard (the mockup's strip shows only the firewall block). The scan is cached an hour per domain in localStorage and shared with the dashboard.
  - **Agreed decisions:** see the Phase 6 plan agreed with the user on 2026-11-02 (one route, grading in the engine; respect robots.txt; home + 2 samples; 6 at a time, 17 s deadline; S3's grader shared with P5; well-knowns fetched for every site type; panel strip; fixture from the mockup). The S11/S12 paths were checked on 2026-11-02 (MCP's server card path is still settling, so two are tried; x402 has no discovery file).
  - **Checked:** vitest (350 tests), lint, `next build`; `?demo=1` in headless Chrome: the grid shows ChatGPT-User and Perplexity-User **403 · Blocked by firewall** (accept-when), no horizontal scroll at 320 px (panel) and 375 px (dashboard), no console errors, and no requests besides the page in demo mode. Real scan of the BrandX demo site through the route: 22 requests in 1.2–3.3 s. Its robots.txt disallows every agent, so no bot request was made there. Real scan with live bot requests (accept-when) on the BrandX replica, hztl-page-health-checker-demo.vercel.app: 34 requests, 12 as bots (OAI-SearchBot, GPTBot, ClaudeBot, PerplexityBot, each 200 on 3 pages), in 1.4–3.1 s; after its robots.txt allowed all seven search and user agents, 43 requests, 21 as bots, in 3.1 s. The first scan found that robots.txt can list another host's sitemap first, so S4 and the robots.txt helper now prefer the site's own `Sitemap:` line.
  - **Demo site:** the app now points at the replica (`NEXT_PUBLIC_DEFAULT_SITE_DOMAIN`, `NEXT_PUBLIC_ORG_URL`; `NEXT_PUBLIC_ORG_LOGO` at the BrandX logo on Sitecore's edge, because `/logo.png` returns a web page on both hosts).

### Phase 7 — Agent View tab (Markdown)
- Create `api/markdown-check`. Fetch the URL twice (`Accept: text/markdown`, then `Accept: text/html`). Return the status, `Content-Type`, `Vary`, sizes, an estimated token count (Markdown chars / 4, or the Claude token counter if cheap) and the first 50 KB of each body.
- Local conversion preview with `node-html-markdown` (pinned), from the draft HTML when available.
- Score P5 and P6. Roll P5 up into S3 and into the dashboard's "% of pages serving Markdown".
- Fix cards: `npx accept-md init` (verify it coexists with the Sitecore Content SDK middleware for redirects, personalisation and multisite **[SPIKE]**), Cloudflare Markdown for Agents, and a custom middleware snippet.
- **Accept when:** a supported site shows 4/4 green, and an unsupported site shows the local preview with the estimated saving.
- **Built (2026-11-02)** (branch `feature/v2-phase-7-agent-view`):
  - **`/api/markdown-check`** (`src/lib/server/markdown-check.ts`): the page requested twice in parallel through `safeFetch`, with S3's `Accept: text/markdown, text/html;q=0.5` and with `Accept: text/html`; 10 s each. Status, final URL, `Content-Type`, `Vary`, bytes and tokens (characters ÷ 4) for each, the Markdown body (50 KB when it's `text/markdown`, else 2 KB), and no HTML body. When no Markdown comes back, the published HTML converted for the preview.
  - **P5** grades it with S3's `gradeNegotiation` (Essential). **P6** (Recommended) grades the served Markdown: front matter title and description vs the fields (⅙ each), coverage of headings, paragraphs and FAQ answers ≥ 90% (⅓), chrome < 25% (⅓); N/A until P5 finds Markdown. **S3** keeps the home page's credit and adds "Markdown on N of M scanned pages" on the dashboard.
  - **Preview:** `toAgentMarkdown` (`src/lib/markdown/convert.ts`, `node-html-markdown` 2.0.0 pinned): main content, collapsed FAQ answers kept, absolute links, front matter. The panel converts the sanitised draft (`DraftHtml.source`).
  - **Agent View tab** as in the mockup: the four status tiles, the token bar ("If you served Markdown: about N% fewer tokens" or the measured saving), Human / Agent preview, "Is the Markdown complete?", and the fix cards (accept-md, Cloudflare Markdown for Agents, your own route behind Show code) with Send to developer.
  - **Dashboard:** P5 and P6 on every page (2 more requests per page; score cache v6), the Read card's "N of M pages not served as Markdown", S3's **See fixes** with the same cards, and Markdown once in Fix first (P5's page row replaces S3's once pages are checked).
  - **Demo:** `?demo=1` is a site without Markdown (the mockup's case), `?demo=1&md=1` one with it (4/4). The demo page is now real HTML (`makeTestPageSource`), so the preview converts real markup. The demo baselines moved so the demo still trends up: page 64 (was 75), site history ending at 56 (was 70).
  - **Agreed decisions** (with the user on 2026-11-02): characters ÷ 4 for tokens; no HTML body in the route; S3 graded on the home page with the page count added; the preview from the draft in the panel and from the published page on the server; P5 Essential as in 5.2 (a site without Markdown loses about 13 points per page in the panel, 16 on the dashboard); P6's rows only for served Markdown; auto-fetch on page change and Re-scan; counts, not %, on the Read card; `&md=1` for the demo; accept-md installed on the replica for the spike.
  - **Checked:** vitest (371 tests), lint, `next build`; `?demo=1` and `?demo=1&md=1` in headless Chrome: the unsupported page shows Fix / Pass / Fix / grey and "about 92% fewer tokens" with the draft's preview, the supported one 4/4 green, "93% fewer tokens" and three passing quality rows (both accept-when cases in demo); no horizontal scroll at 320 px (panel) and 375 px (dashboard), clean console, and only requests to the app in demo mode. Real run against the BrandX replica before accept-md (6 requests): every page returns `text/html` for `Accept: text/markdown` and no `Vary`; about 214 KB of HTML (≈ 53,700 tokens) on the home page and `/services`, a 600–1,370-token preview: 97–99% fewer.
  - **Spike** (SPIKE-FINDINGS §8): `npx accept-md init` (5.0.2) breaks the Content SDK starter's `next.config.js`: it can't edit the method-style `rewrites()` and inserts its own inside `webpack()`, a syntax error. Fixed by hand on the replica's `feature/accept-md` branch (PR ksorthiya/hztl-xcelerate-blueprint-copy#4): the accept-md rewrite is added after the next-config plugins, in `beforeFiles`, because the `feaas`, `robots` and `sitemap` plugins spread `rewrites()` as an array (a first fix that returned an object from `rewrites()` failed the Vercel build); the fix card says so. The middleware tests on the deployed replica are section 13, item 12.

### Phase 8 — AI citations v2 and "What changed"
- Layer 1 estimate, Layer 2 probes (`api/citation-probe`), the question editor, the results table and the history.
- Snapshot storage. **Ask the user:** localStorage only, or shared server storage (pick a provider).
- Build the "What changed" card on the Overview.
- **Accept when:** probes report Found and Cited counts computed from tool results (not model self-report), re-running within 7 days uses the cache, and the caveat is visible.

### Phase 9 — AI Assist and write-back fixes
- Extend `MetaGenerator` into an AI Assist tab:
  - alt text, written to the media item's Alt field through authoring GraphQL (**[SPIKE]** on the mutation shape)
  - FAQ answer rewrites, question headings, a summary paragraph, and JSON-LD
  - an **author byline picker** listing people from the site's Authors folder (no AI; **[SPIKE]** on where author items and the byline field live in the customer's templates)
- JSON-LD writes to a configurable field when the template has one. Otherwise it's copy-only.
- All writes go into the current version and workflow (no auto-publish). Show before → after with a confirm step.
- Dashboard **bulk "Generate for all"** for missing meta descriptions, with a review step for each item before writing.
- **Accept when:** every write needs explicit confirmation and respects the field mapping, a missing field disables Apply with a reason, and there's an audit log (a console line plus a toast).

### Phase 10 — Docs, demo and Symposium package
- Rewrite the four docs for the new model.
- Create `docs/SYMPOSIUM-DEMO-SCRIPT.md`: a 5-minute flow covering panel verdict → Top fixes → Apply → Agent View → dashboard → citations.
- Refresh the demo fixtures so they tell that story.
- **Accept when:** a full demo runs with `?demo=1` and no network.

### Phase 11 — (Stretch) Public scanner
- A route `/scan/[domain]` outside the Marketplace iframe that runs the site checks (S1–S12) plus the home page checks, with a shareable report URL and a badge.
- **Needs:** SSRF-safe fetch (from Phase 1), rate limiting, and caching.
- Doubles as lead generation for the agency.

---

## 11. Out of scope / future

- **Scrunch connector:** if a customer has Scrunch, read its citation and Signal data and show it in place of the probe estimate. The interface should stay pluggable (`CitationProvider`).
- **Brand voice from the SitecoreAI brand kit** (agreed 2026-10-31: build it only after all other phases are done, deployed and working). Phase 1 reads the brand voice from `BRAND_VOICE_FILE` (`src/lib/brand/brand-voice.ts`). What we found (2026-10-30):
  - **Brand kit ID via the SDK:** `pages.context` → `siteInfo.brandKitId` is typed in `@sitecore-marketplace-sdk/client` 0.4.1, and `Site.brandKitId` is in the xmc Sites API. Not yet seen at runtime.
  - **Brand kit text, not via the SDK:** `@sitecore-marketplace-sdk/ai` (0.1.3) only offers `ai.skills.generateBrandReview`. The text comes from the Brand Management REST API: `GET /api/brands/v1/organizations/{organizationId}/brandkits/{brandkitId}/sections`, then `GET /api/brands/v2/…/sections/{sectionId}/fields` (subsection text in `value`). That API needs a Stream client-credentials token (Admin > AI APIs keys) whose scopes include `ai.org:admin` and brand/document **write**, plus the `organizationId` from the Cloud Portal URL. The Marketplace host doesn't proxy it. That only suits single-organisation deployments.
  - **A possible SDK route:** `xmc.agent.sitesGetSiteDetails(siteId)` returns an undocumented `brand_information: string`. **[SPIKE]** Check what it contains first; if it holds the brand kit text, use it as the voice source.
  - **Brand Review:** after generating, run `ai.skills.generateBrandReview({ brandkitId, input, sections })` on the suggestion and show the 1–5 score and suggestion next to Populate. Needs the `AI` module in the client's `modules` and "AI skills APIs" access; it may use the customer's Sitecore AI allowance.
  - **Fallback order:** brand kit (`brand_information`, or the REST API) → `BRAND_VOICE_FILE` → the neutral default.
- **DNS-AID, Web Bot Auth:** informational only. Revisit if adoption grows.
- **Personalisation variants and non-web channels.**

---

## 12. Open decisions for the user

| # | Decision | Default if not answered |
|---|---|---|
| 1 | Claude model for bulk dashboard scans: `claude-opus-5-5` or `claude-sonnet-5-5` | **Decided 2026-10-31 (Phase 2):** `ANTHROPIC_MODEL_BULK` sets the `ai-check` model (panel and dashboard alike, so both show the same rating), intended for `claude-sonnet-5-5`. `generate-meta` and `citation-forecast` stay on `ANTHROPIC_MODEL` (default `claude-opus-5-5`). |
| 2 | Shared history storage for trends, "What changed" and probes | localStorage only |
| 3 | Optional extra citation engines (Perplexity / Gemini / OpenAI keys) | Claude only |
| 4 | Blok vs custom tokens | **Decided:** Blok (Phase 0 spike), adopted in Phase 5 |
| 5 | Build the public scanner (Phase 11)? | Not now |

---

## 13. Open items

Things left open by a phase. Each phase session reads this list first and picks up the items assigned to it.

| # | Item | Status | Next step |
|---|---|---|---|
| 1 | **The dashboard can't call SitecoreAI APIs.** Every `xmc.*` call from the dashboard widget fails with `[HostSDK] Error processing generic api request: Error: Authentication required but getAccessToken method not provided` (thrown in the host's `_addAuthorizationHeader`). The same app's Page builder panel still makes the same calls with built-in authorization. All SitecoreAI APIs are enabled for the app. The dashboard code hasn't changed since it worked in early June 2026, and the v1 deployment on the old SDK shows the same message. Analysis (`docs/SPIKE-FINDINGS.md` section 7): the error is raised by Sitecore host code the app doesn't ship. No SDK change since June needs app-side handling (`_fetch` is identical in client 0.3.2 and 0.4.1). In June the dashboard host did attach the machine token (Sites gave a 401, GraphQL worked); now it attaches none. The dashboard does get a Context ID (`hasContextId: true`). The dashboard and the panel report the same `host.state` shape (`organizationId`, `xmCloudTenantInfo`, `userInfo`), yet only the panel's requests get a token. | **Sitecore found the root cause (2026-11-02)** and is targeting a production fix for mid-week (about 2026-11-04); they'll confirm once it's deployed. Ticket **CS0746928**, history in `docs/SPIKE-FINDINGS.md` section 7.6. Built-in authorization stays, and the custom-authorization contingency (section 7.4) is shelved. App-side changes are merged: PR #8 (Context ID fix, a clear dashboard message when the host refuses, demo mode with no Sitecore or paid calls on load) and PR #9 (`host.state` and dashboard-block diagnostics). | When Sitecore confirms the deploy, run the checklist in section 7.6: the dashboard lists pages; `retrieveSite` may 401 again as in June, which the GraphQL fallback handles; panel regression; then item 2. Ask Sitecore for the root cause and record it, then close this item. If the fix slips past the Symposium, `?demo=1` is the fallback. Revisit 7.4 only with the user's agreement, and **don't create client credentials on the production app**. Blocks item 2 and Phase 9's bulk writes from the dashboard. |
| 2 | **Phase 3 parity check in Sitecore:** the panel and the dashboard show the same score for the same page (without running PageSpeed in the panel). Since Phase 4 the panel's visible score uses the draft (and P3), so compare the dashboard with the panel's console line `[score] panel (draft): N · live only, as the dashboard scores it: M`. | Blocked by item 1. | Run it once the dashboard loads pages: the dashboard's score should equal M. |
| 3 | **Collapsed FAQ answers are missing from the AI body text.** BrandX's accordion answer panels are `aria-hidden="true"` until opened, and `extractMainText` skips `aria-hidden` elements, so `mainText` (sent to `ai-check` and `generate-meta`) leaves out every collapsed answer. `extractQaPairs` already reads them. | **Done in Phase 4:** `mainText` keeps hidden panels that a toggle controls (`aria-controls`), in live and draft alike. Accordion pages get a new AI cache key once. | — |
| 4 | **The panel's AccordionItem datasource fetch is unused for scoring.** Since Phase 3, Q&A pairs come from the rendered HTML; `usePageFields` still fetches the AccordionItem datasources on every page change. | Kept on purpose. | Phase 9: use it for the FAQ answer rewrites, or remove it. |
| 5 | **Phase 4 acceptance in Sitecore.** The sanitiser and P3 are now tested on real captures of three BrandX pages next to their published HTML (SPIKE-FINDINGS §3.1; fixtures in `src/lib/html/fixtures/`, tests in `sanitise-draft.test.ts` and `brandx-pages.test.ts`). Still not seen in Page Builder: (a) `fieldsUpdated` fires on a heading edit and the score follows without a re-scan; (b) on page change, the 1.5 s wait reads the new page, not the old canvas; (c) an unpublished page scores from its draft; (d) the panel on the Banking article shows the P3 warning for `relatedarticles` and no "Draft differs" banner. | Captures done (2026-11-01). PR #11 merged 2026-11-02. First production run: the draft wasn't read on opening a page (Page Builder answered "[CANVAS BUG] Service implementation is not provided" until its canvas had loaded), but Re-scan read it (SPIKE-FINDINGS §3.2). Fixed with retries in PR #12 (merged 2026-11-02). **Done (2026-11-02):** (a)–(d) passed in Page Builder on production, and opening a page now reads the draft without a Re-scan. | — |
| 6 | **P3 can't tell new unpublished text from client-rendered text.** Both are in the draft and not in the server HTML, so a brand-new component counts as client-only until it's published (the result says so). Edits to existing text are recognised (word overlap). | Accepted for now. | Revisit if authors find it confusing, e.g. by reading the page's publish state, or by holding P3 back while "Draft differs" is showing. |
| 7 | **St. Patrick's Day shows "Draft differs from live" without an obvious edit.** The published page-title component shows "Celebrate St. Patrick's Day with BrandX…", but in the draft that field is an empty `<div>` with no fallback hint (SPIKE-FINDINGS §3.1). Either the field was emptied after publishing (then the banner is right), or the published component falls back to another field without the editor showing a hint (then the banner is a false alarm on such pages). | **Field checked (2026-11-02):** the page's **Page Description** field holds "Celebrate St. Patrick’s Day with BrandX—limited-time offers, festive picks, and a little extra luck.", the same text the published page-title component shows. So the field wasn't emptied after publishing: the draft (\`getPageHTML\`) renders that component's description as an empty element although the field has a value, and the banner is a false alarm on this page. The publish state wasn't checked. | Find out why the page-title component renders the description empty in Page Builder (for example, it reads an empty datasource field in editing mode and falls back to the page's Page Description only when published). Then decide whether the banner should ignore such blocks, e.g. by treating a live block that matches a page field's value as present. Not assigned to a phase yet. |
| 8 | **Phase 5 in Sitecore.** Reviewed only in `?demo=1` so far. Not yet seen in Page Builder: the panel at the real panel width, the tooltips and Select popovers inside the iframe, and the clipboard fallback for Copy snippet and Send to developer. The dashboard can't load pages until item 1 is fixed. | **Panel done (2026-11-02):** every panel check passed in Page Builder on production (plan Phase 5 status), and Phase 6's panel part too (Phase 6 status). **Dashboard open:** blocked by item 1. | Once item 1 is fixed, check the dashboard tabs with real pages: the Site type and Sort dropdowns inside the iframe, Fix first's Send to developer and Review pages, Open in Page Builder, and the one-off rescan from the cache change to v5. Run it with item 2. Phase 6 adds: Agent access and Files with the real scan of the BrandX replica (the Sitecore site's hostname, hztl-page-health-checker-demo.vercel.app), the robots.txt helper starting from the replica's rules, and Scan site re-running the scan. Phase 7 adds: the Read card's "N of M pages not served as Markdown", Markdown once in Fix first, and S3's See fixes and page count, with the replica's real pages. |
| 11 | **Phase 7 in Page Builder.** Reviewed only in `?demo=1` and with the route against the replica. Not yet seen in Page Builder: the Agent View at the panel's width with a real draft, the preview converted from the draft, Copy and Send to developer inside the iframe, and the P5 row on the Score tab while the Markdown requests load. | Open. | Check it on production with the replica: before accept-md is live (Fix, the preview and "about N% fewer tokens", the unsupported accept-when case), and after (4/4 green, the supported case). |
| 12 | **accept-md on the deployed replica** (SPIKE-FINDINGS §8.3). `init` and the `next.config.js` fix are on the replica's `feature/accept-md` branch (PR ksorthiya/hztl-xcelerate-blueprint-copy#4); the user deploys it to production. | Open. | Once it's deployed to production, with the user's OK on the requests: a page serves Markdown 4/4, the right site's page (multisite), a missing page, media still work. The site has no redirects or personalisation configured (user, 2026-11-02), so those stay untested unless a test redirect is added. Record the results in §8.3–8.4; the deployed replica is then item 11's supported case. |
| 9 | **Phase 6: a timed scan with live bot requests.** The BrandX demo site's robots.txt is `User-agent: * / Disallow: /`, so the agent-access scan (correctly) made no request as any bot there: 22 requests in 1.2–3.3 s. The bot × page requests (about 30 of the ~50) have run only against a local test server and the demo fixture, so the 20 s budget hasn't been measured with them on a real site. | **Done (2026-11-02):** the BrandX replica (hztl-page-health-checker-demo.vercel.app), which lets in four of the bots: 34 requests, 12 as bots, in 1.4–3.1 s; after its robots.txt allowed all seven search and user agents, 43 requests, 21 as bots, in 3.1 s. | — |
| 10 | **"View in dashboard" from the panel opens the app's route, not Sitecore's dashboard.** The strip opens `<NEXT_PUBLIC_APP_URL>/dashboard-widget-extension#agent-access` (through `navigateToExternalUrl`). Outside the Sitecore host the dashboard gets no site context, so it can't load the site there. | Open; not checked in Sitecore yet. | In Sitecore (with item 8): see where the link lands. If it can't reach the dashboard widget, either find a Sitecore URL or SDK navigation that opens it, or pass the site domain to the route (e.g. `?domain=`) so Agent access works standalone. |
