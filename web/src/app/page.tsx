"use client";

import { useEffect, useState } from "react";
import { BracketReplay } from "@/components/BracketReplay";
import { Logo } from "@/components/Logo";
import { JoinPanel } from "@/components/JoinPanel";
import { Fairness, Field, Roadmap, RoundCard, SectionHead, Winners } from "@/components/Sections";
import { JoinsTicker, NewsTicker } from "@/components/Ticker";
import { EXPLORER, JAR } from "@/lib/config";
import { useJar } from "@/lib/useJar";

const tabs = [
  { id: "live", label: "Live" },
  { id: "join", label: "Join" },
  { id: "winners", label: "Winners" },
  { id: "how", label: "How it works" },
  { id: "roadmap", label: "Roadmap" },
] as const;
type Tab = (typeof tabs)[number]["id"];

function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>("live");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as Tab;
      setTab(tabs.some((t) => t.id === h) ? h : "live");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (t: Tab) => {
    window.history.replaceState(null, "", `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  return [tab, go];
}

export default function Home() {
  const { state } = useJar();
  const [tab, go] = useTab();
  const activity = state?.activity ?? [];

  return (
    <div className="flex min-h-screen flex-col pb-9">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button onClick={() => go("live")} aria-label="Home">
            <Logo />
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition ${tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button onClick={() => go("join")} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-ink">
            Get a seat
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${tab === t.id ? "bg-ink text-white" : "text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <JoinsTicker activity={activity} />
      </header>

      {state?.mode === "sample" && (
        <div className="bg-accent-soft px-4 py-2 text-center text-xs text-accent">Preview with sample players.</div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        {tab === "live" && (
          <div className="space-y-10">
            <section className="grid items-center gap-10 md:grid-cols-[1.15fr_1fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 font-mono text-xs text-muted">
                  Built on Mezo · MUSD
                </p>
                <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                  Save MUSD.
                  <br />
                  Survive the <span className="text-accent">bracket</span>.
                </h1>
                <p className="mt-5 max-w-lg text-lg text-muted">
                  Everyone in the jar enters a knockout bracket. One champion takes the pot. Everyone else keeps every MUSD they
                  put in.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => go("join")} className="rounded-full bg-accent px-6 py-3 font-medium text-white transition hover:bg-ink">
                    Join with X
                  </button>
                  <button onClick={() => go("join")} className="rounded-full border border-ink px-6 py-3 font-medium transition hover:bg-ink hover:text-white">
                    Join with wallet
                  </button>
                </div>
                <p className="mt-4 text-sm text-muted">Free ticket with your X handle, or bring your own MUSD. Humans and AI agents welcome.</p>
              </div>
              {state ? <RoundCard state={state} /> : <div className="h-[400px] animate-pulse rounded-2xl bg-ink/90" />}
            </section>

            <section className="grid min-w-0 gap-4">
              {state?.draws[0] ? (
                <BracketReplay draw={state.draws[0]} />
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line bg-card/50 p-6 text-center">
                  <p className="font-semibold">{state ? "The first bracket plays when round #1 closes." : "Loading…"}</p>
                  <p className="text-sm text-muted">It replays here round by round: watch players get knocked out until one is left.</p>
                </div>
              )}
              {state && <Field entrants={state.entrants} total={state.totalPrincipal} />}
            </section>
          </div>
        )}

        {tab === "join" && (
          <>
            <SectionHead kicker="Get a seat" title="Three ways in. One needs nothing at all.">
              Type your X handle for a free ticket, deposit your own MUSD, or send an agent. Your deposit always comes back.
            </SectionHead>
            <JoinPanel />
          </>
        )}

        {tab === "winners" && (
          <>
            <SectionHead kicker="Wall of winners" title="Champions so far" />
            {state && <Winners draws={state.draws} />}
          </>
        )}

        {tab === "how" && (
          <>
            <SectionHead kicker="How it works" title="Fun on top, boring where it matters">
              Each match is weighted by stack size and the winner absorbs the loser&apos;s stack, so your chance of winning it all
              is exactly your share of the jar.
            </SectionHead>
            <Fairness />
          </>
        )}

        {tab === "roadmap" && (
          <>
            <SectionHead kicker="Roadmap" title="Where the bracket goes next" />
            <Roadmap />
          </>
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-6 text-xs text-muted sm:px-6">
        <span>Mezo testnet · unaudited · test MUSD only</span>
        {JAR && (
          <a href={`${EXPLORER}/address/${JAR}`} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">
            contract {JAR.slice(0, 6)}…{JAR.slice(-4)} ↗
          </a>
        )}
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-20">
        <NewsTicker activity={activity} />
      </div>
    </div>
  );
}
