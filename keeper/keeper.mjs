// Knockout keeper: run on a schedule. Locks and draws a finished round, then tops the pot
// back up. Safe to run as often as you like: it does nothing until a round is due.
//
// Env: DEPLOYER_KEY (operator), SEED_MASTER, JAR. Optional: RPC, POT_TOPUP (MUSD, default 50).
// Round secrets match contracts/ops.sh: secret(r) = keccak256(abi.encode(SEED_MASTER, r)).

import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC || "https://rpc.test.mezo.org"] } },
});

const jar = process.env.JAR;
const master = process.env.SEED_MASTER;
const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const topup = parseUnits(process.env.POT_TOPUP || "50", 18);
if (!jar || !master) throw new Error("JAR and SEED_MASTER are required");

const abi = parseAbi([
  "function roundId() view returns (uint256)",
  "function roundEnd() view returns (uint64)",
  "function locked() view returns (bool)",
  "function seatCount() view returns (uint256)",
  "function pot() view returns (uint256)",
  "function musd() view returns (address)",
  "function lockRound()",
  "function draw(bytes32 secret, bytes32 nextCommit)",
  "function fundPot(uint256 amount)",
]);
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, account, transport: http() });
const read = (functionName) => pub.readContract({ address: jar, abi, functionName });

const secret = (r) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [master, r]));
const commit = (r) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [secret(r)]));

// Mezo's public RPC sometimes answers null for a mined tx, so confirm by re-reading state.
async function send(label, request, done) {
  try {
    const hash = await wallet.writeContract({ ...request, gas: 9_500_000n });
    console.log(`${label}: ${hash}`);
    await pub.waitForTransactionReceipt({ hash, timeout: 60_000 }).catch(() => undefined);
  } catch (err) {
    console.log(`${label}: send reported ${err.shortMessage ?? err.message}`);
  }
  for (let i = 0; i < 10; i++) {
    if (await done()) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`${label}: not confirmed yet, will retry next run`);
  return false;
}

async function main() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  let round = await read("roundId");
  let locked = await read("locked");
  const end = await read("roundEnd");
  console.log(`round ${round}, locked ${locked}, ends in ${end - now}s`);

  if (!locked && now >= end) {
    const seats = await read("seatCount");
    if (seats === 0n) {
      await send("extend empty round", { address: jar, abi, functionName: "lockRound" }, async () => (await read("roundEnd")) > now);
      return;
    }
    locked = await send("lock", { address: jar, abi, functionName: "lockRound" }, () => read("locked"));
  }

  if (locked) {
    const drawn = await send(
      `draw round ${round}`,
      { address: jar, abi, functionName: "draw", args: [secret(round), commit(round + 1n)] },
      async () => (await read("roundId")) > round,
    );
    if (!drawn) return;
    round += 1n;
  }

  // Keep a prize in every open round.
  const pot = await read("pot");
  if (pot < topup) {
    const musd = await read("musd");
    const bal = await pub.readContract({ address: musd, abi: erc20, functionName: "balanceOf", args: [account.address] });
    const need = topup - pot;
    if (bal < need) return console.log(`pot ${pot}, operator MUSD too low to top up (${bal})`);
    const allowance = await pub.readContract({ address: musd, abi: erc20, functionName: "allowance", args: [account.address, jar] });
    if (allowance < need) {
      await send("approve", { address: musd, abi: erc20, functionName: "approve", args: [jar, need * 20n] },
        async () => (await pub.readContract({ address: musd, abi: erc20, functionName: "allowance", args: [account.address, jar] })) >= need);
    }
    await send(`fund pot +${need}`, { address: jar, abi, functionName: "fundPot", args: [need] }, async () => (await read("pot")) >= topup);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
