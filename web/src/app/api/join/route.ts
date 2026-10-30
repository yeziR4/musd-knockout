import { createPublicClient, createWalletClient, http, keccak256, parseUnits, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, jarAbi } from "@/lib/abi";
import { JAR, MUSD, mezoTestnet } from "@/lib/config";
import { HANDLE_RE, existsOnX, normalizeHandle } from "@/lib/xprofile";

// POST { handle } → a free sponsored ticket for a real X account.
// The sponsor wallet (SPONSOR_KEY) has its own small budget, separate from the operator
// that runs draws. Claiming a prize still requires connecting that X account.

export const dynamic = "force-dynamic";

const TICKET = parseUnits("10", 18);
const SEAT_LIMIT = 120n; // leave room under the contract's 128 for wallet joins

const pub = createPublicClient({ chain: mezoTestnet, transport: http() });

// One send at a time per instance so sponsor nonces never collide.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

// Light per-instance throttle: 3 joins per IP per hour.
const hits = new Map<string, number[]>();
function throttled(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 3) return true;
  hits.set(ip, [...recent, now]);
  return false;
}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const key = process.env.SPONSOR_KEY as Hex | undefined;
  if (!JAR || !key) return fail(503, "Joining with X is not set up yet.");

  const body = await req.json().catch(() => null);
  const handle = normalizeHandle(String(body?.handle ?? ""));
  if (!HANDLE_RE.test(handle)) return fail(400, "That doesn't look like an X handle.");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (throttled(ip)) return fail(429, "Too many joins from this connection. Try again in an hour.");

  const seat = keccak256(toHex(`x:${handle}`));
  const read = { address: JAR, abi: jarAbi } as const;
  const [[principal], locked, seatCount] = await Promise.all([
    pub.readContract({ ...read, functionName: "seats", args: [seat] }),
    pub.readContract({ ...read, functionName: "locked" }),
    pub.readContract({ ...read, functionName: "seatCount" }),
  ]);
  if (principal > 0n) return Response.json({ ok: true, already: true, handle });
  if (locked) return fail(409, "A draw is running right now. Try again in a minute.");
  if (seatCount >= SEAT_LIMIT) return fail(409, "This round is full. Try again next round.");

  const exists = await existsOnX(handle);
  if (exists === null) return fail(503, "Couldn't reach X to check that handle. Try again in a moment.");
  if (!exists) return fail(404, `We couldn't find @${handle} on X.`);

  const account = privateKeyToAccount(key);
  const balance = await pub.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (balance < TICKET) return fail(503, "Free tickets are out for now. Join with a wallet instead.");

  try {
    const hash = await serial(async () => {
      const wallet = createWalletClient({ chain: mezoTestnet, account, transport: http() });
      return wallet.writeContract({ ...read, functionName: "depositForHandle", args: [handle, TICKET], gas: 500_000n });
    });
    return Response.json({ ok: true, handle, txHash: hash });
  } catch (err) {
    console.error("join failed", handle, err);
    return fail(502, "The ticket transaction failed. Please try again.");
  }
}
