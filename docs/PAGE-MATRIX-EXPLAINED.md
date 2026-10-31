# Page Matrix Explained — A Guide for Marketers

The **Page Matrix** is the view in the **Is It Agent-Ready? for SitecoreAI** dashboard ("Is this site agent-ready?") that grades every page on your site across **5 big-picture categories**. Where the per-page checker is a detailed checklist, the Page Matrix is the **scorecard at a glance** — one row per page, one score per category, so you can spot weak pages instantly.

This guide explains each of the 5 categories in plain language, what feeds into them, and why each matters. Use it as a demo cheat sheet.

---

## The big idea: 5 questions every page must answer

Modern search isn't just Google anymore — AI assistants (ChatGPT, Gemini, Claude, Perplexity) now read your pages to answer people's questions. The Page Matrix scores each page on the 5 things those AI systems care about, framed as 5 simple questions:

| Category | The question it answers | In one phrase |
|----------|------------------------|---------------|
| **🔵 Crawlability** | *Can AI bots reach and index this page?* | Can they get in? |
| **🟢 Structured Data** | *Can AI understand the page's meaning from its labels?* | Do they understand it? |
| **🟠 Answerability** | *Can AI pull a clean answer out of the content?* | Can they quote it? |
| **🟣 Authority** | *Does AI trust this content enough to cite it?* | Do they trust it? |
| **🔴 Retrievability** | *Does AI prefer this page when answering?* | Will they pick it? |

**The flow makes sense in order:** a bot has to *get in* (Crawlability) → *understand* what it's reading (Structured) → *find an answer* in it (Answerability) → *trust* the source (Authority) → and finally *choose* it over competitors (Retrievability).

---

## How to read the scorecard

- Each page gets a **percentage score** (its earned points ÷ the points that apply to it).
- That percentage becomes a **color-coded label**:

| Label | Score | Meaning |
|-------|-------|---------|
| 🟢 **Good** | 80–100% | Search-ready — AI can find, trust, and use it |
| 🟡 **Warning** | 60–79% | Needs work — some gaps holding it back |
| 🔴 **Critical** | Below 60% | Major issues — likely invisible to AI search |

The page panel in Page Builder uses the same thresholds, so a page shows the same color in both places.

> **Smart scoring:** A page is only graded on what actually applies to it. For example, your homepage isn't penalized for missing "Article" labels, and a page with no FAQs isn't marked down for missing FAQ labels. The denominator adjusts per page, so scores are always fair.

---

## 🔵 Category 1: Crawlability — *Can the bots get in?* (15 points)

**The plain version:** Before anything else, AI search bots have to be *allowed* to read your page and not get sent to the wrong copy. This category checks the "doors and signs."

**What feeds into it:**
- **AI crawler permissions** — whether your site's rulebook (robots.txt) blocks the major AI bots (GPTBot from ChatGPT, ClaudeBot, Google-Extended, PerplexityBot, and others). Blocking them means those AI tools literally cannot read your page.
- **Canonical tag** — a label saying "this is the official version of this page," so duplicate copies don't split your credit.
- **Robots meta tags** — a check that the page isn't accidentally tagged "do not index" or "do not show snippets."

**Why it matters:** This is the foundation. If bots are blocked or the page says "don't index me," nothing else you do counts — the page is invisible to AI and search no matter how good it is.

---

## 🟢 Category 2: Structured Data — *Do they understand it?* (up to 17 points)

**The plain version:** Structured data (called "schema") is invisible labeling in the code that spells out *what your content is* — "this is an FAQ," "this is an article," "this is the company info." It turns a wall of text into clearly labeled parts a machine can understand instantly.

**What feeds into it (only the labels that fit each page):**
- **FAQ labeling** — on pages with question-and-answer content.
- **Article labeling** — on article/blog pages.
- **Breadcrumb labeling** — on inner pages, showing where they sit in the site.
- **Organization labeling** — on the homepage, identifying your brand.

**Why it matters:** Schema is how you earn the "rich" results — FAQ drop-downs, article cards, breadcrumb trails, and brand knowledge panels. It's also how AI confidently understands *what kind* of content it's looking at, so it can use it correctly.

> This is the only category where the maximum score changes per page, because different page types need different labels. The page is only judged on the labels relevant to it.

---

## 🟠 Category 3: Answerability — *Can they quote it?* (20 points)

**The plain version:** Even a page that's understood can be a messy blob of text. Answerability checks whether the content is **structured and readable enough that AI can lift a clean answer out of it.**

**What feeds into it:**
- **Heading structure** — one clear main headline, and sub-headings in logical order (no skipped levels).
- **Question-style headings** — section titles phrased as real questions ("How do I…?", "What is…?"), which match how people actually ask AI.
- **Readability** — writing that's clear and not overly dense (around an early-college reading level or simpler).
- **Scannable paragraphs** — paragraphs that are a comfortable length (not one-liners, not giant walls of text).

**Why it matters:** AI assistants and answer boxes extract *passages* — a sentence or short block — to answer a question. Clean structure and readable, well-sized paragraphs make your content easy to lift and feature. Dense, disorganized text gets skipped.

---

## 🟣 Category 4: Authority — *Do they trust it?* (28 points — the heaviest category)

**The plain version:** AI won't cite content it doesn't trust. Authority measures whether your content is **original, substantial, current, and well-connected** — the marks of a credible source.

**What feeds into it:**
- **Content uniqueness** *(AI-judged)* — our AI reads the page's main text and decides whether it's genuinely original and valuable, or generic "could-be-anywhere" filler. **This is the single biggest factor in the whole Matrix.**
- **Content depth** — whether there's enough substance (word count) to be useful, vs. thin content.
- **Freshness** — how recently the page was published or updated. Stale pages lose trust.
- **Descriptive links** — whether internal links use meaningful text (not vague "click here").

**Why it matters:** This is the heart of getting *cited* by AI. Search and AI reward genuine expertise and originality; they bury thin, recycled, or outdated content. It's the most heavily weighted category because trust is what separates a page that gets quoted from one that's ignored.

---

## 🔴 Category 5: Retrievability — *Will they pick it?* (20 points)

**The plain version:** When several pages could answer a question, which one gets shown? Retrievability is about **presentation** — making your page the attractive, well-packaged choice in results and previews.

**What feeds into it:**
- **Title length** — a headline that fits search results cleanly (about 30–60 characters).
- **Meta description length** — the summary snippet under the title, in the ideal range (about 120–160 characters).
- **Social sharing tags** — complete preview info (title, description, image) so shared links look polished.
- **Semantic landmarks** — code labels (`main`, `article`, `nav`, `header`) that mark the page's key regions, helping AI find the real content fast.
- **Image alt text** — written descriptions of images so machines can "see" them.

**Why it matters:** This is the finishing layer. Even trusted, well-understood content needs to *look* right and be easy to navigate. Strong titles, snippets, and previews win the click; clean structure and labeled images make the page the easy pick.

---

## Quick reference: the 5-category scorecard

| Category | Points | The question | What to fix if it's low |
|----------|-------:|--------------|-------------------------|
| 🔵 **Crawlability** | 15 | Can AI bots get in? | Unblock AI crawlers, add canonical, remove accidental noindex |
| 🟢 **Structured Data** | up to 17 | Can AI understand it? | Add the right schema (FAQ / Article / Breadcrumb / Organization) |
| 🟠 **Answerability** | 20 | Can AI quote it? | Fix headings, add question sections, simplify writing, size paragraphs |
| 🟣 **Authority** | 28 | Does AI trust it? | Make content original & deeper, refresh dates, improve link text |
| 🔴 **Retrievability** | 20 | Will AI pick it? | Tune title & description length, complete OG tags, add landmarks & alt text |

---

## Demo talking points

- **"Five questions, one scorecard."** The Matrix turns a complex audit into five intuitive questions, scored per page — anyone can scan it and know which pages need help.
- **"It's built for the AI-search era."** These categories map to how ChatGPT, Gemini, and Perplexity actually decide what to read, trust, and cite — not just old-school Google.
- **"Scoring is fair by design."** Pages are only graded on what applies to them, so a clean homepage isn't punished for lacking article labels.
- **"Authority carries the most weight (28 pts)"** — because original, trustworthy content is what AI rewards most, and it's the hardest thing for competitors to copy.
- **"Green / Yellow / Red, at a glance."** Marketers can prioritize instantly: fix the reds first.
