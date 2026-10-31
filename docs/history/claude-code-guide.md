# Claude Code guide — SEO/AEO/GEO health checker + site dashboard
## Sitecore Marketplace app on the marketplace-starter boilerplate

> **How to use this guide**  
> Each section is a self-contained prompt block to paste into Claude Code.
> Run them in order. Do not skip a step — later steps assume the file
> structure created by earlier ones. Where you see `[YOUR_VALUE]` replace
> with your own. Estimated total build time: 2–3 days for an experienced
> Sitecore developer working with Claude Code.

---

## Before you start — what Claude Code needs to know

Paste this context block **once** at the start of your Claude Code session.
It primes the model with the full project understanding so every subsequent
prompt is accurate.

```
You are helping me build a Sitecore Marketplace app called "Page SEO/AEO/GEO
Health Checker" on top of the official marketplace-starter boilerplate from
https://github.com/Sitecore/marketplace-starter.

KEY FACTS ABOUT THIS PROJECT:
- Framework: Next.js 15.5.18 (pinned — mandatory security release, see Step 1.2),
  TypeScript, Tailwind CSS
- Extension points being built:
    pages-contextpanel-extension  (context panel in Page Builder — per-page checks)
    dashboard-widget-extension    (site dashboard — all-pages matrix + LLMs.txt)
- Extension points NOT being built (will be deleted):
    custom-field-extension, fullscreen-extension, standalone-extension
- SDK: @sitecore-marketplace-sdk/client and @sitecore-marketplace-sdk/xmc
- Hook pattern: useMarketplaceClient from utils/hooks/useMarketplaceClient.ts
- pages.context  → current page metadata + field subscriptions
- site.context   → site ID, hostname, site name
- application.context → app ID, editing token

We have a pre-built rule engine in three files:
    src/lib/rule-engine/types.ts
    src/lib/rule-engine/helpers.ts
    src/lib/rule-engine/engine.ts

The context panel runs 20 checks across three pillars:
  SEO (35 pts): meta title, meta description, H1/headings, image alt,
                canonical tag, OG tags, anchor text quality (info only)
  AEO (25 pts): FAQ JSON-LD schema, FAQ answer quality, HowTo schema,
                structured data coverage, question H2s (info only)
  Content quality (40 pts): uniqueness (Claude API), author + profile,
                freshness, robots.txt AI crawlers, PageSpeed Insights,
                agentic landmarks, reading grade ARI, follow-up gaps (info only)

The dashboard widget shows:
  Tab 1 — Page matrix: site-wide health scores for all pages, filterable
           by critical/warning/good, with quick scores from authoring fields
  Tab 2 — LLMs.txt generator: auto-generates /llms.txt from healthy pages
           NOTE: LLMs.txt is NOT required for Google AI features (Google's
           official guide explicitly says so). It is an emerging convention
           for non-Google AI systems only. Frame it as a convenience tool.

DATA SOURCES across both extension points:
- Live (XMC subscription): meta fields, author, date, images, links,
  headings, FAQ content, rich text paragraphs
- On demand (preview fetch): canonical, OG tags, JSON-LD, heading DOM,
  semantic landmarks
- On load once (robots.txt): AI crawler permissions, cached per session
- On demand (PSI API): PageSpeed Insights performance score
- On demand (AI/Claude API): uniqueness rating, follow-up gap analysis
- On demand (site-scan API): lightweight page list for dashboard matrix

When creating files, use App Router convention (server components default,
"use client" only when hooks or browser APIs are needed).
All UI uses Tailwind utility classes only — no custom CSS files.
```

---

## Phase 1 — Project cleanup and dependency setup

### Step 1.1 — Remove unused extension points

```
Delete the following folders from the /app directory entirely.
We are building the context panel and dashboard widget only:

  app/custom-field-extension/
  app/fullscreen-extension/
  app/standalone-extension/

Keep these:
  app/pages-contextpanel-extension/   (context panel — will be replaced)
  app/dashboard-widget-extension/     (dashboard widget — will be replaced)
  app/layout.tsx
  app/page.tsx
  app/globals.css

After deletion, confirm the /app folder structure looks clean.
```

### Step 1.2 — Upgrade Next.js to the required security release

```
SECURITY REQUIREMENT: The project must run Next.js 15.5.18 exactly.
This is a mandatory security patch released on May 7, 2026, addressing
13 CVEs including:
  - Four middleware / proxy authorization bypass vulnerabilities (CVSS 7.5–8.1)
    that allow unauthenticated requests to bypass App Router middleware
  - One WebSocket SSRF (CVE-2026-44578, CVSS 8.6) via X-Forwarded-Host
    header injection during WebSocket handshake handling
  - Cache Components denial-of-service via connection exhaustion
  - Cache poisoning and XSS vulnerabilities
  - One upstream React Server Components issue (CVE-2026-23870)

These are not theoretical — all are exploitable at runtime with no
authentication required on self-hosted and Vercel-deployed apps alike.

Run this command to pin the exact version:

  npm install next@15.5.18

After installing, open package.json and confirm the next entry reads:

  "next": "15.5.18"

NOT "^15.5.18" or "~15.5.18" — remove the caret or tilde if present.
An unpinned range could resolve to an older version on a clean install.

Also upgrade the React peer dependencies that bundle the patched
React Server Components package:

  npm install react@latest react-dom@latest

Then verify:

  npx next --version
  // Expected output: 15.5.18

Run a build to catch any regressions before continuing:

  npm run build

If the build fails, check for any deprecated API usage — Next.js 15.5.x
tightened middleware auth behaviour. Integration tests that relied on
prefetch routes bypassing middleware may need updating to reflect the
corrected behaviour.

Do not proceed to Step 1.3 until the build passes cleanly.
```

### Step 1.3 — Install additional dependencies

```
Install the following packages. Explain what each one is for before running
the install command:

  @sitecore-marketplace-sdk/xmc    — XM Cloud API queries (authoring GraphQL,
                                     site context, page context with fields)
  node-html-parser                 — lightweight HTML parser for the preview
                                     fetch API route (server-side only)

Run: npm install @sitecore-marketplace-sdk/xmc node-html-parser

Also confirm the following are already in package.json (they come from the
boilerplate — do not reinstall):
  @sitecore-marketplace-sdk/client
  next    (should now read 15.5.18 from Step 1.2)
  react
  typescript
```

### Step 1.4 — Add environment variables

```
Create a file called .env.local in the project root with these variables.
Add comments explaining what each one does:

  # Anthropic API key — used by /api/ai-check for uniqueness check
  # and follow-up gap analysis (context panel full scan only)
  ANTHROPIC_API_KEY=

  # PageSpeed Insights API key — optional. The PSI API works without
  # a key at low rate limits (~25 req/100s). Add one from Google Cloud
  # Console if you hit quota errors during demos.
  PSI_API_KEY=

  # Base URL of your deployed app — prefixes all /api/ fetch calls
  # when running inside the Sitecore iframe. In local dev this is
  # http://localhost:3000.
  NEXT_PUBLIC_APP_URL=http://localhost:3000

Then verify .gitignore excludes .env.local (it should already from
the boilerplate, but confirm).
```

---

## Phase 2 — Rule engine integration

### Step 2.1 — Copy rule engine files

```
Create the following folder: src/lib/rule-engine/

Then create these three files exactly as specified, copying the content
I provide. Do not modify the logic — only add the files.

File 1: src/lib/rule-engine/types.ts
[PASTE THE FULL CONTENT OF types.ts]

File 2: src/lib/rule-engine/helpers.ts
[PASTE THE FULL CONTENT OF helpers.ts]

File 3: src/lib/rule-engine/engine.ts
[PASTE THE FULL CONTENT OF engine.ts]

After creating the files, create a barrel export:

File 4: src/lib/rule-engine/index.ts
---
export * from "./types";
export * from "./helpers";
export { runGateCheck, runRuleEngine } from "./engine";
export type { EngineConfig } from "./engine";
---

Verify TypeScript compiles without errors: npx tsc --noEmit
```

### Step 2.2 — Export individual check functions

```
Open src/lib/rule-engine/engine.ts.

At the very bottom of the file, add these named exports so the dashboard
widget's quick-score utility can call individual checks without running
the full engine:

export {
  checkMetaTitle,
  checkMetaDescription,
  checkImageAltText,
  checkAnchorText,
  checkFaqAnswerQuality,
  checkQuestionHeadings,
  checkAuthor,
  checkFreshness,
  checkReadingGrade,
};

These are the 9 "live" checks that only require authoring field values
(no preview fetch, no PSI API, no Claude API). They are used by the
dashboard widget to score all pages quickly without slow API calls.

Run npx tsc --noEmit after this change to confirm no type errors.
```

### Step 2.3 — Quick score utility

```
Create file: src/lib/rule-engine/quick-score.ts

This is a pure synchronous utility used by the dashboard widget to
score every page in the site without slow API calls.

Export this type:

  export interface QuickScoreResult {
    total: number;         // 0–61 (sum of the 9 fast checks)
    maxTotal: number;      // always 61
    seo: number;           // 0–21 (meta title 8 + meta desc 8 + image alt 5)
    aeo: number;           // 0–5  (faq answer quality 5)
    contentQuality: number; // 0–15 (author 6 + freshness 5 + reading grade 4)
    label: "critical" | "warning" | "good";
    // critical: total < 25 | warning: 25–45 | good: > 45
  }

Export this function:

  export function quickScore(fields: Partial<AuthoringFields>): QuickScoreResult

Where AuthoringFields is imported from ./types.

Implementation:
- Build a minimal AuthoringFields object filling any missing fields
  with safe zero-values (empty arrays, null, false)
- Call the 9 exported check functions from engine.ts
- Sum their scores into seo, aeo, contentQuality buckets
- Compute total and label
- Return QuickScoreResult

The function must be synchronous. It must not throw — wrap in
try/catch and return a zero-score result on any error.

Also add a helper:

  export function scoreColor(label: QuickScoreResult["label"]): string
  // returns Tailwind text color class:
  // critical → "text-red-600", warning → "text-amber-600", good → "text-green-600"

  export function scoreBgColor(label: QuickScoreResult["label"]): string
  // returns Tailwind bg class for pill badges:
  // critical → "bg-red-50 text-red-700", warning → "bg-amber-50 text-amber-700",
  // good → "bg-green-50 text-green-700"
```

### Step 2.4 — Schema config

```
Create file: src/lib/schema-config.ts

This exports a Record<string, string[]> mapping Sitecore template IDs
to expected Schema.org @type values:

export const SCHEMA_TYPE_CONFIG: Record<string, string[]> = {
  "article-template-id":      ["Article", "BreadcrumbList"],
  "product-template-id":      ["Product", "BreadcrumbList"],
  "howto-template-id":        ["HowTo", "BreadcrumbList"],
  "faq-template-id":          ["FAQPage", "BreadcrumbList"],
  "local-business-template":  ["LocalBusiness", "BreadcrumbList"],
  "event-template-id":        ["Event", "BreadcrumbList"],
  "default":                  ["BreadcrumbList"],
};

Add a comment: "Replace placeholder keys with real Sitecore template GUIDs
from your XM Cloud instance. Find them in Content Editor → Template Manager.
The 'default' key is used for any template not explicitly listed."
```

---

## Phase 3 — Server-side API routes

All six routes live in `/app/api/`. They run server-side only — no SDK,
no browser APIs. Called by both extension point client components via
`fetch()`.

### Step 3.1 — Preview fetch route

```
Create file: app/api/preview-fetch/route.ts

Next.js App Router GET handler. It:
1. Accepts query params: ?url=<encoded page URL> and ?token=<editing token>
2. Fetches the URL server-side with header: x-prerender-revalidate: <token>
3. Parses HTML with node-html-parser
4. Returns JSON matching the ParsedHtml type from the rule engine:

{
  headings: Array<{ level: number; text: string }>,
  canonicalHref: string | null,
  robotsMeta: string | null,
  googlebotMeta: string | null,
  ogTitle: string | null,
  ogDescription: string | null,
  ogImage: string | null,
  jsonLdBlocks: Array<{ type: string; raw: unknown }>,
  hasMain: boolean,
  hasArticle: boolean,
  hasNav: boolean,
  hasHeader: boolean,
  interactiveElementsMissingLabel: number
}

Extraction logic:
- headings: querySelectorAll("h1,h2,h3,h4") → {level, text: innerText.trim()}
- canonicalHref: querySelector('link[rel="canonical"]')?.getAttribute("href")
- robotsMeta/googlebotMeta: querySelector('meta[name="robots"]') etc.
- OG tags: meta[property="og:title"] / og:description / og:image
- jsonLdBlocks: querySelectorAll('script[type="application/ld+json"]')
  → try JSON.parse each → push { type: parsed["@type"], raw: parsed }
- hasMain: querySelector("main") !== null (same pattern for article/nav/header)
- interactiveElementsMissingLabel: count <button> and <a> elements
  that have no innerText.trim() and no aria-label attribute

Error handling:
- Missing url or token → 400 { error: "missing_params" }
- Fetch failure → 502 { error: "preview_fetch_failed" }
- Add CORS header: Access-Control-Allow-Origin: *
- Set fetch timeout: 10 seconds using AbortController
```

### Step 3.2 — Robots.txt check route

```
Create file: app/api/robots-check/route.ts

Next.js App Router GET handler. It:
1. Accepts query param: ?domain=<site domain e.g. https://example.com>
2. Fetches <domain>/robots.txt server-side (5 second timeout)
3. Parses Disallow rules for these user-agents (case-insensitive):
   Google-Extended, GPTBot, ClaudeBot, PerplexityBot, Amazonbot,
   Applebot-Extended
4. Returns JSON matching the RobotsTxt type from the rule engine:

{
  googleExtended: "allowed" | "blocked" | "unknown",
  gptBot: "allowed" | "blocked" | "unknown",
  claudeBot: "allowed" | "blocked" | "unknown",
  perplexityBot: "allowed" | "blocked" | "unknown",
  amazonBot: "allowed" | "blocked" | "unknown",
  appleBotExtended: "allowed" | "blocked" | "unknown"
}

Parsing logic:
- Split by newline, track current user-agent block
- User-agent: * rules → baseline for any unspecified agent
- Disallow: /  after matching agent → "blocked"
- Disallow: (empty) after matching agent → "allowed"
- No Disallow rule found → "unknown"
- If robots.txt returns 404 → all "unknown" (not blocked by default)

Missing domain param → 400.
```

### Step 3.3 — AI check route

```
Create file: app/api/ai-check/route.ts

Next.js App Router POST handler. It:
1. Accepts JSON body: { pageTitle: string, bodyText: string }
2. Calls Anthropic API (ANTHROPIC_API_KEY env var) with two prompts
3. Returns AiResults matching the type from the rule engine

PROMPT 1 — Uniqueness (max_tokens: 300):
System: "You are a content analyst. Respond ONLY with valid JSON, no
markdown, no explanation, no code fences."

User: "Does this web page provide unique value — first-hand experience,
original research, or expert insight beyond common knowledge? Or does it
primarily restate widely available information?

Page title: <pageTitle>
Content (first 3000 chars): <bodyText>

Respond with exactly:
{
  \"rating\": \"unique\" | \"borderline\" | \"commodity\",
  \"explanation\": \"one sentence, max 120 characters\"
}"

PROMPT 2 — Follow-up gaps (max_tokens: 400):
System: same as above.

User: "List the 5 most likely follow-up questions a reader would have
after reading this page. For each, does the page already address it?

Page title: <pageTitle>
Content (first 3000 chars): <bodyText>

Respond with exactly:
{
  \"gaps\": [
    { \"question\": \"...\", \"covered\": true | false },
    { \"question\": \"...\", \"covered\": true | false },
    { \"question\": \"...\", \"covered\": true | false },
    { \"question\": \"...\", \"covered\": true | false },
    { \"question\": \"...\", \"covered\": true | false }
  ]
}"

Model: claude-sonnet-4-20250514
Both prompts run sequentially (not parallel — avoid rate limits).
Strip any ``` fences before JSON.parse.

Return shape:
{
  uniquenessRating: "unique" | "borderline" | "commodity",
  uniquenessExplanation: string,
  followUpGaps: Array<{ question: string, covered: boolean }>
}

ANTHROPIC_API_KEY not set → 500 { error: "api_key_missing" }
JSON parse failure → 500 { error: "parse_error" }
Set timeout: 30 seconds (AI calls are slow).
```

### Step 3.4 — PSI check route

```
Create file: app/api/psi-check/route.ts

Next.js App Router GET handler. It:
1. Accepts query param: ?url=<encoded page URL>
2. Calls PageSpeed Insights API:
   https://www.googleapis.com/pagespeedonline/v5/runPagespeed
   with params: url=<url>&strategy=mobile
   If PSI_API_KEY env var is set, also add &key=<PSI_API_KEY>
3. Returns PsiResult matching the type from the rule engine:

{
  performanceScore: number,  // 0–100, round the raw 0–1 value × 100
  isCrawlable: boolean       // from lighthouseResult.audits["is-crawlable"]
                             // .score === 1, or true if audit absent
}

Set fetch timeout: 15 seconds (PSI is slow).
Missing url param → 400.
PSI API error → 502 { error: "psi_failed", detail: <API error message> }.
```

### Step 3.5 — Site scan route

```
Create file: app/api/site-scan/route.ts

Next.js App Router GET handler. It:
1. Accepts query params:
   ?siteId=<XM Cloud site ID>
   &limit=<max pages, default 100>
2. Uses the XMC package from @sitecore-marketplace-sdk/xmc to query
   all published pages in the site via Sitecore authoring GraphQL API
3. For each page, returns a lightweight summary — NOT the full rule
   engine scan (which is too slow for site-wide use)

Per-page summary shape:
{
  id: string,
  name: string,
  path: string,
  templateId: string,
  lastModified: string,    // ISO date
  fields: {
    pageTitle: string | null,
    metaDescription: string | null,
    author: string | null,
    publishDate: string | null,
    lastUpdatedDate: string | null,
    noIndex: boolean,
    richTextParagraphs: string[],  // for ARI reading grade check
    images: Array<{ componentName: string, alt: string | null }>,
    links: Array<{ componentName: string, anchorText: string | null }>,
    headings: Array<{ level: number, text: string, componentName: string }>,
    faqItems: Array<{ question: string, answer: string }>,
    hasFaqComponent: boolean,
    hasHowToComponent: boolean
  }
}

Return shape:
{
  siteId: string,
  pages: PageSummary[],
  fetchedAt: string         // ISO timestamp
}

IMPORTANT: If the XMC SDK authoring GraphQL requires a service account
token unavailable in the widget context, fall back to querying
site.context and pages.context for the fields that are available.
Add a comment documenting this limitation and the workaround.

Missing siteId param → 400.
XMC query failure → 502 with the original error message.
```

### Step 3.6 — Rescan single page route

```
Create file: app/api/rescan-page/route.ts

Next.js App Router POST handler. It:
1. Accepts JSON body: { pageUrl: string }
2. Calls the preview-fetch logic internally (same extraction as Step 3.1)
   but WITHOUT requiring an editing token — fetches the live published URL
3. Returns the same ParsedHtml shape as the preview-fetch route

This is used by the dashboard widget "Rescan" button to refresh
rendered-output checks (canonical, OG, JSON-LD) for individual pages.

Rate limiting: use a module-level Map<string, number[]> to track
request timestamps per IP. Allow max 10 requests per minute per IP.
Return 429 { error: "rate_limited" } if exceeded.

The dashboard widget calls these with 500ms delay between each page
(not Promise.all) to avoid overwhelming the preview service.
```

---

## Phase 4 — Data hooks (context panel)

### Step 4.1 — Page fields hook

```
Create file: src/hooks/usePageFields.ts
("use client")

React hook. Accepts: client (ClientSDK | null), isInitialized (boolean).

Returns:
{
  fields: Partial<AuthoringFields> | null,
  pageUrl: string,
  siteDomain: string,
  editingToken: string,
  isLoading: boolean
}

Where AuthoringFields is imported from src/lib/rule-engine/types.

On mount (when client and isInitialized are both truthy):

a) Query application.context to get the editing token:
   client.query("application.context").then(res => {
     setEditingToken(res.data?.editingSecret ?? "")
   })

b) Query site.context for the domain:
   client.query("site.context").then(res => {
     setSiteDomain(res.data?.hostName ?? "")
   })

c) Query pages.context for page metadata and subscribe to changes:
   client.query("pages.context").then(res => { updateFields(res.data) })
   client.subscribe("pages.context", res => { updateFields(res.data) })

The updateFields function maps the pages.context response to
AuthoringFields. Key field mappings:
  pageTitle        ← res.data.page?.fields?.["Page Title"]?.value
                     OR res.data.page?.name
  metaDescription  ← res.data.page?.fields?.["MetaDescription"]?.value
  ogTitle          ← res.data.page?.fields?.["OGTitle"]?.value
  ogDescription    ← res.data.page?.fields?.["OGDescription"]?.value
  ogImage          ← res.data.page?.fields?.["OGImage"]?.value?.src
  author           ← res.data.page?.fields?.["Author"]?.value
  publishDate      ← new Date(res.data.page?.fields?.["PublishDate"]?.value)
  lastUpdatedDate  ← new Date(res.data.page?.fields?.["LastUpdated"]?.value)
  noIndexField     ← res.data.page?.fields?.["NoIndex"]?.value === "1"
  pageUrl          ← build from siteDomain + res.data.page?.path

Fields not available from pages.context (leave as empty/defaults):
  richTextParagraphs: [],  // TODO: Phase 8.1
  richTextFull: "",
  images: [],              // TODO: Phase 8.1
  links: [],               // TODO: Phase 8.1
  headings: [],            // TODO: Phase 8.1
  faqItems: [],
  hasFaqComponent: false,  // TODO: Phase 8.3
  hasHowToComponent: false,// TODO: Phase 8.3
  authorProfileLinked: false // TODO: Phase 8.2

Clean up the subscription in the useEffect return function.
```

### Step 4.2 — Scan orchestrator hook

```
Create file: src/hooks/useScan.ts
("use client")

React hook. Orchestrates the on-demand API calls (preview fetch, PSI, AI).

Accepts:
{
  pageUrl: string,
  siteDomain: string,
  editingToken: string,
  bodyText: string,
  pageTitle: string
}

Returns:
{
  parsedHtml: ParsedHtml | null,
  robotsTxt: RobotsTxt | null,
  psi: PsiResult | null,
  ai: AiResults | null,
  isScanning: boolean,
  lastScannedAt: Date | null,
  error: string | null,
  runScan: () => void
}

All types imported from src/lib/rule-engine/types.

The runScan() function uses Promise.allSettled to run all four fetches
in parallel. Each fetch result independently updates its state slice —
one failure does not block the others:

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  Promise.allSettled([
    fetch(`${base}/api/preview-fetch?url=${encodeURIComponent(pageUrl)}
           &token=${encodeURIComponent(editingToken)}`),
    fetch(`${base}/api/robots-check?domain=${encodeURIComponent(siteDomain)}`),
    fetch(`${base}/api/psi-check?url=${encodeURIComponent(pageUrl)}`),
    fetch(`${base}/api/ai-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageTitle, bodyText })
    })
  ]).then(([htmlRes, robotsRes, psiRes, aiRes]) => {
    if (htmlRes.status === "fulfilled")   setParsedHtml(await htmlRes.value.json())
    if (robotsRes.status === "fulfilled") setRobotsTxt(await robotsRes.value.json())
    if (psiRes.status === "fulfilled")    setPsi(await psiRes.value.json())
    if (aiRes.status === "fulfilled")     setAi(await aiRes.value.json())
  })

On first mount: automatically fetch robots.txt once (site-level check).
Store in a ref so it persists across page navigations without re-fetching.
```

---

## Phase 5 — UI components (context panel)

### Step 5.1 — Score ring

```
Create file: src/components/ScoreRing.tsx
("use client")

Props: score: number, maxScore: number, size?: number (default 56)

SVG circular progress ring. Technique:
  r = (size / 2) - 5
  circumference = 2 * Math.PI * r
  dashoffset = circumference * (1 - score / maxScore)
  Arc starts from top: transform="rotate(-90 [cx] [cy])"

Background circle: stroke #e5e7eb (light) / #374151 (dark) via CSS var
Foreground arc: colour by score percentage:
  < 40% → var(--color-text-danger)
  40–79% → amber (#d97706)
  ≥ 80% → var(--color-text-success)

Score number centred: Math.round(score), 13px, font-weight 500.
```

### Step 5.2 — Rule result row

```
Create file: src/components/RuleRow.tsx
("use client")

Props: result: RuleResult (from src/lib/rule-engine/types)

Single check row. Layout:
- Left coloured dot (4px × 4px pill):
  pass → green, warning → amber, fail → red, info → grey
- Check name (text-sm font-medium text-foreground)
- Score badge right-aligned:
  scored: "8 / 8" in a coloured pill matching status
  info-only (maxScore === 0): grey "info" pill
- Chevron icon, rotates 180° when row is expanded

On click, smoothly expand (max-height transition, overflow hidden) to show:
- message (text-sm text-muted-foreground, margin-top 6px)
- fixSuggestion if non-empty: "→ " prefix, text-sm text-blue-600
- details as <ul> if non-empty: text-xs text-muted-foreground,
  list-disc pl-4, each item on its own line
```

### Step 5.3 — Pillar section

```
Create file: src/components/PillarSection.tsx
("use client")

Props:
  pillar: "seo" | "aeo" | "content-quality"
  results: RuleResult[]
  score: number
  maxScore: number

Header row:
- Coloured dot: SEO #1D9E75, AEO #534AB7, content-quality #993C1D
- Pillar label: "SEO" / "AEO" / "Content quality"
- Thin score bar (h-1) same colour, proportional width
- Score fraction "28 / 35" right-aligned, text-xs muted

Body:
- Scored results: all results where maxScore > 0, as <RuleRow> list
- Divider + muted label "Insights — no score impact"
- Info-only results: all results where maxScore === 0, as <RuleRow> list
  (show only if there are any info-only results)
```

### Step 5.4 — Gate banner

```
Create file: src/components/GateBanner.tsx

Props: reason: string

Full-width red alert card. No client-side JS needed (pure display).
  bg-red-50 border border-red-200 rounded-lg p-4

Content:
- SVG shield-with-x icon (inline, 20px, text-red-500)
- Title: "Page excluded from AI features" (text-sm font-medium text-red-800)
- Reason text: the reason prop (text-sm text-red-700 mt-1)
- Footer note: "Fix this first — all other checks are suspended until
  this page is indexable and snippet-eligible."
  (text-xs text-red-600 mt-2)

This component replaces the entire pillar list when gate.blocked is true.
```

### Step 5.5 — Scan bar

```
Create file: src/components/ScanBar.tsx
("use client")

Props: isScanning: boolean, lastScannedAt: Date | null, onScan: () => void

Sticky bottom bar. Layout: left meta text, right button.

Left text updates every 30 seconds via setInterval:
  null → "Not yet scanned"
  Date → "Scanned X mins ago" (use Math.floor((now - date) / 60000))

Right button:
  isScanning: spinner icon + "Scanning…", disabled, cursor-not-allowed
  idle: play icon + "Run full scan"
  Style: text-xs, compact padding, secondary variant
```

---

## Phase 6 — Main context panel page

### Step 6.1 — Replace the boilerplate context panel

```
Replace: app/pages-contextpanel-extension/page.tsx
("use client")

This is the root component. Uses:
  useMarketplaceClient (from utils/hooks/useMarketplaceClient.ts — do not modify)
  usePageFields  (Phase 4.1)
  useScan        (Phase 4.2)
  runRuleEngine  (from src/lib/rule-engine)
  SCHEMA_TYPE_CONFIG (from src/lib/schema-config.ts)

State assembly with useMemo:

  const pageData: PageData = useMemo(() => ({
    pageUrl: fields?.pageUrl ?? "",
    authoring: {
      pageTitle:           fields?.fields?.pageTitle ?? null,
      metaDescription:     fields?.fields?.metaDescription ?? null,
      ogTitle:             fields?.fields?.ogTitle ?? null,
      ogDescription:       fields?.fields?.ogDescription ?? null,
      ogImage:             fields?.fields?.ogImage ?? null,
      author:              fields?.fields?.author ?? null,
      authorProfileLinked: false,
      publishDate:         fields?.fields?.publishDate ?? null,
      lastUpdatedDate:     fields?.fields?.lastUpdatedDate ?? null,
      noIndexField:        fields?.fields?.noIndexField ?? false,
      richTextParagraphs:  [],
      richTextFull:        "",
      images:              [],
      links:               [],
      headings:            [],
      faqItems:            [],
      hasFaqComponent:     false,
      hasHowToComponent:   false,
    },
    parsedHtml:  scanData.parsedHtml,
    robotsTxt:   scanData.robotsTxt,
    psi:         scanData.psi,
    ai:          scanData.ai,
  }), [fields, scanData]);

  const engineOutput = useMemo(
    () => runRuleEngine(pageData, {
      expectedSchemaTypes: SCHEMA_TYPE_CONFIG,
      currentTemplateId: "default",
    }),
    [pageData]
  );

  const seoResults     = engineOutput.results.filter(r => r.pillar === "seo");
  const aeoResults     = engineOutput.results.filter(r => r.pillar === "aeo");
  const cqResults      = engineOutput.results.filter(r => r.pillar === "content-quality");

Layout (full iframe height, flex column, overflow-y scroll on middle):

┌─────────────────────────────┐
│  Header: "Page health"      │  44px, fixed
│  Live dot · total score     │
├─────────────────────────────┤
│  (gate blocked)             │
│    <GateBanner reason={...}>│
│  (not blocked)              │
│    3-pillar mini score bars │  — compact row above the check lists
│    <PillarSection seo  ...> │
│    <PillarSection aeo  ...> │
│    <PillarSection cq   ...> │  scrollable
├─────────────────────────────┤
│  <ScanBar ...>              │  fixed bottom
└─────────────────────────────┘

Loading state: when isInitialized is false, show 5 grey skeleton rows
(no error — SDK requires Sitecore context and won't init in localhost).

Development fixture: if process.env.NODE_ENV === "development" and
!isInitialized, import and use makeTestPageData() from
src/lib/rule-engine/test-fixture.ts so the UI shows realistic data at
localhost:3000/pages-contextpanel-extension.
```

---

## Phase 7 — Dashboard widget: UI components

### Step 7.1 — Page matrix row type

```
Create file: src/types/dashboard.ts

Export these types used across the dashboard widget:

  import type { QuickScoreResult } from "../lib/rule-engine/quick-score";

  export interface PageSummaryFields {
    pageTitle: string | null;
    metaDescription: string | null;
    author: string | null;
    publishDate: string | null;
    lastUpdatedDate: string | null;
    noIndex: boolean;
    richTextParagraphs: string[];
    images: Array<{ componentName: string; alt: string | null }>;
    links: Array<{ componentName: string; anchorText: string | null; href: string | null }>;
    headings: Array<{ level: number; text: string; componentName: string }>;
    faqItems: Array<{ question: string; answer: string }>;
    hasFaqComponent: boolean;
    hasHowToComponent: boolean;
  }

  export interface PageMatrixRow {
    id: string;
    name: string;
    path: string;
    templateId: string;
    lastModified: string;
    score: QuickScoreResult;
    fields: PageSummaryFields;
  }

  export type MatrixFilter = "critical" | "warning" | "good" | "all";
  export type MatrixSort   = "score-asc" | "score-desc" | "modified" | "name";
```

### Step 7.2 — Score pill component

```
Create file: src/components/ScorePill.tsx

Props: score: number, max: number, size?: "sm" | "md" (default "sm")

A coloured pill badge showing the score. No interactivity needed.
  Percentage: score / max
  < 40% → red pill (bg-red-50 text-red-700)
  40–79% → amber pill
  ≥ 80% → green pill
  max === 0 → grey "n/a" pill

Show: Math.round(score) (not as a fraction — space is tight in the matrix).
If max === 0 show "n/a" text instead of a number.
```

### Step 7.3 — Matrix view component

```
Create file: src/components/MatrixView.tsx
("use client")

Props:
  pages: PageMatrixRow[]         — already filtered + sorted by parent
  allPages: PageMatrixRow[]      — full unfiltered list (for metric cards)
  filter: MatrixFilter
  sortBy: MatrixSort
  isLoading: boolean
  siteDomain: string
  onFilterChange: (f: MatrixFilter) => void
  onSortChange: (s: MatrixSort) => void
  onRescanPage: (row: PageMatrixRow) => void

METRIC CARDS ROW (4 cards, grid):
  Total pages | Critical (red) | Warning (amber) | Good (green)
  Values from allPages, not filtered pages.

FILTER BAR:
  Filter pills: "Critical" / "Warning" / "Good" / "All pages"
  Active pill uses filled background of the relevant colour.
  Sort select: "Score ↑" / "Score ↓" / "Last modified" / "Name"

TABLE:
  Columns: Page | SEO | AEO | CQ | Total | Action
  Column widths: 36% | 10% | 10% | 10% | 24% | 10%

  Page cell: page name (text-sm font-medium) + path (text-xs font-mono muted)
  SEO/AEO/CQ cells: <ScorePill score={row.score.seo} max={21} /> etc.
  Total cell: thin progress bar (h-1.5) + score number after it
    Bar colour: critical=red, warning=amber, good=green
  Action cell: "Open" text button — emits an event for the parent to
    call client.navigate({ page: { path: row.path } }) or copies path

EMPTY STATE: "No pages match the current filter."
LOADING STATE: 8 skeleton rows (grey pulse animation via Tailwind animate-pulse)
ERROR STATE: passed as a prop string, shown as amber alert above the table.

Show page count in footer: "Showing X of Y pages · Scores from quick check"
"Quick check" links to a tooltip: "Quick scores use authoring field checks
only (no preview fetch or AI calls). Run a full scan in the Page Builder
context panel for a complete score on any page."
```

### Step 7.4 — LLMs.txt generator component

```
Create file: src/components/LlmsTxtGenerator.tsx
("use client")

Props:
  pages: PageMatrixRow[]
  siteDomain: string
  siteName: string

DISCLAIMER BANNER (amber, non-dismissable):
  Icon: warning triangle
  Title: "Not required for Google AI features"
  Body: "Google's official AI optimisation guide explicitly states that
  LLMs.txt files have no effect on AI Overviews or AI Mode. This file
  is an emerging convention for non-Google AI systems (Perplexity,
  Claude browsing, open-source agents). Treat it as a low-effort
  courtesy — not an SEO priority."

CONFIGURATION CONTROLS:
  1. Score threshold slider: 0–100, default 60, step 5
     Label: "Include pages with score ≥ [value]"
  2. Section toggles (checkboxes, all default true):
     "Blog posts"  — paths matching /blog/
     "Product / solutions pages" — paths matching /products/ or /solutions/
     "Utility pages" — all other pages
     Note: paths matching /contact, /privacy, /terms, /404, /sitemap
     are EXCLUDED by default (uncheck the utility pages toggle to hide them)
  3. Include meta description as summary: toggle, default true

CONTENT GENERATION (useMemo, reactive):
  Filter pages by: score.total >= threshold AND section toggle enabled
  Sort by score desc (highest quality first)

  Group into sections:
    path.startsWith("/blog") → "Blog"
    path.startsWith("/products") || "/solutions" → "Products"
    everything else → "Core pages"

  Generated text format:
  ---
  # LLMs.txt — generated by Sitecore Marketplace Health Checker
  # Site: [siteDomain] | Generated: [today ISO date]

  # [siteName]
  > [site meta description or "Digital experience platform"]

  ## Core pages
  - [Page name]([siteDomain][path]): [metaDescription or pageTitle]

  ## Blog
  - [Post name]([siteDomain][path]): [metaDescription]

  ## Products
  - [Product name]([siteDomain][path]): [metaDescription]

  # [N] pages excluded (score < [threshold] or section disabled)
  # Regenerate after improving page health scores
  ---

PREVIEW:
  <pre> block, font-mono, text-xs, max-height 280px, overflow-y auto,
  bg-gray-50 rounded border, p-3

ACTIONS ROW:
  "Regenerate" button — triggers re-render (scores already reactive,
    just shows a brief "Regenerated" flash feedback for 1.5 seconds)
  "Download .txt" — Blob download with filename "llms.txt":
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="llms.txt";
    a.click(); URL.revokeObjectURL(url);
  "Copy" — navigator.clipboard.writeText(content), shows "Copied ✓" for 2s

DEPLOYMENT NOTE (muted, below buttons):
  "Deploy to your site root as /llms.txt. In a headless XM Cloud setup,
  add it as a static file in your head application's /public folder, or
  configure your CDN to serve it from the root path."
```

---

## Phase 8 — Dashboard widget: main page

### Step 8.1 — Dashboard widget hook

```
Create file: src/hooks/useSitePages.ts
("use client")

React hook that fetches and scores all site pages for the matrix.

Accepts: client (ClientSDK | null), isInitialized (boolean)

Returns:
{
  pages: PageMatrixRow[],
  siteContext: { id: string, domain: string, name: string },
  isLoading: boolean,
  error: string | null,
  refresh: () => void
}

On mount:
1. Query site.context:
   client.query("site.context").then(res => {
     setSiteContext({
       id: res.data?.id ?? "",
       domain: res.data?.hostName ?? "",
       name: res.data?.name ?? ""
     })
   })

2. Fetch page list from /api/site-scan:
   const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
   const res = await fetch(`${base}/api/site-scan?siteId=${siteId}`)
   const data = await res.json()

3. For each page in data.pages, run quickScore(page.fields) to get
   the QuickScoreResult, then combine into a PageMatrixRow

4. Sort by score.total ascending (worst pages first) as the default view

Error handling:
  Fetch failure → setError("Could not load pages. Check site context.")
  Parse failure → setError("Invalid response from site scan API.")
  Empty pages array → show in UI but do not set error state

The refresh() function re-runs steps 2–4 and updates state.
```

### Step 8.2 — Replace the boilerplate dashboard widget page

```
Replace: app/dashboard-widget-extension/page.tsx
("use client")

Uses:
  useMarketplaceClient (from utils/hooks/useMarketplaceClient.ts)
  useSitePages (Phase 8.1)
  MatrixView (Phase 7.3)
  LlmsTxtGenerator (Phase 7.4)

State:
  activeTab: "matrix" | "llms", default "matrix"
  filter: MatrixFilter, default "critical"
  sortBy: MatrixSort, default "score-asc"

Filtered + sorted pages (useMemo):
  if filter === "critical" → pages with score.label === "critical"
  if filter === "warning"  → pages with score.label === "warning"
  if filter === "good"     → pages with score.label === "good"
  if filter === "all"      → all pages

  then sort:
    "score-asc"  → score.total ascending
    "score-desc" → score.total descending
    "modified"   → new Date(lastModified) descending
    "name"       → name.localeCompare ascending

Rescan handler (passed to MatrixView):
  async function handleRescan(row: PageMatrixRow) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const res = await fetch(`${base}/api/rescan-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageUrl: siteContext.domain + row.path })
    });
    // update that row's parsedHtml in state
    // then re-run quickScore with merged data (not yet: parsedHtml
    // fields aren't part of quick-score — just show a "rescanned" badge)
  }

Layout (full widget height, flex column):

┌────────────────────────────────────┐
│  Header: "Site content health"     │  44px
│  Tab bar: Page matrix | LLMs.txt   │
├────────────────────────────────────┤
│  (matrix tab)                      │
│    <MatrixView .../>               │  scrollable
│  (llms tab)                        │
│    <LlmsTxtGenerator .../>         │  scrollable
└────────────────────────────────────┘

Loading state: skeleton metric cards + 8 skeleton table rows.
Error state: amber alert with siteContext.error message + "Retry" button.
Not-initialised state: same skeleton (SDK requires Sitecore context).
```

---

## Phase 9 — Configuration and wiring

### Step 9.1 — Update Next.js config

```
Open next.config.ts and apply these changes:

1. CORS headers for all API routes (needed for iframe context):

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  }

2. node-html-parser is a Node.js module used in server routes only.
   Add it to serverExternalPackages to prevent bundling issues:

  experimental: {
    serverComponentsExternalPackages: ["node-html-parser"],
  }

Show the full updated next.config.ts after changes.
```

### Step 9.2 — TypeScript path aliases

```
Open tsconfig.json and add:

"paths": {
  "@/lib/*":        ["./src/lib/*"],
  "@/hooks/*":      ["./src/hooks/*"],
  "@/components/*": ["./src/components/*"],
  "@/types/*":      ["./src/types/*"]
}

Then update ALL import statements in files we created to use these
aliases. Examples:
  import { runRuleEngine } from "@/lib/rule-engine"
  import { usePageFields }  from "@/hooks/usePageFields"
  import { ScoreRing }      from "@/components/ScoreRing"
  import type { PageMatrixRow } from "@/types/dashboard"

Run npx tsc --noEmit after this change.
```

### Step 9.3 — Register both extension points in Cloud Portal

These steps are manual — Claude Code cannot access the Cloud Portal.

```
MANUAL STEPS — do these in a browser.

1. Deploy to Vercel:
   a. Push repo to GitHub
   b. Connect to Vercel → import repo → set environment variables:
        ANTHROPIC_API_KEY = <your key>
        PSI_API_KEY       = <optional>
        NEXT_PUBLIC_APP_URL = <your Vercel production URL>
   c. Deploy. Note the production URL.

2. In Sitecore Cloud Portal (portal.sitecorecloud.io):
   a. Developer Studio → Marketplace Apps → Create app
   b. App name: "Page SEO/AEO/GEO Health Checker"
   c. App URL: https://your-app.vercel.app
   d. Add TWO extension points:

      Extension point 1:
        Type: Pages Context Panel
        Route: /pages-contextpanel-extension

      Extension point 2:
        Type: Dashboard Widget
        Route: /dashboard-widget-extension

   e. Save → get the App ID

3. Install in your XM Cloud organisation:
   Cloud Portal → Marketplace → Installed apps → Install → select your app

4. Verify:
   - Open XM Cloud Pages → context panel should appear on the right
   - Open XM Cloud Dashboard → widget should appear in the widgets area
```

---

## Phase 10 — Incremental feature completion

Run these after the base app is working in Sitecore.

### Step 10.1 — Authoring GraphQL: rich text + headings + images

```
Update src/hooks/usePageFields.ts.

Add a second query after the pages.context query to fetch component
tree data via the XMC authoring GraphQL API. This populates the fields
left as empty arrays in Phase 4.1.

Use the XmcClient or relevant class from @sitecore-marketplace-sdk/xmc.

The query should fetch for the current page item:
  - All RichText component fields → split on </p> to get paragraphs,
    strip HTML tags using the stripHtml helper from the rule engine,
    update richTextParagraphs and richTextFull
  - All Heading component fields → heading level and text values
  - All Image component fields → componentName and alt text
  - All General Link component fields → componentName and anchor text

Map results into AuthoringFields and update state.

If the XMC SDK requires an org-level auth token unavailable in the
context panel, add a comment documenting this limitation. As a fallback,
parse whatever field data is available from the pages.context response
(which includes rendered field values for the current page).
```

### Step 10.2 — Author profile link detection

```
Update src/hooks/usePageFields.ts.

After getting the author field value, check whether an author profile
item is linked:
  - If the author field contains a "/" character (suggesting a Sitecore
    path) or looks like a GUID, set authorProfileLinked: true
  - Otherwise check if the site has an /authors/ section by querying
    the site's page tree — if a page exists whose name matches the
    author value, set authorProfileLinked: true
  - If neither heuristic matches, leave as false

Document this as a heuristic and note that full implementation requires
the XMC authoring GraphQL API to query the linked item field directly.
```

### Step 10.3 — Component presence detection

```
Update src/hooks/usePageFields.ts.

From the pages.context response, check the page's component/rendering
list for FAQ and HowTo indicators:

  Set hasFaqComponent: true if any component name (case-insensitive) 
  contains "faq" or "accordion"

  Set hasHowToComponent: true if any component name contains
  "howto", "steps", "steplist", or "procedure"

Add a console.log of all component names so developers can identify
the exact names in their XM Cloud implementation and adjust matching.
```

### Step 10.4 — Demo cache for AI checks

```
Update src/hooks/useScan.ts.

Add localStorage caching for the AI check results to avoid rate limits
and slow responses during live demos:

  const cacheKey = `ai-check:${pageUrl}`;
  
  // Before calling the API:
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Only use cache if less than 24 hours old
      if (Date.now() - parsed.cachedAt < 86400000) {
        setAi(parsed.data);
        return;
      }
    } catch { /* ignore parse errors */ }
  }

  // After successful API call:
  localStorage.setItem(cacheKey, JSON.stringify({
    data: aiResult,
    cachedAt: Date.now()
  }));

Add a "Clear AI cache" button in the scan bar (visible in dev mode only)
that calls localStorage.clear() and re-runs the scan.
```

---

## Phase 11 — Testing and pre-flight

### Step 11.1 — Test fixture

```
Create file: src/lib/rule-engine/test-fixture.ts

Export makeTestPageData() returning a complete PageData with realistic
values that makes the context panel UI interesting during local dev:

  - Pass roughly 12 checks, warn on 5, fail on 3
  - uniquenessRating: "borderline" (shows the warning path)
  - performanceScore: 62 (warning — shows amber PSI badge)
  - One AI crawler blocked: gptBot: "blocked"
  - parsedHtml: fully populated (all checks that need preview can run)
  - Author set but authorProfileLinked: false (shows warning state)
  - publishDate: 400 days ago (shows freshness warning)
  - One image missing alt text

Also export makeTestSitePages(): PageMatrixRow[] with 12 pages:
  - 3 critical (score < 25)
  - 5 warning (score 25–45)
  - 4 good (score > 45)
  - One page with noIndex: true (shows gate banner if opened in panel)
  - Mix of /blog/, /solutions/, and root-level paths for LLMs.txt grouping

Use both fixtures in development mode:
  - Context panel: if !isInitialized → use makeTestPageData()
  - Dashboard widget: if !isInitialized → use makeTestSitePages()
```

### Step 11.2 — Build verification

```
Run the following in sequence. Fix all errors before moving on.
Do not use @ts-ignore, as any, or type assertions to suppress errors.

1. TypeScript check:
   npx tsc --noEmit
   Expected: 0 errors.

2. Production build:
   npm run build
   Expected: all routes compiled, no build errors.
   Note any "Large page data" warnings — these are okay.

3. Lint:
   npm run lint
   Fix all warnings. The boilerplate ESLint config is strict.

4. Local preview of context panel:
   npm run dev
   Open http://localhost:3000/pages-contextpanel-extension
   Expected: test fixture data rendered, all 20 check rows visible,
   pillar scores visible, scan bar at bottom.

5. Local preview of dashboard widget:
   Open http://localhost:3000/dashboard-widget-extension
   Expected: test site pages rendered in matrix, filter/sort works,
   LLMs.txt tab shows generated file content, download button works.

Show me the output of each command and the fixes applied.
```

---

## Final file tree after all phases

```
your-repo/
├── app/
│   ├── api/
│   │   ├── ai-check/route.ts
│   │   ├── preview-fetch/route.ts
│   │   ├── psi-check/route.ts
│   │   ├── rescan-page/route.ts
│   │   ├── robots-check/route.ts
│   │   └── site-scan/route.ts
│   ├── dashboard-widget-extension/
│   │   └── page.tsx              ← replaced
│   ├── pages-contextpanel-extension/
│   │   └── page.tsx              ← replaced
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── src/
│   ├── components/
│   │   ├── GateBanner.tsx
│   │   ├── LlmsTxtGenerator.tsx
│   │   ├── MatrixView.tsx
│   │   ├── PillarSection.tsx
│   │   ├── RuleRow.tsx
│   │   ├── ScanBar.tsx
│   │   ├── ScorePill.tsx
│   │   └── ScoreRing.tsx
│   ├── hooks/
│   │   ├── usePageFields.ts
│   │   ├── useScan.ts
│   │   └── useSitePages.ts
│   ├── lib/
│   │   ├── rule-engine/
│   │   │   ├── engine.ts
│   │   │   ├── helpers.ts
│   │   │   ├── index.ts
│   │   │   ├── quick-score.ts
│   │   │   ├── test-fixture.ts
│   │   │   └── types.ts
│   │   └── schema-config.ts
│   └── types/
│       └── dashboard.ts
├── utils/
│   └── hooks/
│       └── useMarketplaceClient.ts   ← from boilerplate, do not modify
├── .env.local
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

### SDK not initialising in local browser

Expected. The Marketplace SDK uses `window.parent.postMessage` and only
works inside the Sitecore iframe. Use the test fixture from Phase 11.1
for all local development. The fixture kicks in automatically when
`isInitialized` is false in development mode.

### API routes returning 404 in the iframe

API calls from inside the Sitecore iframe must use the full deployed URL,
not a relative path. Always prefix with `NEXT_PUBLIC_APP_URL`:

```ts
const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
fetch(`${base}/api/preview-fetch?url=...`)
```

### Dashboard widget shows "Could not load pages"

The site-scan route uses the XMC authoring GraphQL API which may require
a service account token. If `site.context` returns a valid siteId but
the scan fails, check the browser Network tab for the specific API error.
The most common cause is a missing or expired XM Cloud auth token.

### Preview fetch returns empty JSON-LD

XM Cloud Pages preview renders differently from production. JSON-LD
injected by JSS renderings may be absent in preview HTML. Check the
raw response in Network tab. If JSON-LD is consistently absent, the
schema checks will show as "not yet scanned" — this is expected and
the checks will pass once the page is published and crawlable.

### LLMs.txt generates no pages

Check the score threshold slider — if set above 60, pages with lower
quick scores (which only run 9 of 20 checks) will be excluded. Lower
the threshold to 40 to see more pages, or run full scans in the context
panel to boost individual page scores.

### Claude API rate limits during demos

Pre-run AI checks on demo pages before your presentation. The demo cache
(Phase 10.4) stores results in localStorage for 24 hours. Alternatively,
use the test fixture which includes pre-populated AI results.

### Vercel deployment fails with Next.js version mismatch

If Vercel resolves a different Next.js version than `15.5.18` during
deployment, it means `package.json` has a range specifier (`^` or `~`)
rather than an exact pin. Fix this:

```json
// package.json — must be exact, no caret or tilde
"dependencies": {
  "next": "15.5.18"
}
```

Then commit `package-lock.json` to your repo. Vercel uses the lockfile
when it is present, so a committed lockfile with the exact version
resolved is the safest guarantee. If you use Vercel's dependency
override settings, you can also pin it there — but the lockfile approach
is cleaner and portable across all deployment targets.

---

*Generated for SUGCON India 2026 — "Vibe-Coding Sitecore" session*
