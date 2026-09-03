import sharp from 'sharp';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 78;
const WEBP_QUALITY = 74;

/** Shrink image uploads while keeping a web-friendly format. */
export async function compressImageBuffer(
  input: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; ext?: string }> {
  const ct = (contentType || '').toLowerCase();
  if (!ct.startsWith('image/') || ct.includes('gif') || ct.includes('svg+xml')) {
    return { buffer: input, contentType };
  }

  const isHeic = ct.includes('heic') || ct.includes('heif');

  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width) {
      if (isHeic) {
        try {
          const buffer = await sharp(input, { failOn: 'none' })
            .rotate()
            .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
          return { buffer, contentType: 'image/webp', ext: 'webp' };
        } catch {
          return { buffer: input, contentType };
        }
      }
      return { buffer: input, contentType };
    }

    if (
      (meta.width && meta.width > MAX_DIMENSION) ||
      (meta.height && meta.height > MAX_DIMENSION)
    ) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Prefer WebP for photos (much smaller); keep PNG only when alpha needed
    if (ct.includes('png') && meta.hasAlpha) {
      const buffer = await pipeline
        .png({ compressionLevel: 9, effort: 7 })
        .toBuffer();
      return buffer.length < input.length
        ? { buffer, contentType: 'image/png', ext: 'png' }
        : { buffer: input, contentType };
    }

    const buffer = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
    if (buffer.length < input.length * 0.95) {
      return { buffer, contentType: 'image/webp', ext: 'webp' };
    }

    if (ct.includes('jpeg') || ct.includes('jpg') || isHeic) {
      const jpeg = await sharp(input, { failOn: 'none' })
        .rotate()
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      return jpeg.length < input.length
        ? { buffer: jpeg, contentType: 'image/jpeg', ext: 'jpg' }
        : { buffer: input, contentType };
    }
  } catch {
    /* keep original */
  }

  return { buffer: input, contentType };
}
