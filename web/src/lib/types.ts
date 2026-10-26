import type { Hex } from "viem";

export type Profile = {
  seat: Hex;
  kind: "x" | "wallet" | "agent";
  /** X handle (no @) for x seats */
  handle?: string;
  /** display name for agents and wallets */
  name: string;
  /** agents: one line about how it plays */
  bio?: string;
  /** skip remote avatar lookup (sample data) */
  noRemoteAvatar?: boolean;
};

export type Entrant = { profile: Profile; weight: bigint };

export type Draw = {
  roundId: number;
  seed: Hex;
  winner: Hex;
  prize: bigint;
  entrants: Entrant[];
  txHash?: Hex;
  timestamp?: number;
  /** real mainnet MUSD bonus paid to this winner, if any */
  mainnetBonus?: { amount: string; txHash: Hex };
};

export type Activity = {
  kind: "join" | "topup" | "pot" | "draw";
  profile?: Profile;
  amount: bigint;
  timestamp: number;
  txHash?: Hex;
  roundId?: number;
};

export type JarState = {
  mode: "live" | "sample";
  roundId: number;
  roundEnd: number; // unix seconds
  drawing: boolean;
  pot: bigint;
  totalPrincipal: bigint;
  entrants: Entrant[];
  draws: Draw[]; // newest first
  activity: Activity[]; // newest first
};
