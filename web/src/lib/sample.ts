import { keccak256, toHex, type Hex } from "viem";
import type { Draw, Entrant, JarState, Profile } from "./types";

// Shown only until NEXT_PUBLIC_JAR_ADDRESS is set. Every name is invented, and the
// page labels this mode as sample data.

const people: [string, number][] = [
  ["sats_and_chill", 120],
  ["hodl_hannah", 60],
  ["orange_pill_ola", 250],
  ["blockbuilder_k", 40],
  ["musd_maxi", 90],
  ["lagos_ledger", 30],
  ["cold_wallet_cam", 75],
  ["degen_dami", 15],
  ["stack_sensei", 180],
  ["mempool_mia", 50],
  ["trove_tobi", 110],
  ["keys_not_coins", 25],
];

const agents: [string, string, number][] = [
  ["Saver-01", "Deposits every hour, never withdraws.", 200],
  ["Momentum", "Tops up after every loss.", 80],
  ["Coinflip", "Enters with a random amount each round.", 45],
  ["Whale-ish", "One big stack, sits tight.", 400],
];

function seat(label: string): Hex {
  return keccak256(toHex(`sample:${label}`));
}

const e18 = 10n ** 18n;

export const sampleEntrants: Entrant[] = [
  ...people.map(([handle, w]): Entrant => ({
    profile: { seat: seat(handle), kind: "x", handle, name: `@${handle}`, noRemoteAvatar: true },
    weight: BigInt(w) * e18,
  })),
  ...agents.map(([name, bio, w]): Entrant => ({
    profile: { seat: seat(name), kind: "agent", name, bio },
    weight: BigInt(w) * e18,
  })),
];

function pastDraw(roundId: number, prize: number, hoursAgo: number, drop: number): Draw {
  const entrants = sampleEntrants.slice(0, sampleEntrants.length - drop);
  const seed = keccak256(toHex(`sample-round-${roundId}`));
  return {
    roundId,
    seed,
    winner: "0x" as Hex, // resolved by the bracket replay below
    prize: BigInt(prize) * e18,
    entrants,
    timestamp: Math.floor(Date.now() / 1000) - hoursAgo * 3600,
  };
}

export function sampleState(resolveWinner: (d: Draw) => Profile): JarState {
  const draws = [pastDraw(3, 42, 2, 0), pastDraw(2, 35, 8, 3), pastDraw(1, 20, 14, 6)].map((d) => ({
    ...d,
    winner: resolveWinner(d).seat,
  }));
  return {
    mode: "sample",
    roundId: 4,
    roundEnd: Math.floor(Date.now() / 1000) + 4 * 3600 + 17 * 60,
    drawing: false,
    pot: 38n * e18,
    totalPrincipal: sampleEntrants.reduce((s, e) => s + e.weight, 0n),
    entrants: sampleEntrants,
    draws,
    activity: [],
  };
}
