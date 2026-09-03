/** Browser-side shrink for phone camera photos before upload. Skips HEIC (server handles). */
export async function prepareImageForUpload(
  file: File,
  opts?: { maxDimension?: number; quality?: number }
): Promise<File> {
  const maxDimension = opts?.maxDimension ?? 1600;
  const quality = opts?.quality ?? 0.82;
  const name = file.name || 'photo.jpg';
  const type = (file.type || '').toLowerCase();
  const isHeic =
    type.includes('heic') ||
    type.includes('heif') ||
    /\.heic$/i.test(name) ||
    /\.heif$/i.test(name);
  const looksImage =
    type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(name);

  if (!looksImage || isHeic || type.includes('gif') || type.includes('svg')) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    // Already small enough — keep original if under ~1.5MB
    if (scale >= 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const preferJpeg = type.includes('png') ? false : true;
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(
        resolve,
        preferJpeg ? 'image/jpeg' : 'image/webp',
        quality
      )
    );
    if (!blob || blob.size >= file.size * 0.98) return file;

    const outName = name.replace(/\.[^.]+$/, preferJpeg ? '.jpg' : '.webp');
    return new File([blob], outName, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
