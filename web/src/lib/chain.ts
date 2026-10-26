import "server-only";
import { createPublicClient, getAddress, http, type Hex } from "viem";
import { jarAbi } from "./abi";
import { agentFor } from "./agents";
import { JAR, JAR_DEPLOY_BLOCK, mezoTestnet } from "./config";
import type { Activity, Draw, JarState, Profile } from "./types";

const client = createPublicClient({ chain: mezoTestnet, transport: http() });

// Mezo's public RPC caps eth_getLogs at 10,000 blocks.
const LOG_WINDOW = 9_000n;

type Cache = {
  scannedTo: bigint;
  handles: Map<string, string>; // seat -> handle
  draws: Draw[];
  activity: (Omit<Activity, "profile"> & { seat?: Hex })[];
  seen: Set<string>;
  blockTimes: Map<bigint, number>;
};
const cache: Cache = {
  scannedTo: JAR_DEPLOY_BLOCK - 1n,
  handles: new Map(),
  draws: [],
  activity: [],
  seen: new Set(),
  blockTimes: new Map(),
};

async function blockTime(n: bigint) {
  let t = cache.blockTimes.get(n);
  if (t === undefined) {
    t = Number((await client.getBlock({ blockNumber: n })).timestamp);
    cache.blockTimes.set(n, t);
  }
  return t;
}

function isWalletSeat(seat: Hex) {
  return BigInt(seat) >> 160n === 0n;
}

export function profileFor(seat: Hex, handles: Map<string, string>): Profile {
  const key = seat.toLowerCase();
  if (isWalletSeat(seat)) {
    const address = getAddress(`0x${seat.slice(-40)}`);
    const agent = agentFor(address);
    if (agent) return { seat, kind: "agent", name: agent.name, bio: agent.bio };
    return { seat, kind: "wallet", name: `${address.slice(0, 6)}…${address.slice(-4)}` };
  }
  const handle = handles.get(key);
  return { seat, kind: "x", handle, name: handle ? `@${handle}` : "Reserved seat" };
}

async function scanLogs() {
  if (!JAR) return;
  const head = await client.getBlockNumber();
  while (cache.scannedTo < head) {
    const fromBlock = cache.scannedTo + 1n;
    const toBlock = fromBlock + LOG_WINDOW > head ? head : fromBlock + LOG_WINDOW;
    const logs = await client.getContractEvents({
      address: JAR,
      abi: jarAbi,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      if (log.eventName === "HandleSeat") {
        cache.handles.set(log.args.seat!.toLowerCase(), log.args.handle!);
      } else if (log.eventName === "Drawn") {
        const a = log.args;
        cache.draws.push({
          roundId: Number(a.roundId),
          seed: a.seed!,
          winner: a.winner!,
          prize: a.prize!,
          // profiles resolved at read time, once all handles are known
          entrants: a.seats!.map((s, i) => ({
            profile: { seat: s, kind: "wallet", name: "" },
            weight: a.weights![i],
          })),
          txHash: log.transactionHash,
          timestamp: await blockTime(log.blockNumber),
        });
        cache.activity.push({
          kind: "draw",
          seat: a.winner!,
          amount: a.prize!,
          roundId: Number(a.roundId),
          timestamp: await blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
      } else if (log.eventName === "Deposited") {
        const seat = log.args.seat!.toLowerCase();
        cache.activity.push({
          kind: cache.seen.has(seat) ? "topup" : "join",
          seat: log.args.seat!,
          amount: log.args.amount!,
          timestamp: await blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
        cache.seen.add(seat);
      } else if (log.eventName === "PotFunded") {
        cache.activity.push({
          kind: "pot",
          amount: log.args.amount!,
          timestamp: await blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
      }
    }
    cache.scannedTo = toBlock;
  }
}

export async function readJar(): Promise<JarState | null> {
  if (!JAR) return null;
  await scanLogs();
  const read = { address: JAR, abi: jarAbi } as const;
  const [roundId, roundEnd, locked, pot, totalPrincipal, seats] = await Promise.all([
    client.readContract({ ...read, functionName: "roundId" }),
    client.readContract({ ...read, functionName: "roundEnd" }),
    client.readContract({ ...read, functionName: "locked" }),
    client.readContract({ ...read, functionName: "pot" }),
    client.readContract({ ...read, functionName: "totalPrincipal" }),
    client.readContract({ ...read, functionName: "allSeats" }),
  ]);
  const [list, weights] = seats;
  return {
    mode: "live",
    roundId: Number(roundId),
    roundEnd: Number(roundEnd),
    drawing: locked,
    pot,
    totalPrincipal,
    entrants: list.map((s, i) => ({ profile: profileFor(s, cache.handles), weight: weights[i] })),
    draws: [...cache.draws].reverse().map((d) => ({
      ...d,
      entrants: d.entrants.map((e) => ({ ...e, profile: profileFor(e.profile.seat, cache.handles) })),
    })),
    activity: [...cache.activity]
      .reverse()
      .slice(0, 40)
      .map(({ seat, ...a }) => ({ ...a, profile: seat ? profileFor(seat, cache.handles) : undefined })),
  };
}
