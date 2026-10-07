const PUBLIC_OBJECT = '/storage/v1/object/public/';
const PUBLIC_RENDER = '/storage/v1/render/image/public/';
const LEGACY_SUPABASE_STORAGE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\//i;

/**
 * Rewrites legacy hosted-Supabase storage links to this site's own storage,
 * where the migrated files now live.
 */
export function normalizeStorageUrl(url: string, siteOrigin: string): string {
  if (!url) return url;
  const origin = siteOrigin.replace(/\/+$/, '');
  if (LEGACY_SUPABASE_STORAGE.test(url)) {
    return url.replace(LEGACY_SUPABASE_STORAGE, `${origin}/storage/`);
  }
  if (url.startsWith(PUBLIC_OBJECT)) return `${origin}${url}`;
  return url;
}

/** Resized WebP variant of a public storage image; other URLs are returned unchanged. */
export function storageImageUrl(url: string, width: number, quality = 72): string {
  if (!url || !url.includes(PUBLIC_OBJECT)) return url;
  const resized = url.replace(PUBLIC_OBJECT, PUBLIC_RENDER);
  const sep = resized.includes('?') ? '&' : '?';
  return `${resized}${sep}width=${width}&quality=${quality}`;
}

/** `srcSet` string of resized variants for a public storage image, or undefined. */
export function storageImageSrcSet(url: string, widths: number[], quality = 72): string | undefined {
  if (!url || !url.includes(PUBLIC_OBJECT)) return undefined;
  return widths.map((w) => `${storageImageUrl(url, w, quality)} ${w}w`).join(', ');
}
