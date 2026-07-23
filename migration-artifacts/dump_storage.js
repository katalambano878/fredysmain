#!/usr/bin/env node
/**
 * Download storage objects for Frebys into migration-artifacts/storage.
 * Paginates with offset (Supabase list limit 1000).
 * Usage: node migration-artifacts/dump_storage.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function loadEnv() {
  const env = { ...process.env };
  for (const name of [".env.local", "env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!(k in env) || !env[k]) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = path.join(__dirname, "storage");
const BUCKETS = [
  "product-images",
  "cms-images",
  "category-images",
  "site-media",
  "blog-covers",
  "receipts",
  "avatars",
  "blog-images",
  "review-images",
  "banners",
];
const CONCURRENCY = 8;

async function listPage(bucket, prefix, offset) {
  const res = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 1000, offset }),
  });
  if (!res.ok) {
    console.log(`list fail ${bucket} offset=${offset}: ${res.status}`);
    return null;
  }
  return res.json();
}

async function listAll(bucket, prefix = "") {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await listPage(bucket, prefix, offset);
    if (!page) return null;
    if (!page.length) break;
    all.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function download(bucket, objectPath) {
  const dest = path.join(OUT, bucket, objectPath);
  if (fs.existsSync(dest) && fs.existsSync(dest + ".meta.json")) {
    return "skip";
  }
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${objectPath}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) {
    console.log(`  FAIL ${bucket}/${objectPath}: ${res.status}`);
    return "fail";
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  fs.writeFileSync(dest + ".meta.json", JSON.stringify({ contentType: ct }));
  return "ok";
}

async function mapPool(items, limit, fn) {
  let i = 0;
  let ok = 0;
  let fail = 0;
  let skip = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const r = await fn(items[idx], idx);
      if (r === "ok") ok++;
      else if (r === "fail") fail++;
      else skip++;
      if ((ok + fail + skip) % 50 === 0) {
        console.log(`  progress ${ok + fail + skip}/${items.length} (ok=${ok} skip=${skip} fail=${fail})`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return { ok, fail, skip };
}

async function walk(bucket, prefix = "") {
  const items = await listAll(bucket, prefix);
  if (items === null) {
    console.log(`bucket ${bucket}: not found / inaccessible`);
    return;
  }
  const folders = [];
  const files = [];
  for (const item of items) {
    const name = item.name;
    if (!name) continue;
    const full = prefix ? `${prefix}/${name}` : name;
    if (item.id === null || item.metadata === null) folders.push(full);
    else files.push(full);
  }
  console.log(`bucket ${bucket}${prefix ? "/" + prefix : ""}: ${files.length} files, ${folders.length} folders`);
  if (files.length) {
    const stats = await mapPool(files, CONCURRENCY, (objectPath) => download(bucket, objectPath));
    console.log(`  done files ok=${stats.ok} skip=${stats.skip} fail=${stats.fail}`);
  }
  for (const folder of folders) {
    await walk(bucket, folder);
  }
}

async function main() {
  if (!URL_ || !KEY) throw new Error("Missing Supabase env");
  fs.mkdirSync(OUT, { recursive: true });
  for (const b of BUCKETS) {
    console.log(`\n=== bucket ${b} ===`);
    await walk(b);
  }
  console.log("DONE", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
