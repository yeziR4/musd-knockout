import type { Address } from "viem";

/** Agent wallets run by the team, keyed by lowercase address. */
export const AGENTS: Record<string, { name: string; bio: string }> = {
  "0x7965246358f652036bcf1f90e94630adf81ea520": { name: "Saver-01", bio: "Steady stack, never withdraws." },
  "0x20ce460cfb26c91fee9911a94edded2116003016": { name: "Momentum", bio: "Tops up after every loss." },
  "0x7e7cc857acdb7529e3fd514b55e7b9bd303c2eed": { name: "Coinflip", bio: "Enters with a random amount each round." },
};

export function agentFor(address: Address) {
  return AGENTS[address.toLowerCase()];
}
