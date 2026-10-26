// Checks that the site's bracket replay picks the same champion as the contract.
// Usage: PARITY_RPC=http://127.0.0.1:8546 PARITY_JAR=0x... npx tsx scripts/parity.ts
import { createPublicClient, http, keccak256, parseAbi, toHex, type Address } from "viem";
import { playBracket } from "../src/lib/bracket";

const rpc = process.env.PARITY_RPC ?? "http://127.0.0.1:8546";
const jar = process.env.PARITY_JAR as Address;
const client = createPublicClient({ transport: http(rpc) });
const abi = parseAbi(["function bracketWinner(bytes32 seed, uint128[] weights) pure returns (uint256)"]);

async function main() {
  let checked = 0;
  for (let t = 0; t < 300; t++) {
    const seed = keccak256(toHex(`parity-${t}`));
    const n = 1 + (t % 70);
    const weights = Array.from({ length: n }, (_, i) => (BigInt(keccak256(toHex(`${t}-${i}`))) % 10n ** 21n) + 1n);
    const onchain = await client.readContract({ address: jar, abi, functionName: "bracketWinner", args: [seed, weights] });
    const local = playBracket(seed, weights).winner;
    if (Number(onchain) !== local) {
      console.error(`MISMATCH trial ${t} n=${n}: contract ${onchain}, site ${local}`);
      process.exit(1);
    }
    checked++;
  }
  console.log(`parity ok: ${checked} brackets, field sizes 1-70`);
}

main();
