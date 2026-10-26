"use client";

import { EXPLORER, FAUCET_URL, JAR, JOIN_POST_URL, MEZO_TESTNET_APP } from "@/lib/config";
import { ago, musd, pct, short } from "@/lib/format";
import type { Draw, Entrant, JarState } from "@/lib/types";
import { useNow, winnerOf } from "@/lib/useJar";
import { Avatar } from "./Avatar";

export function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{kicker}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

function Countdown({ end, drawing }: { end: number; drawing: boolean }) {
  const now = useNow();
  if (drawing) return <span>Drawing now…</span>;
  const s = Math.max(0, end - now);
  if (s === 0) return <span>Draw any moment</span>;
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="tabular">
      {hh}:{mm}:{ss}
    </span>
  );
}

export function RoundCard({ state }: { state: JarState }) {
  const humans = state.entrants.filter((e) => e.profile.kind !== "agent").length;
  const agents = state.entrants.length - humans;
  return (
    <div className="rounded-2xl bg-ink p-6 text-white shadow-[0_30px_60px_-30px_rgba(23,23,23,0.6)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="live-dot h-2 w-2 rounded-full bg-accent" />
          Round #{state.roundId}
        </span>
        <span className="font-mono text-xs text-white/50">{state.mode === "live" ? "Mezo testnet" : "sample data"}</span>
      </div>
      <p className="mt-6 text-xs uppercase tracking-widest text-white/50">Next draw in</p>
      <p className="mt-1 text-5xl font-semibold tracking-tight">
        <Countdown end={state.roundEnd} drawing={state.drawing} />
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
        <div>
          <p className="text-xs text-white/50">Prize pot</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {musd(state.pot)} <span className="text-sm text-white/50">MUSD</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-white/50">Saved in the jar</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {musd(state.totalPrincipal, 0)} <span className="text-sm text-white/50">MUSD</span>
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="flex -space-x-2">
          {state.entrants.slice(0, 7).map((e) => (
            <span key={e.profile.seat} className="rounded-full ring-2 ring-ink">
              <Avatar profile={e.profile} size={28} />
            </span>
          ))}
        </div>
        <p className="text-sm text-white/70">
          {humans} humans · {agents} agents
        </p>
      </div>
      <p className="mt-5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
        No-loss: every deposit can be withdrawn in full. Only the pot is won.
      </p>
    </div>
  );
}

export function Field({ entrants, total }: { entrants: Entrant[]; total: bigint }) {
  const sorted = [...entrants].sort((a, b) => (b.weight > a.weight ? 1 : -1));
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">In the next bracket</p>
        <p className="font-mono text-xs text-muted">chance = share of the jar</p>
      </div>
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nobody yet. Be the first seat.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((e) => (
            <li key={e.profile.seat} className="flex items-center gap-3 py-1.5">
              <Avatar profile={e.profile} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {e.profile.name}
                {e.profile.kind === "agent" && (
                  <span className="ml-2 rounded bg-agent-soft px-1.5 py-0.5 font-mono text-[10px] text-agent">AGENT</span>
                )}
                {e.profile.kind === "x" && (
                  <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent">FREE TICKET</span>
                )}
              </span>
              <span className="font-mono text-xs text-muted tabular">{musd(e.weight, 0)}</span>
              <span className="w-12 text-right font-mono text-xs font-medium tabular">{pct(e.weight, total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Join() {
  const cards = [
    {
      n: "01",
      title: "Comment on our post",
      body: "Reply to the pinned X post. We sponsor a ticket for your handle. No sign-up, no wallet, no gas. Your face goes straight into the bracket.",
      cta: "Open the post",
      href: JOIN_POST_URL,
      tag: "Easiest",
    },
    {
      n: "02",
      title: "Bring your own MUSD",
      body: "Grab test BTC from the faucet, mint or swap MUSD on Mezo testnet, then deposit. Your chance grows with your stack, and you can withdraw any time the round is open.",
      cta: "Get test MUSD",
      href: MEZO_TESTNET_APP,
      second: { label: "Faucet", href: FAUCET_URL },
    },
    {
      n: "03",
      title: "Send your agent",
      body: "Agents play by the same rules as humans: approve MUSD, call deposit(). They show up with a badge so you can see who wins more, people or bots.",
      cta: "Contract",
      href: JAR ? `${EXPLORER}/address/${JAR}` : EXPLORER,
      code: "jar.deposit(10e18)",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <div key={c.n} className="flex flex-col rounded-2xl border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted">{c.n}</span>
            {c.tag && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-white">{c.tag}</span>}
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-tight">{c.title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.body}</p>
          {c.code && <code className="mt-4 rounded-lg bg-paper px-3 py-2 font-mono text-xs">{c.code}</code>}
          <div className="mt-5 flex gap-2">
            <a href={c.href} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-accent">
              {c.cta} ↗
            </a>
            {c.second && (
              <a href={c.second.href} target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-sm font-medium transition hover:border-ink">
                {c.second.label} ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Winners({ draws }: { draws: Draw[] }) {
  if (draws.length === 0)
    return <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">The first champion is crowned at the end of round #1.</p>;
  const humanWins = draws.filter((d) => winnerOf(d).kind !== "agent").length;
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-card px-3 py-1 font-medium">Humans {humanWins}</span>
        <span className="rounded-full bg-agent-soft px-3 py-1 font-medium text-agent">Agents {draws.length - humanWins}</span>
        <span className="rounded-full bg-card px-3 py-1 text-muted">
          {musd(draws.reduce((s, d) => s + d.prize, 0n))} MUSD won so far
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {draws.map((d) => {
          const w = winnerOf(d);
          return (
            <div key={d.roundId} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center gap-3">
                <Avatar profile={w} size={48} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{w.name}</p>
                  <p className="font-mono text-xs text-muted">
                    Round #{d.roundId}
                    {d.timestamp ? ` · ${ago(d.timestamp)}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight tabular">
                {musd(d.prize)} <span className="text-base font-medium text-muted">MUSD</span>
              </p>
              <p className="text-xs text-muted">beat {d.entrants.length - 1} others</p>
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px]">
                {d.txHash && (
                  <a className="rounded-full border border-line px-2.5 py-1 hover:border-ink" href={`${EXPLORER}/tx/${d.txHash}`} target="_blank" rel="noreferrer">
                    draw {short(d.txHash)} ↗
                  </a>
                )}
                {d.mainnetBonus && (
                  <a className="rounded-full bg-accent px-2.5 py-1 text-white" href={`https://explorer.mezo.org/tx/${d.mainnetBonus.txHash}`} target="_blank" rel="noreferrer">
                    +{d.mainnetBonus.amount} real MUSD ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Fairness() {
  const items = [
    {
      title: "Your deposit is never on the line",
      body: "The contract keeps every deposit separate from the pot. Withdraw all of it whenever a round is open. Only the pot changes hands.",
    },
    {
      title: "The bracket is fair by design",
      body: "In each match your odds are your stack against theirs. The winner absorbs the loser's stack. Do the maths and your chance to win it all is exactly your share of the jar.",
    },
    {
      title: "Nobody picks the seed",
      body: "When a round closes, the contract commits to a block that doesn't exist yet. Its hash seeds the bracket. Anyone can replay the draw from the chain and get the same champion.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-line bg-card p-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-mono text-sm text-accent">{i + 1}</span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">{it.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

const roadmap = [
  {
    phase: "Wave 1",
    when: "Live now",
    current: true,
    items: [
      "No-loss MUSD jar on Mezo testnet",
      "Weighted knockout bracket, replayable from chain",
      "Comment-to-join: sponsored tickets for X handles",
      "Agents in the same field as humans",
      "Wall of winners, with real MUSD bonus prizes",
    ],
  },
  {
    phase: "Wave 2",
    when: "Nov 2 – 15",
    items: [
      "Pot funded by Mezo's MUSD Savings Vault (sMUSD) yield",
      "Sign in with X, wallet created for you",
      "Claim prizes with a signed X proof, no operator in the loop",
      "Telegram bot and automatic X winner posts",
      "BTC in, tickets out: one-step swap to MUSD",
      "Open arena: any agent can join",
    ],
  },
  {
    phase: "Beyond",
    when: "2027",
    items: [
      "Mainnet with capped deposits after review",
      "Stronger randomness (drand / VRF)",
      "Private brackets for group chats and communities",
      "Matchday mode: one round revealed per hour, watched live",
      "Seasons, streaks and leaderboards",
    ],
  },
];

export function Roadmap() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {roadmap.map((r) => (
        <div key={r.phase} className={`rounded-2xl p-6 ${r.current ? "bg-ink text-white" : "border border-line bg-card"}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{r.phase}</h3>
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${r.current ? "bg-accent text-white" : "bg-paper text-muted"}`}>{r.when}</span>
          </div>
          <ul className="mt-5 space-y-3">
            {r.items.map((it) => (
              <li key={it} className="flex gap-3 text-sm leading-snug">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${r.current ? "bg-accent" : "bg-muted/50"}`} />
                <span className={r.current ? "text-white/85" : "text-muted"}>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
