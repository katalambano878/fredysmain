import { readObject } from "@/lib/db/storage";

// Avoid force-dynamic — Next would emit Cache-Control: no-store and defeat
// browser caching of large product images.
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const obj = await readObject(bucket, objectPath);
  if (!obj) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Only pictures, videos and PDFs are shown in the browser. Anything else (an HTML page
  // someone managed to store, say) is handed over as a download and never runs on this site.
  const type = String(obj.contentType || "").toLowerCase().split(";")[0].trim();
  const inline = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime)|application\/pdf)$/.test(type);
  return new Response(new Uint8Array(obj.bytes), {
    status: 200,
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      ...(inline ? {} : { "Content-Disposition": "attachment" }),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
