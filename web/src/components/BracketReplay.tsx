"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playBracket, roundName, type Match, type Side } from "@/lib/bracket";
import { EXPLORER } from "@/lib/config";
import { musd, pct, short } from "@/lib/format";
import type { Draw, Entrant } from "@/lib/types";
import { Avatar } from "./Avatar";

const ROUND_MS = 1700;
const TREE_ROUNDS = 3; // quarterfinals onward get the full tree

export function BracketReplay({ draw }: { draw: Draw }) {
  const result = useMemo(
    () =>
      playBracket(
        draw.seed,
        draw.entrants.map((e) => e.weight),
      ),
    [draw],
  );
  const total = useMemo(() => draw.entrants.reduce((s, e) => s + e.weight, 0n), [draw]);
  const R = result.rounds.length;

  const [step, setStep] = useState(0); // rounds revealed
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // Start the replay the first time the bracket scrolls into view.
  useEffect(() => {
    setStep(0);
    started.current = false;
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [draw.seed]);

  useEffect(() => {
    if (!playing) return;
    if (step >= R) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 600 : ROUND_MS);
    return () => clearTimeout(t);
  }, [playing, step, R]);

  const champion = draw.entrants[result.winner];
  const done = step >= R;
  const treeFrom = Math.max(0, R - TREE_ROUNDS);
  const alive = draw.entrants.filter((_, i) => result.outIn[i] >= step).length;
  const status = done
    ? "Champion decided"
    : step === 0
      ? `${draw.entrants.length} players · tap play`
      : `${roundName(step - 1, R)} done · ${alive} left`;

  return (
    <div ref={box} className="min-w-0 rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Round #{draw.roundId} bracket</p>
          <p className="truncate font-mono text-xs text-muted">{status}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent"
          >
            {step === 0 && !playing ? "Play" : "Replay"}
          </button>
          {!done && (
            <button
              onClick={() => {
                setPlaying(false);
                setStep(R);
              }}
              className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-ink"
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* Round progress */}
      <ol className="flex gap-1 px-4 pt-4 sm:px-6" aria-label="Rounds">
        {result.rounds.map((_, r) => (
          <li key={r} className="flex-1">
            <div className={`h-1 rounded-full transition-colors duration-500 ${r < step ? "bg-accent" : "bg-line"}`} />
            <p className={`mt-1.5 hidden text-[11px] sm:block ${r < step ? "text-ink" : "text-muted"}`}>
              {roundName(r, R)}
            </p>
          </li>
        ))}
      </ol>

      {/* The whole field, greying out as players are knocked out */}
      <div className="px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {draw.entrants.map((e, i) => {
            const out = result.outIn[i] < step;
            const isChamp = done && i === result.winner;
            return (
              <Avatar key={e.profile.seat} profile={e.profile} size={34} dim={out} ring={isChamp} />
            );
          })}
        </div>
      </div>

      {/* Tree for the last rounds */}
      <div className="overflow-x-auto px-4 py-5 sm:px-6">
        <div className="flex min-w-[760px] gap-4">
          {result.rounds.slice(treeFrom).map((matches, k) => {
            const r = treeFrom + k;
            return (
              <div key={r} className="flex min-w-0 flex-1 flex-col">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">{roundName(r, R)}</p>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {matches.map((m, i) => (
                    <MatchCard
                      key={i}
                      match={m}
                      entrants={draw.entrants}
                      known={step >= r}
                      decided={step > r}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Champion</p>
            <div className="flex flex-1 items-center">
              {done ? (
                <div className="pop-in w-full rounded-xl bg-ink p-4 text-white">
                  <div className="flex items-center gap-3">
                    <Avatar profile={champion.profile} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{champion.profile.name}</p>
                      <p className="text-xs text-white/60">had a {pct(champion.weight, total)} chance</p>
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular">
                    +{musd(draw.prize)} <span className="text-sm font-medium text-white/60">MUSD</span>
                  </p>
                </div>
              ) : (
                <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
                  ?
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 font-mono text-[11px] text-muted sm:px-6">
        <span>seed {short(draw.seed, 6)}</span>
        {draw.txHash && (
          <a className="underline-offset-2 hover:text-ink hover:underline" href={`${EXPLORER}/tx/${draw.txHash}`} target="_blank" rel="noreferrer">
            draw tx {short(draw.txHash)} ↗
          </a>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  entrants,
  known,
  decided,
}: {
  match: Match;
  entrants: Entrant[];
  known: boolean;
  decided: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <Row side={match.a} entrants={entrants} known={known} state={!decided ? "open" : match.winner === "a" ? "won" : "lost"} chance={match.chanceA} />
      <div className="h-px bg-line" />
      <Row side={match.b} entrants={entrants} known={known} state={!decided ? "open" : match.winner === "b" ? "won" : "lost"} chance={1 - match.chanceA} />
    </div>
  );
}

function Row({
  side,
  entrants,
  known,
  state,
  chance,
}: {
  side: Side;
  entrants: Entrant[];
  known: boolean;
  state: "open" | "won" | "lost";
  chance: number;
}) {
  if (!known) return <div className="h-9 bg-paper/50 px-2.5 py-2 text-xs text-muted/60">—</div>;
  if (!side) return <div className="h-9 px-2.5 py-2 text-xs text-muted">bye</div>;
  const e = entrants[side.index];
  return (
    <div
      className={`flex h-9 items-center gap-2 px-2.5 transition-all duration-500 ${
        state === "won" ? "bg-accent-soft" : ""
      } ${state === "lost" ? "opacity-35" : ""}`}
    >
      <Avatar profile={e.profile} size={20} />
      <span className={`min-w-0 flex-1 truncate text-xs ${state === "lost" ? "line-through" : ""} ${state === "won" ? "font-semibold" : ""}`}>
        {e.profile.name}
      </span>
      <span className="font-mono text-[10px] text-muted tabular">{Math.round(chance * 100)}%</span>
    </div>
  );
}
