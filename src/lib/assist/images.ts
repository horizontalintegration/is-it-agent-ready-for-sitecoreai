import { imageFieldAlt, imageFieldMediaId } from "@/lib/sitecore/write";

// ─────────────────────────────────────────────────────────────────────────────
// Which field each image on the page comes from, so its alt text can be
// written there (SPIKE-FINDINGS §9.2–9.4):
//
// - An image field holds `<image mediaid="…" [alt="…"] />`. An `alt` on the
//   field wins over the media item's Alt, and changes only this use of the
//   image. The app writes there and never to the media item.
// - The draft's <img src> is the media path (…/-/media/<mediaPath>.jpg), so an
//   image is matched to a field through its media item's path.
// - An image field on a datasource outside the page's own Data folder belongs
//   to a shared component: writing it changes every page that uses it.
// - Images in rich text, or that match no field, are copy-only.
// ─────────────────────────────────────────────────────────────────────────────

/** An image field found on the page item or one of its datasources. */
export interface ImageField {
  /** "page" for the page item (written with updateFields), else the datasource item. */
  owner: "page" | "item";
  itemId: string;
  itemPath: string;
  field: string;
  value: string;
  mediaId: string;
  /** The media item's path under the media library, e.g. /Project/BrandX/Articles/hero (from mediaItem.mediaPath). */
  mediaPath: string | null;
  shared: boolean;
}

export type AltStatus = "missing" | "filename" | "ok";

export interface ImageTarget {
  src: string;
  /** The alt the page renders now. */
  alt: string | null;
  status: AltStatus;
  /** Where its alt can be written; null = copy-only. */
  field: ImageField | null;
}

/** The image fields in a set of field values (name → raw value). */
export function imageFieldsOf(
  values: Record<string, string>,
  owner: ImageField["owner"],
  item: { itemId: string; itemPath: string; shared: boolean },
): Array<Omit<ImageField, "mediaPath">> {
  const out: Array<Omit<ImageField, "mediaPath">> = [];
  for (const [field, value] of Object.entries(values)) {
    const mediaId = imageFieldMediaId(value ?? "");
    if (mediaId) out.push({ owner, ...item, field, value, mediaId });
  }
  return out;
}

/** A datasource that isn't under the page's own item (its Data folder) is shared with other pages. */
export function isSharedDatasource(datasourcePath: string, pagePath: string | null): boolean {
  if (!pagePath) return true;
  return !datasourcePath.toLowerCase().startsWith(`${pagePath.toLowerCase()}/`);
}

function pathOf(src: string): string {
  try {
    return decodeURIComponent(new URL(src, "https://x.invalid").pathname);
  } catch {
    return src;
  }
}

const withoutExtension = (p: string) => p.replace(/\.[a-z0-9]{2,5}$/i, "");

/** True when the image URL points at this media path (…/-/media/<path>.jpg or an Edge …/media/<path>.jpg). */
export function srcMatchesMediaPath(src: string, mediaPath: string): boolean {
  const path = withoutExtension(pathOf(src)).toLowerCase();
  const media = mediaPath.toLowerCase().replace(/\/+$/, "");
  // Exact equality covers the demo's plain /images/… paths; real media URLs always carry /media or /-/media.
  return media.length > 1 && (path === media || path.endsWith(`/media${media}`) || path.endsWith(`/-/media${media}`));
}

/** The file name without its extension. */
export function imageBaseName(src: string): string {
  return withoutExtension(pathOf(src).split("/").pop() ?? "");
}

/** Missing, a file name (e.g. "campaign-creators-pypeCEaJeZY-unsplash"), or fine. */
export function altStatus(alt: string | null, src: string): AltStatus {
  const a = (alt ?? "").trim();
  if (!a) return "missing";
  const base = imageBaseName(src).toLowerCase();
  if (a.toLowerCase() === base) return "filename";
  // One "word" joined by - or _, or a camera/stock name: not a description.
  if (!/\s/.test(a) && /[-_]/.test(a)) return "filename";
  if (/^(img|dsc|image|photo|pic)[-_ ]?\d+$/i.test(a)) return "filename";
  return "ok";
}

/** Each page image with the field it comes from (if any). Images that need work come first. */
export function matchImages(images: Array<{ src: string; alt: string | null }>, fields: ImageField[]): ImageTarget[] {
  const seen = new Set<string>();
  const targets: ImageTarget[] = [];
  for (const img of images) {
    if (!img.src || img.src.startsWith("data:") || seen.has(img.src)) continue;
    seen.add(img.src);
    const field = fields.find((f) => f.mediaPath && srcMatchesMediaPath(img.src, f.mediaPath)) ?? null;
    // The field's own alt is what the page renders when it has one.
    const alt = field ? imageFieldAlt(field.value) ?? img.alt : img.alt;
    targets.push({ src: img.src, alt, status: altStatus(alt, img.src), field });
  }
  const rank: Record<AltStatus, number> = { missing: 0, filename: 1, ok: 2 };
  return targets.sort((a, b) => rank[a.status] - rank[b.status]);
}
