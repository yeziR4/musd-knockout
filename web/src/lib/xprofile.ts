import "server-only";

// X handle checks without an X API key.
// - Existence: X's own oEmbed endpoint (publish.x.com) answers 200 for real accounts and
//   404 for unknown ones, and has proven reliable.
// - Avatar: fxtwitter, best effort only (it intermittently reports real users as missing).

export const HANDLE_RE = /^[a-z0-9_]{1,15}$/;

export function normalizeHandle(input: string) {
  return input
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

const existsCache = new Map<string, { at: number; exists: boolean }>();
const avatarCache = new Map<string, { at: number; url: string | null }>();
const HOUR = 3_600_000;

async function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(8000) });
}

/** true = real account, false = X says it doesn't exist, null = couldn't tell right now. */
export async function existsOnX(handle: string): Promise<boolean | null> {
  const hit = existsCache.get(handle);
  if (hit && Date.now() - hit.at < (hit.exists ? HOUR : 2 * 60_000)) return hit.exists;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const target = encodeURIComponent(`https://x.com/${handle}`);
      const res = await get(`https://publish.x.com/oembed?url=${target}&omit_script=1`);
      if (res.status === 200 || res.status === 404) {
        const exists = res.status === 200;
        existsCache.set(handle, { at: Date.now(), exists });
        return exists;
      }
    } catch {
      // timeout or network blip: try again
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

export async function avatarFor(handle: string): Promise<string | null> {
  const hit = avatarCache.get(handle);
  if (hit && Date.now() - hit.at < (hit.url ? 24 * HOUR : 10 * 60_000)) return hit.url;
  let url: string | null = null;
  for (let attempt = 0; attempt < 3 && !url; attempt++) {
    try {
      const res = await get(`https://api.fxtwitter.com/${handle}`, {
        "user-agent": "Mozilla/5.0 (compatible; KnockoutJoin/1.0)",
      });
      if (res.status === 200) {
        const u = (await res.json().catch(() => null))?.user;
        const raw = String(u?.avatar_url ?? "");
        if (raw.startsWith("https://pbs.twimg.com/")) url = raw.replace("_normal.", "_200x200.");
      }
    } catch {
      // best effort
    }
    if (!url) await new Promise((r) => setTimeout(r, 300));
  }
  avatarCache.set(handle, { at: Date.now(), url });
  return url;
}
