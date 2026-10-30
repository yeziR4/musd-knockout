import { defineChain, type Address } from "viem";

export const APP_NAME = "Knockout";
export const TAGLINE = "Save MUSD. Survive the bracket. Never lose your stack.";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

export const EXPLORER = "https://explorer.test.mezo.org";

/** Official MUSD on Mezo testnet (mezo-org/musd deployments/matsnet). */
export const MUSD: Address = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

export const JAR: Address | undefined =
  (process.env.NEXT_PUBLIC_JAR_ADDRESS as Address | undefined) || undefined;
export const JAR_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_JAR_DEPLOY_BLOCK || "0");


export const FAUCET_URL = "https://faucet.test.mezo.org";
export const MEZO_TESTNET_APP = "https://testnet.mezo.org";
