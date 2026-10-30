import { HANDLE_RE, avatarFor, normalizeHandle } from "@/lib/xprofile";

// Redirects to the real X profile picture; the CDN keeps the redirect for a day.
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = normalizeHandle((await params).handle);
  if (!HANDLE_RE.test(handle)) return new Response("bad handle", { status: 400 });
  const avatar = await avatarFor(handle);
  if (!avatar) return new Response("not found", { status: 404, headers: { "cache-control": "s-maxage=600" } });
  return new Response(null, {
    status: 302,
    headers: { location: avatar, "cache-control": "s-maxage=86400, stale-while-revalidate=604800" },
  });
}
