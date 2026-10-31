# Page Checks — Technical Reference

A detailed, engineering-oriented breakdown of every page-level check in **Is It Agent-Ready? for SitecoreAI** (the Page Builder context panel): what it inspects, the exact thresholds and scoring math, and where it lives in the codebase.

**Source of truth:** `src/lib/rule-engine/engine.ts` (check definitions), `helpers.ts` (shared utilities), `types.ts` (interfaces), `site-score.ts` (site-level aggregation).

---

## Scoring model

- Each check returns a status of `pass` / `warning` / `fail` and a numeric score `0..max`.
- Page total = sum of enabled check scores = **81 points** across three pillars:
  - **SEO**: 35 pts (6 scored + 1 info-only)
  - **AEO**: 23 pts (4 scored)
  - **Content Quality (GEO)**: 23 pts (5 scored)
- Info-only checks contribute `0` to the total but emit findings/guidance.
- A **gate check** runs before scoring and short-circuits the whole panel if the page is intentionally excluded from indexing.
- The header `ScoreRing` (and every `ScorePill`) is green at ≥ 80%, amber at 60–79% and red below 60%. These thresholds live in `src/lib/score-thresholds.ts` (`READY_PCT`, `ALMOST_PCT`, `labelForPct`) and are shared with the dashboard.

### SEO / AEO / GEO definitions (technical framing)

| Pillar | Optimizes for | Primary consumers | Signal type |
|--------|---------------|-------------------|-------------|
| **SEO** | Crawl + index + SERP rendering | Googlebot, Bingbot | HTML `<head>` metadata, document structure, link graph |
| **AEO** | Featured snippets, voice, answer boxes | Google answer surfaces, voice assistants | Structured data (JSON-LD), Q&A formatting |
| **GEO** | LLM retrieval & citation | ChatGPT, Gemini, Claude, Perplexity, AI Overviews | Content originality, readability, semantic HTML, performance |

---

## Gate check — noindex / nosnippet

**Location:** `engine.ts:33–72`

**Logic:** Before any scoring, evaluate exclusion signals:
1. Sitecore `noindex` field set on the item, **OR**
2. `<meta name="robots">` / `<meta name="googlebot">` containing `noindex`, `nosnippet`, or `max-snippet:0`.

**Behavior:** If triggered, the panel is blocked and surfaces a single message; no checks are scored. Rationale: optimizing a non-indexable page produces misleading scores.

---

## SEO checks (35 pts)

### 1. `seo-meta-title` — Meta Title Length
- **Location:** `engine.ts:79`
- **Inspects:** Character length of the page title field.
- **Scoring (max 8):**
  - `pass` 8 — length ∈ [50, 60]
  - `warning` 5 — length ∈ [30, 49] ∪ [61, 70]
  - `fail` 2 — length < 30 or > 70
- **Rationale:** ~600px SERP truncation budget; titles outside the band are truncated or under-utilized.

### 2. `seo-meta-description` — Meta Description Present + Length
- **Location:** `engine.ts:155`
- **Inspects:** Presence and length of the meta description.
- **Scoring (max 8):**
  - `pass` 8 — length ∈ [120, 160]
  - `warning` 4 — present but outside range
  - `fail` 0 — missing
- **Rationale:** Controls SERP snippet copy; absent → Google auto-generates from body.

### 3. `seo-headings` — H1 Count + Heading Hierarchy
- **Location:** `engine.ts:213`
- **Inspects:** Count of `<h1>` and whether heading levels descend without skips.
- **Scoring (max 6 = 3 + 3):**
  - H1 sub-score (3): exactly one H1 → 3; zero or 2+ → 0–1
  - Hierarchy sub-score (3): no skipped levels (e.g., H2→H4) → 3; skips present → 0
- **Rationale:** Single H1 = unambiguous topic; ordered hierarchy = parseable document outline for crawlers and assistive tech.

### 4. `seo-image-alt` — Image Alt Text Coverage
- **Location:** `engine.ts:289`
- **Inspects:** Ratio of `<img>` elements with non-empty `alt`.
- **Scoring (max 5):** `round((imagesWithAlt / totalImages) * 5)`
  - `pass` 5 — 100% coverage
  - `warning` 1–4 — partial
  - `fail` 0 — none (or no images → treated as full)
- **Rationale:** Image search indexing + WCAG accessibility.

### 5. `seo-canonical` — Canonical Tag
- **Location:** `engine.ts:366`
- **Inspects:** Presence and target of `<link rel="canonical">`.
- **Scoring (max 5):**
  - `pass` 5 — present and self-referencing
  - `warning` 2 — present but points to a different URL
  - `fail` 0 — missing
- **Rationale:** Duplicate-content consolidation; prevents ranking-signal dilution across URL variants.

### 6. `seo-og-tags` — Open Graph Tags
- **Location:** `engine.ts:427`
- **Inspects:** Presence of `og:title`, `og:description`, `og:image`.
- **Scoring (max 3):** score = count of present tags
  - `pass` 3 — all three; `warning` 2 — two of three; `fail` 0–1 — fewer
- **Rationale:** Controls social/link-unfurl preview cards (LinkedIn, Slack, Facebook).

### 7. `seo-anchor-text` — Internal Link Anchor Text Quality *(info-only, 0 pts)*
- **Location:** `engine.ts:473`
- **Inspects:** Internal anchors against a generic-phrase blocklist ("click here", "read more", "learn more", etc.; see `helpers.ts`).
- **Output:** Count and list of generic anchors; no score.
- **Rationale:** Anchor text is a relevance signal; generic anchors waste it.

---

## AEO checks (23 pts)

### 8. `aeo-faq-schema` — FAQPage JSON-LD
- **Location:** `engine.ts:512`
- **Inspects:** FAQ accordion items in content; **generates** a `FAQPage` JSON-LD block ready to paste.
- **Scoring (max 8):** full score when no FAQ items present, otherwise emits generated schema.
- **Rationale:** Eligibility for FAQ rich results and direct answer extraction.

### 9. `aeo-faq-answer-quality` — FAQ Answer Length & Quality
- **Location:** `engine.ts:554`
- **Inspects:** Each FAQ answer for: plain text (no HTML), length ∈ [40, 300] chars, self-contained.
- **Scoring (max 5):** `(qualifyingAnswers / totalAnswers) * 5`
- **Rationale:** Snippet/voice extraction favors concise, standalone answers.

### 10. `aeo-organization-schema` — Organization JSON-LD
- **Location:** `engine.ts:704`
- **Inspects:** Generates a ready-to-paste `Organization` JSON-LD snippet (`buildOrganizationJsonLd` in `helpers.ts`) from `PageData.organization`. That comes from `getOrganizationInfo` (`src/lib/brand/organization.ts`): the `NEXT_PUBLIC_ORG_NAME` / `_URL` / `_LOGO` / `_DESCRIPTION` / `_SAME_AS` env vars, falling back to the site's display name and domain from `pages.context`. A missing name, URL or logo becomes a placeholder; when there's no name the value reads "Not configured". BrandX appears only in the demo fixture.
- **Scoring (max 5):** always full — provides the snippet for the global template.
- **Rationale:** Knowledge-panel eligibility and entity disambiguation.

### 11. `aeo-structured-data` — Rich Results Eligibility (Breadcrumbs)
- **Location:** `engine.ts:732`
- **Inspects:** Derives `BreadcrumbList` JSON-LD from the URL path.
- **Scoring (max 5):** always full — provides generated snippet.
- **Rationale:** Breadcrumb SERP rendering + site-hierarchy signal.

---

## Content Quality / GEO checks (23 pts)

### 12. `cq-uniqueness` — Unique Content Signal
- **Location:** `engine.ts:791`
- **Inspects:** LLM (Claude) classification of body content as `unique` / `borderline` / `commodity`. The body is `ParsedHtml.mainText` from `/api/preview-fetch`: the text of `<main>` (or `<body>` without header, nav and footer), one block per line, entities decoded, capped at 20,000 chars; `/api/ai-check` sends the first 3,000 to Claude. `useScan` calls `ai-check` only after `preview-fetch` returns, and skips it when there's no main text. The browser console (`[scan] ai-check body: …`) and the server log (`[ai-check] … received N chars`) show what was sent. Phase 4 switches the source to the sanitised `getPageHTML` draft.
- **Scoring (max 10):** `unique` → 10 (`pass`), `borderline` → 5 (`warning`), `commodity` → 0 (`fail`).
- **Rationale:** Originality is the dominant GEO/E-E-A-T signal; highest single weight by design.

### 13. `cq-page-experience` — Performance Score
- **Location:** `engine.ts:970`
- **Inspects:** PageSpeed Insights score + Core Web Vitals (external API).
- **Scoring (max 5):**
  - `pass` 5 — PSI ≥ 70
  - `warning` 3 — PSI ∈ [50, 69]
  - `fail` 0 — PSI < 50 or page not crawlable
- **Rationale:** Confirmed ranking factor; UX proxy.

### 14. `cq-agentic-readiness` — Semantic Landmarks
- **Location:** `engine.ts:1052`
- **Inspects:** Presence of HTML5 landmarks `<main>`, `<article>`, `<nav>`, `<header>`; also flags interactive elements missing `aria-label`.
- **Scoring (max 4):** score = count of landmarks present (0–4)
  - `pass` 4 — all four; `warning` 3; `fail` 0–2
- **Rationale:** Agent/assistant DOM navigation; isolates primary content from chrome.

### 15. `cq-reading-grade` — Passage-level Reading Grade
- **Location:** `engine.ts:1122`
- **Inspects:** Automated Readability Index (ARI) per paragraph (paragraphs ≥ 20 words).
  - `ARI = 4.71*(chars/words) + 0.5*(words/sentences) − 21.43`
- **Scoring (max 4):** `(paragraphsAtGrade≤13 / totalParagraphs) * 4`
  - `pass` 4 — all ≤ grade 13; `warning` 3 — ≥75%; `fail` 0–2 — <75%
- **Rationale:** Readability correlates with dwell time and clean LLM summarization/quotation.

---

## Disabled checks (defined, commented out in the orchestrator)

These exist in code but are not currently part of the 81-pt total. Useful to know for roadmap discussions.

| Check ID | Name | Max | Location | Notes |
|----------|------|----:|----------|-------|
| `aeo-howto-schema` | HowTo Schema | 7 | `engine.ts:627–699` | Validates HowTo JSON-LD step `name`/`text` |
| `aeo-question-headings` | Question-format H2s | 0 (info) | `engine.ts:756` | Regex count of interrogative H2s |
| `cq-author` | Author Present + Linked | 6 | `engine.ts:849` | linked → 6 / name only → 3 / missing → 0 |
| `cq-freshness` | Published Date + Freshness | 5 | `engine.ts:901` | ≤365d → 5 / ≤730d → 2 / >730d → 0 |
| `cq-followup-gaps` | Content follow-up gaps | 0 (info) | `engine.ts:1197–1232` | LLM-generated follow-up questions vs. coverage |

---

## Site-level scoring (aggregate, not page-level)

**Location:** `site-score.ts:307–366`. Rolls page-derived HTML signals into 5 site pillars. Listed for completeness — these are separate from the per-page panel.

| Pillar | Max | Inputs |
|--------|----:|--------|
| Crawlability | 15 | AI-crawler permissions, canonical, robots meta |
| Structured | 0–17 | Conditional schema presence (FAQPage, Article, BreadcrumbList, Organization); the max varies per page |
| Answerability | 20 | H1 count, question H2s, reading grade, paragraph length |
| Authority | 28 | AI uniqueness, content depth, freshness, anchor-text quality |
| Retrievability | 20 | Title length, meta description, OG tags, landmarks, image alt coverage |

---

## Meta & social generator

`src/components/MetaGenerator.tsx` → `POST /api/generate-meta` (`{ field, pageTitle, bodyText, currentValue }` → `{ value }`), then `xmc.pages.updateFields` on **Populate field**.

- **Body:** `bodyText` is the same `ParsedHtml.mainText` the uniqueness check uses. **Generate** is disabled while the scan is still reading it. If the scan finishes without text, the panel says so and generation falls back to the title and current values. The prompt tells the model to write from the page content and not copy the current value.
- **Brand voice:** `getBrandVoice()` (`src/lib/brand/brand-voice.ts`, server only) reads the Markdown file named by `BRAND_VOICE_FILE` (relative to the project root, read once per server instance) and the name in `BRAND_NAME`. With neither set, or if the file can't be read, it uses a neutral default voice. `brand/brandx.md` is the BrandX demo voice, and `next.config.ts` (`outputFileTracingIncludes`) bundles `brand/` into the Vercel function.
- **Log:** `[generate-meta] <field>: N chars of body text, brand voice: <source>`.

---

## Server-side fetching (SSRF protection)

Every server route that fetches a caller-supplied URL (`preview-fetch`, `robots-check`, `footer-check`, `citation-forecast`, and `psi-check` for its Google call) uses `safeFetch` from `src/lib/server/safe-fetch.ts`:

- `http`/`https` only; no credentials in the URL.
- Blocks private, loopback, link-local (incl. `169.254.169.254`), CGNAT, multicast, reserved and documentation ranges, IPv4 and IPv6, including IPv4-mapped and NAT64/6to4/Teredo forms. The check runs in the undici Agent's DNS lookup at connect time, so DNS rebinding can't bypass it. IP-literal hosts (including `http://2130706433/`-style encodings) are checked before the request.
- Follows at most 3 redirects (re-checked each hop) and drops the caller's headers, such as the editing token, on a cross-origin hop.
- One timeout across redirects and body; bodies capped at 5 MB by default.
- Blocked input → `SafeFetchError` with `isBadInput`, and the route answers **400** `{ error: "blocked_url" }`. Fetch failures stay **502**, or the route's own fallback.
- `SAFE_FETCH_ALLOW_HOSTS` (comma-separated) skips the address check for named hosts. Use it only for local development.
- Tests: `src/lib/server/safe-fetch.test.ts`.

---

## Key files

| File | Responsibility |
|------|----------------|
| `src/lib/rule-engine/engine.ts` | All check definitions, scoring logic, gate (lines 33–1328) |
| `src/lib/rule-engine/helpers.ts` | ARI, word/char counts, anchor blocklist, shared parsing utils |
| `src/lib/rule-engine/types.ts` | Check/result interfaces and status enums |
| `src/lib/rule-engine/site-score.ts` | Site-level aggregation pillars |
| `src/lib/score-thresholds.ts` | Shared 80 / 60 score thresholds |
| `src/lib/server/extract-html.ts` | Parses fetched HTML into `ParsedHtml`, incl. `mainText` |
| `src/lib/server/safe-fetch.ts` | SSRF-safe fetch for server routes |
| `src/lib/brand/organization.ts`, `brand-voice.ts` | Organization identity and brand voice config |
