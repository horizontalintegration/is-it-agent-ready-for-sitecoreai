// ─────────────────────────────────────────────────────────────────────────────
// The AI agents the site checks test (plan section 5.2, S1 and S2), grouped by
// purpose the way site owners decide about them:
//   search    finds and cites pages in AI search results
//   user      opens a page because a user asked the assistant to
//   training  collects content to train models
// Blocking search or user agents keeps a site out of AI answers. Blocking only
// training agents is a legitimate choice and never lowers a score.
// ─────────────────────────────────────────────────────────────────────────────

export type BotPurpose = "search" | "user" | "training";

export interface Bot {
  /** robots.txt product token, e.g. "GPTBot". Matched case-insensitively. */
  name: string;
  company: string;
  purpose: BotPurpose;
  /**
   * The User-Agent string the agent sends, per each company's crawler docs.
   * Firewalls match on the token inside it. Null for tokens that are only a
   * robots.txt rule: Google-Extended and Applebot-Extended have no crawler of
   * their own (Googlebot and Applebot fetch, and the token decides the use).
   */
  userAgent: string | null;
}

export const BOTS: Bot[] = [
  { name: "OAI-SearchBot", company: "OpenAI", purpose: "search", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot" },
  { name: "ChatGPT-User", company: "OpenAI", purpose: "user", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot" },
  { name: "GPTBot", company: "OpenAI", purpose: "training", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)" },
  { name: "Claude-SearchBot", company: "Anthropic", purpose: "search", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)" },
  { name: "Claude-User", company: "Anthropic", purpose: "user", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)" },
  { name: "ClaudeBot", company: "Anthropic", purpose: "training", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" },
  { name: "PerplexityBot", company: "Perplexity", purpose: "search", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)" },
  { name: "Perplexity-User", company: "Perplexity", purpose: "user", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)" },
  { name: "Amazonbot", company: "Amazon", purpose: "search", userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36" },
  { name: "meta-externalagent", company: "Meta", purpose: "training", userAgent: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)" },
  { name: "Google-Extended", company: "Google", purpose: "training", userAgent: null },
  { name: "Applebot-Extended", company: "Apple", purpose: "training", userAgent: null },
];

/** The browser the bots are compared with. */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const PURPOSE_TEXT: Record<BotPurpose, string> = {
  search: "Search",
  user: "User",
  training: "Training",
};

/** Search and user agents decide whether a site appears in AI answers; training agents don't. */
export const isAnswerBot = (b: Pick<Bot, "purpose">) => b.purpose !== "training";
