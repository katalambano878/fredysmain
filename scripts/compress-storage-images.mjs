/**
 * One-shot: compress images under STORAGE_ROOT (or argv path) to WebP in place.
 * Usage: node scripts/compress-storage-images.mjs [/path/to/storage]
 */
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = process.argv[2] || process.env.STORAGE_ROOT || './.storage';
const MAX = 1600;
const QUALITY = 74;
const MIN_BYTES = 180_000; // skip already-small files

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

async function compressOne(file) {
  const ext = path.extname(file).toLowerCase();
  if (!EXT.has(ext)) return null;
  if (file.endsWith('.meta.json')) return null;

  const stat = await fs.stat(file);
  if (stat.size < MIN_BYTES) return null;

  const input = await fs.readFile(file);
  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width) return null;

  if (meta.width > MAX || (meta.height || 0) > MAX) {
    pipeline = pipeline.resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
  }

  const out = await pipeline.webp({ quality: QUALITY }).toBuffer();
  if (out.length >= stat.size * 0.92) return null;

  // Keep original path/extension so DB URLs keep working; rewrite bytes as webp
  // only when extension is already .webp. For jpg/png, write sibling .webp and
  // overwrite original with smaller jpeg/webp of same extension when possible.
  if (ext === '.webp') {
    await fs.writeFile(file, out);
    return { file, before: stat.size, after: out.length };
  }

  // Overwrite jpeg/png with re-encoded jpeg (same path) so URLs stay valid
  const jpeg = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();

  if (jpeg.length >= stat.size * 0.92) return null;
  await fs.writeFile(file, jpeg);
  const metaPath = file + '.meta.json';
  try {
    await fs.writeFile(metaPath, JSON.stringify({ contentType: 'image/jpeg' }));
  } catch {
    /* ignore */
  }
  return { file, before: stat.size, after: jpeg.length };
}

async function main() {
  console.log('Compressing images under', ROOT);
  let saved = 0;
  let count = 0;
  for await (const file of walk(ROOT)) {
    try {
      const r = await compressOne(file);
      if (!r) continue;
      count += 1;
      saved += r.before - r.after;
      if (count % 25 === 0) {
        console.log(`… ${count} files, saved ${(saved / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch (e) {
      console.warn('skip', file, e.message);
    }
  }
  console.log(`Done. Compressed ${count} files, saved ${(saved / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
