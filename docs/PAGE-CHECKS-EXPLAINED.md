# Page Checks Explained — A Guide for Marketers

This guide explains, in plain language, every page-level check that **Is It Agent-Ready? for SitecoreAI** runs in the Page Builder panel ("Is this page agent-ready?") and **why each one matters**. Use it as a cheat sheet during demos so you can confidently answer "what does this check, and why should I care?"

---

## First, what do SEO, AEO, and GEO mean?

Think of these as three different "audiences" reading your page:

| Term | Stands for | The audience | What they want |
|------|-----------|--------------|----------------|
| **SEO** | Search Engine Optimization | Google, Bing (traditional search) | A clean, well-labeled page they can list in search results |
| **AEO** | Answer Engine Optimization | Voice assistants & "answer boxes" (Alexa, Siri, Google's featured snippets) | Clear questions and direct answers they can read aloud or feature |
| **GEO** | Generative Engine Optimization | AI assistants (ChatGPT, Gemini, Claude, Perplexity) | Trustworthy, easy-to-understand content they can quote and cite |

**The simple version:** SEO gets you *found*. AEO gets you *featured as the answer*. GEO gets you *quoted by AI*. A page that does all three is "search ready."

---

## How scoring works (the 30-second version)

- Every page is graded out of **81 points**, split across three pillars: **SEO (35 pts)**, **AEO (23 pts)**, and **Content Quality / GEO (23 pts)**.
- Each check returns **Pass** (full points), **Warning** (partial points), or **Fail** (zero/low points).
- One special **gate check** runs first: if the page is hidden from search engines on purpose, we stop and tell you — because there's no point scoring a page nobody is allowed to find.

---

## 🚦 The Gate Check (runs first)

### Is this page allowed to be found?
**What it checks:** Whether the page is deliberately hidden from search engines and AI (a "noindex" or "nosnippet" tag).

**Why it matters:** If a page is set to "do not index," Google won't list it and AI won't quote it — no matter how good the content is. We flag this immediately so you don't waste time optimizing a page that's invisible by design (or catch a mistake where a live page was accidentally hidden).

---

## 🔵 SEO Checks — Getting Found (35 points)

### 1. Meta Title Length — *8 points*
**What it checks:** The length of your page's title (the blue clickable headline in Google results). Ideal is **50–60 characters**.

**Why it matters:** The title is the single biggest factor in whether someone clicks your result. Too short and you waste valuable space; too long and Google chops it off mid-sentence ("...") which looks unprofessional and hides your message.

---

### 2. Meta Description — *8 points*
**What it checks:** Whether you have a meta description (the gray summary text under the title in search results) and that it's **120–160 characters**.

**Why it matters:** This is your "ad copy" in search results. A good description convinces people to click. If it's missing, Google writes its own — usually a random, unappealing snippet from your page that you don't control.

---

### 3. Headings & Structure (H1 + hierarchy) — *6 points*
**What it checks:** That the page has exactly **one main headline (H1)** and that sub-headings step down in order (H1 → H2 → H3) without skipping levels.

**Why it matters:** Headings are like a table of contents. Search engines and screen readers use them to understand what the page is about and how it's organized. One clear H1 tells everyone "this is the main topic"; a clean hierarchy makes the page easy to scan and easy for machines to digest.

---

### 4. Image Alt Text — *5 points*
**What it checks:** What percentage of your images have "alt text" — a short written description of the image. Score is proportional (100% of images covered = full points).

**Why it matters:** Search engines can't "see" pictures — they read the alt text instead. It's also what screen readers announce to visually impaired users. Good alt text means your images show up in Google Image search **and** your page is accessible to everyone (which matters legally and for inclusivity).

---

### 5. Canonical Tag — *5 points*
**What it checks:** Whether the page has a "canonical tag" — a behind-the-scenes label that says "this is the official version of this page."

**Why it matters:** Websites often have the same content reachable at multiple URLs (e.g., with and without "www"). Without a canonical tag, Google sees these as duplicates and gets confused about which one to rank — splitting your "SEO credit" across copies. The canonical tag points all the credit to one page.

---

### 6. Social Sharing Tags (OG Tags) — *3 points*
**What it checks:** For three "Open Graph" tags — title, description, and image — that control how your page looks when shared on LinkedIn, Facebook, Slack, etc.

**Why it matters:** When someone shares your link, these tags decide whether it appears as a rich preview card (image + headline) or an ugly, bare URL. Rich previews get dramatically more clicks and make your brand look polished.

---

### 7. Link Anchor Text Quality — *info only*
**What it checks:** Whether your internal links use descriptive text instead of vague phrases like "click here" or "read more."

**Why it matters:** The clickable words in a link tell search engines what the linked page is about. "Click here" tells them nothing. Descriptive links (e.g., "view our pricing plans") help both Google and AI understand your site's structure. *(This is shown as guidance, not scored.)*

---

## 🟢 AEO Checks — Becoming the Answer (23 points)

### 8. FAQ Schema — *8 points*
**What it checks:** Whether your FAQ content is wrapped in special "schema" code (FAQPage JSON-LD) that labels each question and answer for machines. The tool **generates this code for you** ready to paste in.

**Why it matters:** This is how you earn those expandable FAQ results directly in Google, and how voice assistants and AI pull direct answers from your page. It turns plain text into machine-readable Q&A — a fast track to being featured.

---

### 9. FAQ Answer Quality — *5 points*
**What it checks:** That each FAQ answer is a clean, self-contained paragraph of roughly **40–300 characters** (not too short, not a wall of text, no messy formatting).

**Why it matters:** Answer engines prefer answers they can lift and read aloud word-for-word. A one-word answer is useless; a giant paragraph won't fit in an answer box. The "just right" length is what gets featured.

---

### 10. Organization Schema — *5 points*
**What it checks:** Whether your site identifies your company in machine-readable code (name, logo, etc.). The tool **generates this snippet for you**, filled in with your organization's details. If those haven't been set up yet, it uses your site's name and address, and marks the rest as placeholders to replace.

**Why it matters:** This helps your brand appear in Google's "knowledge panel" (the info box on the right of search results) and helps AI confidently state who you are. It's foundational trust-building for your brand identity online.

---

### 11. Rich Results Eligibility (Breadcrumbs) — *5 points*
**What it checks:** Whether the page has "breadcrumb" schema showing where it sits in your site (e.g., Home › Products › Widget). The tool **generates this for you**.

**Why it matters:** Breadcrumbs show up in Google results as a clean navigation path instead of a long messy URL. They make your listing look more trustworthy and tell search engines how your site is organized.

---

## 🟣 Content Quality Checks — Earning AI's Trust / GEO (23 points)

### 12. Unique Content Signal — *10 points (the biggest single check)*
**What it checks:** Our AI reads the page's main text (headings, paragraphs and lists, without the menu and footer) and judges whether the content is genuinely **unique and valuable** versus generic, "could've-been-copied-from-anywhere" filler. The answer is remembered until the page's text changes, so revisiting a page you haven't edited shows the same rating straight away.

**Why it matters:** This is the heart of GEO. AI assistants and modern search reward original insight, expertise, and real value. Thin, commodity content gets ignored or buried. Unique content is what gets cited and ranked. This carries the most weight because it matters the most.

---

### 13. Page Experience (Speed) — *5 points*
**What it checks:** How fast your page loads, using Google's PageSpeed score and Core Web Vitals (real-world speed measurements).

**Why it matters:** Slow pages frustrate visitors and Google actively ranks them lower. Speed is a confirmed ranking factor — a fast page keeps users and search engines happy.

---

### 14. Agentic Readiness (Semantic Landmarks) — *4 points*
**What it checks:** Whether the page uses proper structural labels in its code (`<main>`, `<article>`, `<nav>`, `<header>`) that mark out the key regions of the page.

**Why it matters:** AI agents and assistants increasingly "navigate" pages like a user would. These labels are like room signs in a building — they help AI instantly find the real content (vs. menus, ads, footers) so it can read and act on the right part of your page.

---

### 15. Reading Grade Level — *4 points*
**What it checks:** How easy your writing is to read, paragraph by paragraph, aiming for roughly a **grade 13 (early college) level or simpler**.

**Why it matters:** Clear, readable writing wins on every front: real readers stay longer, answer engines can summarize it easily, and AI can quote it cleanly. Dense, jargon-heavy text is hard for both humans and machines to use — so it gets passed over.

---

## Quick reference: the full scorecard

| Pillar | Check | Points | The one-liner |
|--------|-------|-------:|---------------|
| **SEO** | Meta Title Length | 8 | Your clickable headline in Google |
| **SEO** | Meta Description | 8 | Your "ad copy" under the title |
| **SEO** | Headings & Structure | 6 | A clear table of contents |
| **SEO** | Image Alt Text | 5 | Letting machines "see" your images |
| **SEO** | Canonical Tag | 5 | Pointing all credit to one page |
| **SEO** | Social Sharing (OG) Tags | 3 | Pretty preview cards when shared |
| **SEO** | Link Anchor Text | info | Descriptive links, not "click here" |
| **AEO** | FAQ Schema | 8 | Q&A labeled for answer boxes |
| **AEO** | FAQ Answer Quality | 5 | Answers the right length to feature |
| **AEO** | Organization Schema | 5 | Your brand identity for the knowledge panel |
| **AEO** | Rich Results (Breadcrumbs) | 5 | Clean navigation path in results |
| **GEO** | Unique Content Signal | 10 | Original value AI wants to cite |
| **GEO** | Page Experience (Speed) | 5 | Fast pages rank and convert better |
| **GEO** | Agentic Readiness | 4 | Helping AI agents find your real content |
| **GEO** | Reading Grade Level | 4 | Easy to read = easy to feature |
| | **Total** | **81** | |

The score in the panel header turns **green at 80% or more**, **amber from 60% to 79%**, and **red below 60%**. The dashboard uses the same thresholds.

---

## Meta & social generator

Below the checks, the panel can write the **meta title, meta description, Open Graph title and Open Graph description** for you. Click **Generate** on a field, review the suggestion, then click **Populate field** to write it into the page in Sitecore.

- Suggestions are written **from the page's main text**, so they describe what the page actually says. The button waits until the page scan has read the text.
- They follow your **brand voice document**: tone, words to use and avoid, and compliance rules such as "no guaranteed returns". If no brand voice has been set up, the generator uses neutral, plain-language guidelines.
- Suggestions **stay within the character limit** shown next to them (60 for the meta title, 155 for the meta description, 70 and 200 for the Open Graph fields). If the first draft runs long, the tool asks the AI for a shorter one. In the rare case that it's still over, the count turns amber so you can trim it before populating.
- Nothing is saved until you click **Populate field**.

---

## Demo talking points (the big picture)

- **"We don't just check boxes — we explain the why."** Every score comes with a reason a marketer can act on.
- **"It covers all three frontiers of search."** Traditional Google (SEO), voice/answer boxes (AEO), and AI assistants like ChatGPT (GEO) — most tools only do the first.
- **"It does the technical heavy lifting for you."** For schema checks, the tool *generates the code snippet* — no developer required to get the win.
- **"Unique content is king."** The single biggest check (10 pts) rewards genuine value — exactly what modern AI search rewards.
