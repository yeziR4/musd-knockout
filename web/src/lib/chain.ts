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

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function loadBlockTimes(blocks: bigint[]) {
  const missing = [...new Set(blocks)].filter((n) => !cache.blockTimes.has(n));
  await pool(missing, 10, async (n) => {
    cache.blockTimes.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp));
  });
}

const blockTime = (n: bigint) => cache.blockTimes.get(n) ?? 0;

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

let scanning: Promise<void> | undefined;

// Concurrent requests share one scan instead of each walking the history.
function scanLogs() {
  scanning ??= doScan().finally(() => {
    scanning = undefined;
  });
  return scanning;
}

async function doScan() {
  if (!JAR) return;
  const head = await client.getBlockNumber();
  if (cache.scannedTo >= head) return;

  // Fetch every 9k-block window in parallel, then all block timestamps in parallel,
  // and only then apply events in chain order.
  const windows: [bigint, bigint][] = [];
  for (let from = cache.scannedTo + 1n; from <= head; from += LOG_WINDOW + 1n) {
    windows.push([from, from + LOG_WINDOW > head ? head : from + LOG_WINDOW]);
  }
  const logs = (
    await pool(windows, 6, ([fromBlock, toBlock]) =>
      client.getContractEvents({ address: JAR!, abi: jarAbi, fromBlock, toBlock }),
    )
  ).flat();
  await loadBlockTimes(logs.filter((l) => l.eventName !== "HandleSeat").map((l) => l.blockNumber));

  {
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
          timestamp: blockTime(log.blockNumber),
        });
        cache.activity.push({
          kind: "draw",
          seat: a.winner!,
          amount: a.prize!,
          roundId: Number(a.roundId),
          timestamp: blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
      } else if (log.eventName === "Deposited") {
        const seat = log.args.seat!.toLowerCase();
        cache.activity.push({
          kind: cache.seen.has(seat) ? "topup" : "join",
          seat: log.args.seat!,
          amount: log.args.amount!,
          timestamp: blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
        cache.seen.add(seat);
      } else if (log.eventName === "PotFunded") {
        cache.activity.push({
          kind: "pot",
          amount: log.args.amount!,
          timestamp: blockTime(log.blockNumber),
          txHash: log.transactionHash,
        });
      }
    }
  }
  cache.scannedTo = head;
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
