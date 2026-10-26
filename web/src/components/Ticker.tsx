"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "@/lib/config";
import { ago, musd } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { Avatar } from "./Avatar";

/** Scrolling terminal strip. Items are duplicated so the loop is seamless. */
function Strip({ label, tone, children }: { label: string; tone: "dark" | "light"; children: React.ReactNode[] }) {
  const dark = tone === "dark";
  return (
    <div className={`flex h-9 items-center overflow-hidden font-mono text-xs ${dark ? "bg-ink text-white" : "border-t border-line bg-card text-ink"}`}>
      <span className={`z-10 flex h-full shrink-0 items-center gap-2 px-3 font-semibold uppercase tracking-wider ${dark ? "bg-accent" : "bg-ink text-white"}`}>
        {dark && <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />}
        {label}
      </span>
      {children.length === 0 ? (
        <span className={`px-4 ${dark ? "text-white/50" : "text-muted"}`}>waiting for the first event…</span>
      ) : (
        <div className="ticker-track flex shrink-0 items-center" style={{ animationDuration: `${Math.max(30, children.length * 7)}s` }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {children.map((c, i) => (
                <span key={i} className="flex shrink-0 items-center gap-2 px-5">
                  {c}
                  <span className={dark ? "text-white/25" : "text-line"}>◆</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const verb: Record<Activity["kind"], string> = {
  join: "joined with",
  topup: "topped up",
  pot: "pot +",
  draw: "WON",
};

export function JoinsTicker({ activity }: { activity: Activity[] }) {
  const items = activity
    .filter((a) => a.kind === "join" || a.kind === "topup")
    .map((a, i) => (
      <a key={i} href={a.txHash ? `${EXPLORER}/tx/${a.txHash}` : undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-accent">
        {a.profile && <Avatar profile={a.profile} size={18} />}
        <span className="font-semibold">{a.profile?.name ?? "someone"}</span>
        <span className="text-white/60">{verb[a.kind]}</span>
        <span className="text-accent">{musd(a.amount, 0)} MUSD</span>
        <span className="text-white/40">{ago(a.timestamp)}</span>
      </a>
    ));
  return (
    <Strip label="Joined" tone="dark">
      {items}
    </Strip>
  );
}

type News = { title: string; url: string };

export function NewsTicker({ activity }: { activity: Activity[] }) {
  const [news, setNews] = useState<News[]>([]);
  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then(setNews)
      .catch(() => setNews([]));
  }, []);

  const ours = activity
    .filter((a) => a.kind === "draw" || a.kind === "pot")
    .slice(0, 6)
    .map((a, i) => (
      <a key={`k${i}`} href={a.txHash ? `${EXPLORER}/tx/${a.txHash}` : undefined} target="_blank" rel="noreferrer" className="hover:text-accent">
        <span className="font-semibold text-accent">KNOCKOUT</span>{" "}
        {a.kind === "draw"
          ? `${a.profile?.name ?? "A player"} wins round #${a.roundId}: +${musd(a.amount)} MUSD`
          : `Pot topped up +${musd(a.amount)} MUSD`}
      </a>
    ));
  const mezo = news.map((n, i) => (
    <a key={`m${i}`} href={n.url} target="_blank" rel="noreferrer" className="hover:text-accent">
      <span className="font-semibold">MEZO</span> {n.title}
    </a>
  ));
  // interleave ours with ecosystem headlines
  const items: React.ReactNode[] = [];
  for (let i = 0; i < Math.max(ours.length, mezo.length); i++) {
    if (ours[i]) items.push(ours[i]);
    if (mezo[i]) items.push(mezo[i]);
  }
  return (
    <Strip label="News" tone="light">
      {items}
    </Strip>
  );
}
