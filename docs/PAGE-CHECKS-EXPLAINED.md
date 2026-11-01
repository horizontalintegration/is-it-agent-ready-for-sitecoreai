# Page Checks Explained — A Guide for Marketers

This guide explains, in plain language, every check that **Is It Agent-Ready? for SitecoreAI** runs in the Page Builder panel ("Is this page agent-ready?") and **why each one matters**. Use it as a cheat sheet during demos so you can confidently answer "what does this check, and why should I care?"

---

## The big idea: four questions every page must answer

AI assistants (ChatGPT, Claude, Gemini, Perplexity) and AI search now read your pages to answer people's questions. Before an AI agent can quote your page, four things have to be true:

| Category | The question | In plain terms |
|----------|-------------|----------------|
| **Reach** | Can AI agents get to it? | The page isn't hidden, blocked or pointing somewhere else |
| **Read** | Can they read it? | The page is laid out so a machine can find the real content |
| **Understand** | Do they understand it? | Clear headings, a good title and summary, and labels that say what the content is |
| **Trust** | Will they trust and cite it? | Original, current, well-written content from a named source |

The panel and the dashboard use the **same four categories and the same scoring**, so a page shows the same score in both places.

---

## How scoring works (the 30-second version)

- Every page gets a score **out of 100**.
- Checks come in three kinds:
  - **Essential** — the must-haves. Together they're worth **80 points**.
  - **Recommended** — the things that make a good page great. Together they're worth **20 points**.
  - **Bonus** — extra credit, up to **+5 points** (the score still tops out at 100).
- The points in each group are **shared equally** between the checks that apply to the page. Fixing an Essential check moves the score much more than fixing a Recommended one, and that's on purpose: it's where to start.
- **Partial credit counts.** A page that's halfway there gets half the points.
- **Checks that don't apply are skipped, never failed.** A page with no images isn't marked down for image descriptions, and a page with no FAQ isn't marked down for FAQ answers. They're listed under "Doesn't apply here".
- Some checks need a scan first (the AI originality check, and page speed). Until they've run they show **"not checked"** and don't count either way.
- The score is **green (Agent-ready) at 80 or more**, **amber (Almost there) from 60 to 79**, and **red (Not ready) below 60**. The dashboard uses the same thresholds.
- Next to each fix, **"+N pts"** shows how much the score would go up if you fixed it.

---

## 🚦 The gate (runs first)

### Is this page allowed to be found?
**What it checks:** Whether the page is deliberately hidden from search engines and AI — the "noindex" setting in Sitecore, or a "noindex" or "nosnippet" tag on the page.

**Why it matters:** If a page is set to "do not index," search won't list it and AI won't quote it, no matter how good the content is. Instead of a score, the panel tells you straight away, so you don't spend time on a page that's invisible by design (or so you catch a live page that was hidden by mistake).

---

## 🟢 Reach — Can AI agents get to it?

### Canonical points to this page — Essential
**What it checks:** Whether the page has a "canonical tag" — a behind-the-scenes label that says "this is the official address of this page" — and that it points to this page.

**Why it matters:** The same content is often reachable at several addresses. Without a canonical tag, search engines and AI treat them as duplicates and split the credit between them, or cite the wrong one. (Usually set in the page template by a developer.)

---

## 🔵 Read — Can they read it?

### Page structure is machine-readable — Recommended
**What it checks:** Whether the page uses the standard structural labels in its code (`main`, `article`, `nav`, `header`) that mark out the key regions, and whether buttons and icon links have a text label.

**Why it matters:** These labels are like room signs in a building: they help AI agents go straight to the real content and skip menus and footers.

### Page loads fast — Recommended, runs when you ask
**What it checks:** Google's PageSpeed score for the page. Click **Run scan** on the row to check it.

**Why it matters:** Slow pages frustrate visitors, rank lower, and can time out when an AI assistant fetches them on someone's behalf.

---

## 🟣 Understand — Do they understand it?

### One clear H1 and logical headings — Essential
**What it checks:** That the page has exactly **one main headline (H1)** and that sub-headings step down in order (H1 → H2 → H3) without skipping levels.

**Why it matters:** Headings are the page's table of contents. AI uses them to work out what the page is about and where each answer starts.

### Title and description are set — Essential
**What it checks:** The page title (ideally **50–60 characters**) and the meta description (ideally **120–160 characters**). It reads the Sitecore fields you edit.

**Why it matters:** These are the summary that search results and AI show before anyone clicks. If the description is missing, search engines write their own, usually a random snippet you don't control. The panel's **Generate** buttons can write both for you.

### Structured data is present and valid — Essential
**What it checks:** Whether the page has the "schema" labels (hidden code called JSON-LD) that it needs, and that they're complete:
- **Breadcrumbs** on every page except the home page (where the page sits in the site).
- **FAQ** labels when the page has questions and answers.
- **Article** labels on article pages.

If something is missing, the check gives you **the code to paste in**.

**Why it matters:** Schema tells AI exactly what the content is — an article, a set of answers, a page in a section — without guessing. **This used to always pass, even when the labels weren't there. It now looks at the real page**, so it tells you what's actually missing.

### Page identity metadata is complete — Recommended
**What it checks:** The page's language setting and its social sharing tags (type, title, description and image).

**Why it matters:** These tell AI what the page is and in which language, and they decide whether a shared link shows a rich preview card or a bare address.

### FAQ answers are quotable — Recommended
**What it checks:** That each FAQ answer is **40–300 characters** — long enough to be useful, short enough to quote. It finds questions and answers in **any** accordion or expandable section, not just one component.

**Why it matters:** AI assistants lift FAQ answers word for word. A one-line answer is useless; a wall of text won't fit.

### Sections answer real questions — Recommended
**What it checks:** Whether some section headings are phrased as the questions people ask ("How do I…?", "What is…?").

**Why it matters:** People ask AI questions. A section headed by the question it answers is easy to match and cite. Only rephrase where it's natural.

### Easy to read and quote — Recommended
**What it checks:** How easy the writing is to read, paragraph by paragraph (aiming for an early-college reading level or simpler), and whether paragraphs are a comfortable length (about 40–120 words).

**Why it matters:** Clear, well-sized paragraphs are what AI quotes accurately. Dense text gets paraphrased badly or skipped.

### Images are described — Recommended
**What it checks:** What share of images have alt text — a short written description.

**Why it matters:** AI can't see pictures; the alt text is how it learns what an image shows. It's also what screen readers announce.

---

## 🟤 Trust — Will they trust and cite it?

### Content is original, not generic — Recommended
**What it checks:** Our AI reads the page's main text and judges whether it's genuinely **original and valuable**, or generic content that could have come from anywhere. The answer is remembered until the text changes, so revisiting an unchanged page shows the same rating straight away.

**Why it matters:** AI assistants cite the source that adds something. Content that repeats what's everywhere else is rarely chosen.

### Author is named and linked — Recommended, article pages only
**What it checks:** Whether the article names its author and links to an author profile.

**Why it matters:** A named author with a profile lets AI judge expertise before citing an article.

### Content is recently updated — Recommended
**What it checks:** When the page was last updated: full marks within six months, partial up to two years.

**Why it matters:** AI favours current sources, especially on fast-moving topics.

### Enough depth to be cited — Recommended
**What it checks:** How much body text the page has (full marks at about 800 words).

**Why it matters:** Thin pages rarely hold a complete answer, so AI looks elsewhere.

### Links say where they go — Recommended
**What it checks:** Whether links use descriptive text ("view our pricing plans") instead of vague phrases ("click here", "read more"). Links like "Download the 2026 report" count as descriptive.

**Why it matters:** The link text tells AI what the linked page is about before it follows it.

### Answers the next question too — Bonus
**What it checks:** Our AI suggests the questions a reader would likely ask next, and checks whether the page answers them.

**Why it matters:** AI prefers sources that also cover the obvious follow-up. Add content only where it genuinely helps readers.

---

## 🏢 Site check on the home page: your organisation

### Your organisation is described for AI
**What it checks:** Whether the home page has **Organization schema**: your company's name, website, logo, social profiles, description and contact details, in machine-readable form.

This is a **site check**: it's about the whole site, so it isn't part of any page's score. The panel shows it when the **home page** is open, and the dashboard shows it in **Site checks**.

| What the home page has | What you see |
|---|---|
| Complete organisation details | Pass |
| Some details missing | A warning listing them, and corrected code to paste in |
| No organisation details at all | A warning, "Not added yet", and ready-to-paste code |
| The home page couldn't be checked | "Couldn't check" — it doesn't count |

**Why it matters:** This is how AI and search engines know who runs the site, so they name and cite your brand correctly (and it feeds Google's knowledge panel). **This also used to always pass.** The BrandX demo site has none, and the check now says so.

---

## Quick reference: the scorecard

| Category | Check | Kind |
|----------|-------|------|
| **Reach** | Canonical points to this page | Essential |
| **Read** | Page structure is machine-readable | Recommended |
| **Read** | Page loads fast | Recommended |
| **Understand** | One clear H1 and logical headings | Essential |
| **Understand** | Title and description are set | Essential |
| **Understand** | Structured data is present and valid | Essential |
| **Understand** | Page identity metadata is complete | Recommended |
| **Understand** | FAQ answers are quotable | Recommended |
| **Understand** | Sections answer real questions | Recommended |
| **Understand** | Easy to read and quote | Recommended |
| **Understand** | Images are described | Recommended |
| **Trust** | Content is original, not generic | Recommended |
| **Trust** | Author is named and linked | Recommended (articles) |
| **Trust** | Content is recently updated | Recommended |
| **Trust** | Enough depth to be cited | Recommended |
| **Trust** | Links say where they go | Recommended |
| **Trust** | Answers the next question too | Bonus |
| Site | Your organisation is described for AI | Site check (own score) |

More checks arrive in later releases: whether content shows up without JavaScript, and whether AI agents can get the page as Markdown.

---

## Meta & social generator

Below the checks, the panel can write the **meta title, meta description, Open Graph title and Open Graph description** for you. Click **Generate** on a field, review the suggestion, then click **Populate field** to write it into the page in Sitecore.

- Suggestions are written **from the page's main text**, so they describe what the page actually says. The button waits until the page scan has read the text.
- They follow your **brand voice document**: tone, words to use and avoid, and compliance rules such as "no guaranteed returns". If no brand voice has been set up, the generator uses neutral, plain-language guidelines.
- Suggestions **stay within the character limit** shown next to them (60 for the meta title, 155 for the meta description, 70 and 200 for the Open Graph fields). If the first draft runs long, the tool asks the AI for a shorter one. In the rare case that it's still over, the count turns amber so you can trim it before populating.
- Nothing is saved until you click **Populate field**.

---

## Demo talking points (the big picture)

- **"Four plain questions."** Can AI agents get to it, read it, understand it, and trust it? Every check answers one of them.
- **"Fix the essentials first."** Essential checks carry most of the score, and "+N pts" shows exactly what each fix is worth.
- **"It checks the real page."** Schema checks look at what's actually on the page, and hand you the code when something's missing.
- **"Fair by design."** Checks that don't apply are skipped, not failed.
- **"One score everywhere."** The panel and the dashboard show the same score for the same page.
