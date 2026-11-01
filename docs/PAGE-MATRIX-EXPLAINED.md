# Page Matrix Explained — A Guide for Marketers

The **dashboard** in **Is It Agent-Ready? for SitecoreAI** ("Is this site agent-ready?") grades every page on your site and shows the results at a glance: one score per page, one card per category, and a short list of the pages to fix first. Where the Page Builder panel is the detailed checklist for one page, the dashboard is the **scorecard for the whole site**.

This guide explains what you see on the dashboard and why it matters. Use it as a demo cheat sheet.

---

## The big idea: four questions every page must answer

AI assistants (ChatGPT, Claude, Gemini, Perplexity) and AI search now read your pages to answer people's questions. The dashboard scores each page on four plain questions:

| Category | The question | What feeds into it |
|----------|-------------|--------------------|
| **Reach** | Can AI agents get to it? | The page points search and AI at its official address |
| **Read** | Can they read it? | Clear page structure; page speed (checked in the panel) |
| **Understand** | Do they understand it? | Headings, title and description, schema labels, sharing tags, FAQ answers, question headings, readability, image descriptions |
| **Trust** | Will they trust and cite it? | Original content (AI-judged), named author on articles, freshness, depth, descriptive links |

**The order makes sense:** an AI agent has to get to the page, read it, understand it, and trust it before it quotes you.

**The dashboard and the panel use exactly the same checks and scoring**, so a page shows the same score in both places. The full list of checks is in the Page Checks guide.

---

## How to read the scorecard

- Each page gets a **score out of 100**.
- **Essential** checks carry most of it (80 points between them), **Recommended** checks the rest (20 points), and a **Bonus** check can add up to 5. Fix the Essential ones first.
- That score becomes a **colour-coded label**:

| Label | Score | Meaning |
|-------|-------|---------|
| 🟢 **Agent-ready** (shown as Healthy) | 80–100 | AI can reach, read, understand and trust it |
| 🟡 **Almost there** (shown as Needs work) | 60–79 | Some gaps holding it back |
| 🔴 **Not ready** (shown as Critical) | Below 60 | Major issues — likely passed over by AI |

**Fair by design:** a page is only graded on what applies to it. Your home page isn't marked down for missing article labels, and a page without images isn't marked down for image descriptions.

**Blocked pages:** a page set to "noindex" in Sitecore (or tagged noindex/nosnippet) can't appear in AI answers at all, so it doesn't get a score. The dashboard shows it as **Blocked** and leaves it out of the site average.

---

## What's on the Overview

### The site score
The average score of all scored pages, with how many are Agent-ready, Almost there, Not ready and Blocked. A progress bar shows the scan filling in.

### Readiness by category
One card per category (Reach, Read, Understand, Trust) with the site's average and how many pages are failing that category. **What's included** lists the checks behind each card.

### Site checks
Some things are about the **whole site**, not one page, so they're checked once and get their own site score (they never change a page's score):

- **robots.txt lets AI search in** — whether your site's rulebook (robots.txt) blocks the major AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, and others). Blocking them means those AI tools can't read your site.
- **Your organisation is described for AI** — whether the home page has Organization schema: your company's name, website, logo, social profiles, description and contact details, in machine-readable form. If it's missing, the dashboard says **"Not added yet"** and gives you the code to paste in; if it's incomplete, it lists what's missing and gives you corrected code. This is how AI knows who runs the site, so it names and cites your brand correctly.

The **Site type** setting (Content site, Commerce, or App or API) tells the app which kind of site this is. It will decide which extra agent checks apply in a later release.

### Pages to fix first
The ten lowest-scoring pages, with **Open** to jump straight to the page in Page Builder. Click a page name to see its score in each of the four categories. **View all pages** lists every page, with filters and sorting.

---

## Quick reference: what to fix when a category is low

| Category | The question | What to fix if it's low |
|----------|--------------|-------------------------|
| **Reach** | Can AI agents get to it? | Add a canonical tag that points to the page itself (developer) |
| **Read** | Can they read it? | Add the main page landmarks and label icon buttons (developer); improve page speed |
| **Understand** | Do they understand it? | One H1 and ordered headings; set the title and description; add the schema code the panel gives you; complete the sharing tags; tighten FAQ answers and paragraphs; describe images |
| **Trust** | Will they trust and cite it? | Add original insight and depth; name and link the author on articles; refresh old pages; make link text descriptive |

---

## Demo talking points

- **"Four questions, one scorecard."** Reach, Read, Understand, Trust — anyone can scan it and know which pages need help.
- **"The same score in the panel and the dashboard."** One engine, one set of rules, no surprises.
- **"Fix the essentials first."** They carry most of the score, so a few fixes move the needle.
- **"It checks the real page."** Schema checks look at what's actually published — and the BrandX demo site's missing organisation details show up straight away, with the code to fix it.
- **"Green / amber / red, at a glance."** Marketers can prioritise instantly: fix the reds first.
