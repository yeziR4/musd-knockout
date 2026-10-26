import { encodeAbiParameters, keccak256, type Hex } from "viem";

// Mirror of KnockoutJar.bracketWinner. Any change here must match the contract
// byte for byte, so a draw can be replayed from its Drawn event alone.

export type Side = { index: number; weight: bigint } | null; // null = bye

export type Match = {
  a: Side;
  b: Side;
  winner: "a" | "b";
  /** chance A had of advancing, 0..1 (1 or 0 for byes) */
  chanceA: number;
};

export type BracketResult = {
  /** rounds[r][m] */
  rounds: Match[][];
  winner: number;
  /** round in which each entrant was knocked out; Infinity for the champion */
  outIn: number[];
};

const types = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
] as const;

function h(seed: Hex, tag: bigint, x: bigint, y: bigint): bigint {
  return BigInt(keccak256(encodeAbiParameters(types, [seed, tag, x, y])));
}

export function playBracket(seed: Hex, weights: bigint[]): BracketResult {
  const n = weights.length;
  if (n === 0) throw new Error("empty bracket");
  if (n === 1) return { rounds: [], winner: 0, outIn: [Infinity] };

  const order = weights.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Number(h(seed, 1n, BigInt(i), 0n) % BigInt(i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  let size = 1;
  while (size < n) size <<= 1;
  const byes = size - n;

  let slots: Side[] = new Array(size).fill(null);
  let k = 0;
  for (let p = 0; p < size / 2; p++) {
    slots[2 * p] = { index: order[k], weight: weights[order[k]] };
    k++;
    if (p < byes) continue;
    slots[2 * p + 1] = { index: order[k], weight: weights[order[k]] };
    k++;
  }

  const outIn = new Array<number>(n).fill(Infinity);
  const rounds: Match[][] = [];
  let round = 0;
  while (slots.length > 1) {
    const next: Side[] = [];
    const matches: Match[] = [];
    for (let m = 0; m < slots.length / 2; m++) {
      const a = slots[2 * m];
      const b = slots[2 * m + 1];
      let winner: "a" | "b";
      let chanceA: number;
      if (!b) {
        winner = "a";
        chanceA = 1;
      } else if (!a) {
        winner = "b";
        chanceA = 0;
      } else {
        const total = a.weight + b.weight;
        const r = h(seed, 2n, BigInt(round), BigInt(m)) % total;
        winner = r < a.weight ? "a" : "b";
        chanceA = Number((a.weight * 10000n) / total) / 10000;
        const loser = winner === "a" ? b : a;
        outIn[loser.index] = round;
      }
      const keep = winner === "a" ? a : b;
      const carried = (a?.weight ?? 0n) + (b?.weight ?? 0n);
      next.push(keep ? { index: keep.index, weight: carried } : null);
      matches.push({ a, b, winner, chanceA });
    }
    rounds.push(matches);
    slots = next;
    round++;
  }
  return { rounds, winner: slots[0]!.index, outIn };
}

export function roundName(r: number, total: number): string {
  const left = total - r; // matches remaining including this one, in rounds
  if (left === 1) return "Final";
  if (left === 2) return "Semifinals";
  if (left === 3) return "Quarterfinals";
  return `Round of ${2 ** left}`;
}
