// Helpers shared by the site checks.

import { notChecked } from "../result";

/** No agent-access data yet: the site hasn't been scanned. */
export const notScanned = () => notChecked("Not yet checked", "The site hasn't been scanned yet.");

/** "A", "A and B", "A, B and C". */
export function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
