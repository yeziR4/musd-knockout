// One-off: move every Wave 1 seat into the Wave 2 (vault) jar.
// Each sponsor withdraws its seat from the old jar and re-enters the same seat in the new
// jar: X handles via depositForHandle, agent wallets via deposit. Nothing is created that
// didn't exist in Wave 1. Safe to re-run: seats already in the new jar are skipped.
//
// Env (from contracts/.env): DEPLOYER_KEY, SPONSOR_KEY, AGENT0_KEY..AGENT2_KEY, MUSD.
// Usage: node migrate.mjs            (dry run: prints the plan)
//        node migrate.mjs --execute

import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const OLD = "0xc2CED301f5545Ed6a67D593E9ec2b0651cDD5470";
const NEW = "0x96649EeD4617c1CB9E253f0233D0A891069Da76C";
const OLD_DEPLOY_BLOCK = 16381035n;
const execute = process.argv.includes("--execute");

const chain = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
});
const pub = createPublicClient({ chain, transport: http() });

const jarAbi = parseAbi([
  "function allSeats() view returns (bytes32[] list, uint128[] weights)",
  "function seats(bytes32) view returns (uint128 principal, uint128 prize, address sponsor, address owner)",
  "function locked() view returns (bool)",
  "function withdraw(bytes32 seat, uint256 amount)",
  "function deposit(uint256 amount)",
  "function depositForHandle(string handle, uint256 amount)",
  "event HandleSeat(bytes32 indexed seat, string handle)",
]);
const erc20 = parseAbi([
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const keys = ["DEPLOYER_KEY", "SPONSOR_KEY", "AGENT0_KEY", "AGENT1_KEY", "AGENT2_KEY"].map((k) => process.env[k]).filter(Boolean);
const accounts = new Map(keys.map((k) => { const a = privateKeyToAccount(k); return [a.address.toLowerCase(), a]; }));

const isWallet = (seat) => BigInt(seat) >> 160n === 0n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mezo's RPC sometimes answers null for a mined tx: confirm by re-reading state.
async function send(account, request, done, label) {
  const wallet = createWalletClient({ chain, account, transport: http() });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await done()) return true;
    try {
      const hash = await wallet.writeContract({ ...request, gas: 600_000n });
      await pub.waitForTransactionReceipt({ hash, timeout: 45_000 }).catch(() => undefined);
    } catch (err) {
      console.log(`  ${label}: ${err.shortMessage ?? err.message}`);
    }
    for (let i = 0; i < 8; i++) {
      if (await done()) return true;
      await sleep(2500);
    }
  }
  console.log(`  ${label}: NOT confirmed`);
  return false;
}

async function main() {
  if (await pub.readContract({ address: OLD, abi: jarAbi, functionName: "locked" })) throw new Error("old jar is locked");
  if (await pub.readContract({ address: NEW, abi: jarAbi, functionName: "locked" })) throw new Error("new jar is locked");

  // handle names for every handle seat, from the old jar's events
  const head = await pub.getBlockNumber();
  const handles = new Map();
  for (let from = OLD_DEPLOY_BLOCK; from <= head; from += 9001n) {
    const to = from + 9000n > head ? head : from + 9000n;
    const logs = await pub.getContractEvents({ address: OLD, abi: jarAbi, eventName: "HandleSeat", fromBlock: from, toBlock: to });
    for (const l of logs) handles.set(l.args.seat.toLowerCase(), l.args.handle);
  }

  const [list] = await pub.readContract({ address: OLD, abi: jarAbi, functionName: "allSeats" });
  const plan = [];
  for (const seat of list) {
    const [principal, , sponsor] = await pub.readContract({ address: OLD, abi: jarAbi, functionName: "seats", args: [seat] });
    const account = accounts.get(sponsor.toLowerCase());
    const handle = isWallet(seat) ? null : handles.get(seat.toLowerCase());
    plan.push({ seat, principal, sponsor, account, handle });
  }

  const missingKey = plan.filter((p) => !p.account);
  const missingHandle = plan.filter((p) => !isWallet(p.seat) && !p.handle);
  console.log(`old jar seats: ${plan.length} (${plan.filter((p) => p.handle).length} handles, ${plan.filter((p) => isWallet(p.seat)).length} wallets)`);
  console.log(`sponsor keys missing: ${missingKey.length}, handle names missing: ${missingHandle.length}`);
  if (!execute) {
    for (const p of plan) console.log(`  ${p.handle ? "@" + p.handle : p.sponsor} ${Number(p.principal / 10n ** 16n) / 100} MUSD`);
    return;
  }

  // approvals for the new jar, once per sponsor
  for (const account of new Set(plan.filter((p) => p.account).map((p) => p.account))) {
    const musd = process.env.MUSD;
    const need = plan.filter((p) => p.account === account).reduce((s, p) => s + p.principal, 0n);
    await send(account, { address: musd, abi: erc20, functionName: "approve", args: [NEW, need * 2n] },
      async () => (await pub.readContract({ address: musd, abi: erc20, functionName: "allowance", args: [account.address, NEW] })) >= need,
      `approve ${account.address.slice(0, 8)}`);
  }

  let moved = 0;
  for (const p of plan) {
    if (!p.account || (!isWallet(p.seat) && !p.handle)) continue;
    const newSeatId = isWallet(p.seat) ? p.seat : keccak256(toHex(`x:${p.handle}`));
    const inNew = async () => (await pub.readContract({ address: NEW, abi: jarAbi, functionName: "seats", args: [newSeatId] }))[0] > 0n;
    if (await inNew()) { moved++; continue; }
    const label = p.handle ? `@${p.handle}` : p.sponsor.slice(0, 8);
    const out = await send(p.account, { address: OLD, abi: jarAbi, functionName: "withdraw", args: [p.seat, p.principal] },
      async () => (await pub.readContract({ address: OLD, abi: jarAbi, functionName: "seats", args: [p.seat] }))[0] === 0n,
      `${label} withdraw`);
    if (!out) continue;
    const req = p.handle
      ? { address: NEW, abi: jarAbi, functionName: "depositForHandle", args: [p.handle, p.principal] }
      : { address: NEW, abi: jarAbi, functionName: "deposit", args: [p.principal] };
    if (await send(p.account, req, inNew, `${label} deposit`)) {
      moved++;
      console.log(`  moved ${label}`);
    }
  }
  console.log(`done: ${moved}/${plan.length} seats in the new jar`);
}

main().catch((e) => { console.error(e); process.exit(1); });
