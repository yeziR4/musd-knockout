import known from "@/data/avatars.json";
import { HANDLE_RE, avatarFor, normalizeHandle } from "@/lib/xprofile";

const KNOWN = known as Record<string, string>;

// Redirects to the real X profile picture; the CDN keeps the redirect for a day.
// Seated players resolve from the bundled list (the live lookup rate-limits bursts);
// anyone else falls back to the live lookup.
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = normalizeHandle((await params).handle);
  if (!HANDLE_RE.test(handle)) return new Response("bad handle", { status: 400 });
  const avatar = KNOWN[handle] ?? (await avatarFor(handle));
  if (!avatar) return new Response("not found", { status: 404, headers: { "cache-control": "s-maxage=60" } });
  return new Response(null, {
    status: 302,
    headers: { location: avatar, "cache-control": "s-maxage=86400, stale-while-revalidate=604800" },
  });
}
