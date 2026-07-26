#!/bin/bash
# Compress Frebys product (and related) images in place with ImageMagick.
# Keeps filenames so DB URLs stay valid. Skips files already under ~180KB.
set -euo pipefail

ROOT="${1:-/data/coolify/frebys/storage}"
MAX_DIM=1600
QUALITY=78
MIN_BYTES=180000

echo "Compressing under: $ROOT"
before=$(du -sb "$ROOT" | awk '{print $1}')
count=0
saved=0

while IFS= read -r -d '' f; do
  size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if [[ "$size" -lt "$MIN_BYTES" ]]; then
    continue
  fi
  tmp="${f}.tmp.jpg"
  if convert "$f" -auto-orient -resize "${MAX_DIM}x${MAX_DIM}>" -strip -quality "$QUALITY" "$tmp" 2>/dev/null; then
    newsize=$(stat -c%s "$tmp" 2>/dev/null || echo 0)
    if [[ "$newsize" -gt 0 && "$newsize" -lt $((size * 92 / 100)) ]]; then
      # Overwrite original bytes; keep original extension for URL stability
      mv -f "$tmp" "$f"
      meta="${f}.meta.json"
      echo '{"contentType":"image/jpeg"}' > "$meta" || true
      count=$((count + 1))
      saved=$((saved + size - newsize))
      if (( count % 25 == 0 )); then
        echo "… $count files, saved $((saved / 1024 / 1024)) MB"
      fi
    else
      rm -f "$tmp"
    fi
  else
    rm -f "$tmp"
  fi
done < <(find "$ROOT" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) ! -name '*.meta.json' -print0)

after=$(du -sb "$ROOT" | awk '{print $1}')
echo "Done. Compressed $count files."
echo "Folder size: $((before/1024/1024)) MB -> $((after/1024/1024)) MB (saved $(((before-after)/1024/1024)) MB)"
