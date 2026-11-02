// The Files tab's robots.txt helper (plan section 6.4): one group per purpose
// with Allow or Disallow, the Content-Signal line (contentsignals.org), and
// the Sitemap line.

import { BOTS, type BotPurpose } from "./bots";

const GROUP_COMMENT: Record<BotPurpose, string> = {
  search: "# AI search engines",
  user: "# AI assistants acting for a user",
  training: "# AI model training",
};

export interface RobotsHelperChoice {
  allow: Record<BotPurpose, boolean>;
  contentSignal: boolean;
  sitemapUrl: string;
}

const yesNo = (b: boolean) => (b ? "yes" : "no");

export function buildRobotsLines({ allow, contentSignal, sitemapUrl }: RobotsHelperChoice): string {
  const lines: string[] = [];
  for (const purpose of ["search", "user", "training"] as BotPurpose[]) {
    lines.push(GROUP_COMMENT[purpose]);
    for (const bot of BOTS.filter((b) => b.purpose === purpose)) lines.push(`User-agent: ${bot.name}`);
    lines.push(allow[purpose] ? "Allow: /" : "Disallow: /", "");
  }
  if (contentSignal) {
    lines.push(
      "User-agent: *",
      `Content-Signal: search=${yesNo(allow.search)}, ai-input=${yesNo(allow.user)}, ai-train=${yesNo(allow.training)}`,
      "Allow: /",
      "",
    );
  }
  lines.push(`Sitemap: ${sitemapUrl}`);
  return lines.join("\n");
}
