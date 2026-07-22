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
  return new Response(new Uint8Array(obj.bytes), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
