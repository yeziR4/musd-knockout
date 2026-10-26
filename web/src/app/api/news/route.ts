// Latest Mezo blog headlines for the news ticker, from mezo.org's public RSS feed.

export const revalidate = 1800;

type Item = { title: string; url: string; date: string };

function pick(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : "";
}

export async function GET() {
  try {
    const res = await fetch("https://mezo.org/blog/rss/", { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(String(res.status));
    const xml = await res.text();
    const items: Item[] = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((m) => ({
      title: pick(m[1], "title"),
      url: pick(m[1], "link"),
      date: pick(m[1], "pubDate"),
    }));
    return Response.json(items.filter((i) => i.title && i.url.startsWith("https://mezo.org/")));
  } catch {
    return Response.json([]);
  }
}
