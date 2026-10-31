# Page Matrix — Technical Reference

Engineering-oriented breakdown of the **Page Matrix** scoring: the 5 pillars, every signal that feeds each pillar, exact thresholds and point math, dynamic max handling, and the rating bands. This is a **separate scoring model** from the per-page rule-engine panel (see `PAGE-CHECKS-TECHNICAL.md`) — different weights, different aggregation.

**Source of truth:**
- `src/lib/rule-engine/site-score.ts` — pillar scoring functions, `MAX_PILLARS`, labeling
- `src/components/MatrixView.tsx` — Page Matrix table UI
- `src/components/CategoryCards.tsx` — aggregated category cards + descriptions
- `src/lib/rule-engine/helpers.ts` — ARI, word count, question regex, anchor blocklist
- `src/types/dashboard.ts` — `PageMatrixRow`, `MatrixFilter`

---

## Scoring model overview

Each page produces a `SiteScoreResult`:
- `total` — sum of earned points across all 5 pillars
- `maxTotal` — sum of max points per pillar (**dynamic**, because the Structured pillar's max varies by page type)
- `pillars` — earned score per category
- `maxPillars` — max available per category for this page
- `label` — `critical` / `warning` / `good`

**Percentage** = `(total / maxTotal) × 100`.

### Rating bands — `labelForPct`, `src/lib/score-thresholds.ts`

| Label | Range | Text class | Badge class |
|-------|-------|-----------|-------------|
| `good` | ≥ 80% | `text-green-600` | `bg-green-50 text-green-700` |
| `warning` | 60–79% | `text-amber-600` | `bg-amber-50 text-amber-700` |
| `critical` | < 60% | `text-red-600` | `bg-red-50 text-red-700` |

The same `READY_PCT` (80) and `ALMOST_PCT` (60) drive the panel's `ScoreRing`, every `ScorePill`, the per-row label (`labelFor` in `site-score.ts`) and the site roll-up (`site-aggregate.ts`). Cached dashboard scores use the key prefix `aiDiscovery:scores:v3:`. It was bumped from v2 when the thresholds and the AI body text changed.

### Fixed pillar maxima (`MAX_PILLARS`, `site-score.ts:61–72`)

| Pillar | Max | Notes |
|--------|----:|-------|
| Crawlability | 15 | fixed |
| Structured | **0–17** | dynamic per page type (see pillar 2); `MAX_PILLARS.structured` is the 17 ceiling, so the maxima sum to 100 |
| Answerability | 20 | fixed |
| Authority | 28 | fixed |
| Retrievability | 20 | fixed |

**Example `maxTotal` values:**
- Home page → 15 + 3 + 20 + 28 + 20 = **86** (Organization only)
- Regular inner page → 15 + 3 + 20 + 28 + 20 = **86** (BreadcrumbList only)
- Article page w/ FAQs → 15 + 17 + 20 + 28 + 20 = **100** (FAQPage + Article + BreadcrumbList)

---

## Pillar 1 — Crawlability (15 pts)
**`scoreCrawlability`, `site-score.ts:73–111`** · UI: `MatrixView.tsx` column **CRAWL** — *"can AI bots see this page?"*

| Signal | Pts | Logic | Thresholds |
|--------|----:|-------|-----------|
| AI crawler permissions (robots.txt) | 0–6 | Counts how many of 6 AI crawlers are explicitly blocked: `googleExtended`, `gptBot`, `claudeBot`, `perplexityBot`, `amazonBot`, `appleBotExtended` | 0 blocked → 6 · 1–2 blocked → 3 · 3+ blocked → 0 · no robots data → 3 (neutral fallback) |
| Canonical URL | 0–5 | Presence + normalized match of `<link rel="canonical">` against page URL | present & self-referencing → 5 · present but different → 2 · missing → 0 |
| Robots meta | 0–4 | Scans `<meta name="robots">` and `<meta name="googlebot">` for blockers (`noindex`, `nosnippet`, `noimageindex`, `none`) | no blockers → 4 · any blocker → 0 |

**Signal types:** robots.txt fetch + HTML head parsing.

---

## Pillar 2 — Structured Data (0–17 pts, dynamic)
**`scoreStructured`, `site-score.ts:113–166`** · UI: column **STRUCT** — *"can AI parse the schema?"*

Conditionally evaluated per page type — pages are **not** penalized for inapplicable schemas; both earned and max accumulate only for applicable checks. JSON-LD parsed from `<script type="application/ld+json">`.

| Signal | Pts | Applicability | Logic |
|--------|----:|---------------|-------|
| FAQPage | 0–8 | Only when ≥2 H2s match the question regex | `@type: "FAQPage"` present AND ≥2 question-style H2s → 8 · else 0 |
| Article | 0–6 | Only when Sitecore template display name = "Article Detail Page" (case-insensitive) | `@type` ∈ {Article, NewsArticle, BlogPosting} → 6 · else 0 |
| BreadcrumbList | 0–3 | All pages **except** home (`/`) | `@type: "BreadcrumbList"` present → 3 · else 0 |
| Organization | 0–3 | Home page only (route `/`) | `@type: "Organization"` present → 3 · else 0 |

**Question regex (shared):** `/^(who|what|when|where|why|how|can|does|did|is|are|was|were|should|which|will|would|could)\b/i`

---

## Pillar 3 — Answerability (20 pts)
**`scoreAnswerability`, `site-score.ts:168–208`** · UI: column **ANSWER** — *"can AI extract a passage?"*

| Signal | Pts | Logic | Thresholds |
|--------|----:|-------|-----------|
| Heading structure | 0–6 | H1 count + hierarchy skip detection (e.g., H1→H3) | exactly 1 H1 AND no skips → 6 · one condition only → 3 · neither → 0 |
| Question-style H2s | 0–6 | Count of H2s passing the question regex | ≥3 → 6 · 1–2 → 3 · 0 → 0 |
| Reading grade (ARI) | 0–4 | ARI over concatenated body paragraphs: `4.71·(chars/words) + 0.5·(words/sentences) − 21.43` | grade ≤13 → 4 · 14–16 → 2 · >16 or insufficient text → 0 |
| Paragraph length | 0–4 | Average word count across `<p>` elements | avg 40–120 → 4 · avg 20–200 → 2 · else/none → 0 |

**Signal types:** HTML parsing of headings + paragraph text (rendered `<main>`/body).

---

## Pillar 4 — Authority (28 pts)
**`scoreAuthority`, `site-score.ts:210–259`** · UI: column **AUTH** — *"does AI trust this content?"*

| Signal | Pts | Logic | Thresholds | Type |
|--------|----:|-------|-----------|------|
| AI uniqueness rating | 0–15 | Ingests LLM content classification of `ParsedHtml.mainText` (skipped when the page has none) | `unique` → 15 · `borderline` → 8 · `commodity` or not-yet-run → 0 | **AI/LLM** |
| Content depth | 0–3 | Total words across body paragraphs | ≥800 → 3 · 400–799 → 2 · 150–399 → 1 · <150 → 0 | HTML |
| Freshness | 0–8 | Date resolution priority: (1) `<meta property="article:modified_time">` → (2) `<meta name="last-modified">` → (3) Sitecore `updatedAt`/`__Updated` | ≤180d → 8 · 181–365d → 5 · 366–730d → 2 · >730d or none → 0 | HTML + Sitecore |
| Internal link descriptiveness | 0–2 | Ratio of generic anchors (`ANCHOR_BLOCKLIST`) to total links, with arrow/punctuation normalization | ≤20% generic → 2 · 21–40% → 1 · no links → 1 (fallback) · >40% → 0 | HTML |

Heaviest pillar; combines the single LLM signal in the Matrix (uniqueness) with HTML-derived depth/freshness/link quality.

---

## Pillar 5 — Retrievability (20 pts)
**`scoreRetrievability`, `site-score.ts:261–303`** · UI: column **RETRIEV** — *"does AI prefer it?"*

| Signal | Pts | Logic | Thresholds |
|--------|----:|-------|-----------|
| Title length | 0–6 | `<title>` char count | 30–60 → 6 · 20–29 or 61–80 → 3 · <20 or >80 → 0 |
| Meta description length | 0–6 | `<meta name="description">` char count | 120–160 → 6 · 70–119 or 161–200 → 3 · <70 or >200 → 0 |
| Open Graph completeness | 0–3 | Presence of `og:title`, `og:description`, `og:image` | 3 → 3 · 2 → 2 · 1 → 1 · 0 → 0 |
| Semantic landmarks | 0–3 | Count of `<main>`, `<article>`, `<nav>`, `<header>` | ≥3 → 3 · 2 → 2 · 1 → 1 · 0 → 0 |
| Image alt coverage | 0–2 | Ratio of `<img>` with non-empty `alt` | ≥90% → 2 · 60–89% → 1 · no images → 1 (fallback) · <60% → 0 |

**Signal types:** HTML head + DOM structure parsing.

---

## UI mapping

### Matrix table — `MatrixView.tsx:36–46`

| Pillar key | Column label | Tooltip (title attr) |
|------------|--------------|----------------------|
| `crawlability` | CRAWL | Crawlability — can AI bots see this page? |
| `structured` | STRUCT | Structured data — can AI parse the schema? |
| `answerability` | ANSWER | Answerability — can AI extract a passage? |
| `authority` | AUTH | Authority — does AI trust this content? |
| `retrievability` | RETRIEV | Retrievability — does AI prefer it? |

**Layout:** Page (30%) · 5 pillars (8% each) · Total (20%) · Action (10%). Pillar cells render `ScorePill` as `earned/max` (e.g. `8/15`); Total cell shows a percentage bar + rounded %.

### Category cards — `CategoryCards.tsx:11–62`
Aggregated dashboard cards reuse the same pillar keys with full labels, the user-facing question, and bullet lists of included items (FAQ/Article/Breadcrumb/Organization for Structured; H1/question-H2/readability/paragraph for Answerability; uniqueness/depth/freshness/anchors for Authority; title/description/OG/landmarks/alt for Retrievability).

---

## Signal-type summary

- **AI/LLM-based:** Authority → uniqueness rating (15 pts) — the only LLM signal in the Matrix.
- **HTML parsing (rendered fetch):** robots/canonical/robots-meta (Crawlability); JSON-LD (Structured); headings/paragraphs/reading level (Answerability); word count/freshness/anchors (Authority); title/description/OG/landmarks/alt (Retrievability).
- **Sitecore backend:** template-name match for Article applicability (Structured); `updatedAt` freshness fallback (Authority).

---

## Key files

| Aspect | File | Lines |
|--------|------|-------|
| Pillar scoring + MAX_PILLARS + labelFor | `src/lib/rule-engine/site-score.ts` | 42–366 |
| Page Matrix table UI | `src/components/MatrixView.tsx` | 36–305 |
| Category aggregation + descriptions | `src/components/CategoryCards.tsx` | 11–144 |
| Helpers (ARI, word count, question regex, anchor blocklist) | `src/lib/rule-engine/helpers.ts` | 34–135 |
| Dashboard types (`PageMatrixRow`, `MatrixFilter`) | `src/types/dashboard.ts` | 1–29 |
