"use client";

import { useEffect, useState } from "react";
import { playBracket } from "./bracket";
import { sampleState } from "./sample";
import { fromJson } from "./serialize";
import type { Draw, JarState } from "./types";

export function winnerOf(d: Draw) {
  const res = playBracket(
    d.seed,
    d.entrants.map((e) => e.weight),
  );
  return d.entrants[res.winner].profile;
}

const sample = () => sampleState(winnerOf);

export function useJar(pollMs = 15_000) {
  const [state, setState] = useState<JarState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        if (!alive) return;
        setState(text === "null" ? sample() : fromJson(text));
        setError(false);
      } catch {
        if (!alive) return;
        setError(true);
        setState((s) => s ?? sample());
      }
    }
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return { state, error };
}

export function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}
