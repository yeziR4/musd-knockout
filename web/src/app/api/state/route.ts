import { readJar } from "@/lib/chain";
import { toJson } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readJar();
    if (!state) return new Response("null", { headers: { "content-type": "application/json" } });
    return new Response(toJson(state), {
      headers: { "content-type": "application/json", "cache-control": "s-maxage=15, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("state read failed", err);
    return new Response(JSON.stringify({ error: "chain read failed" }), { status: 502 });
  }
}
