# Knockout: Wave 1 submission

**Tagline:** A no-loss MUSD savings game where everyone enters a knockout bracket, the last one standing takes the pot, and nobody loses their stack.

**Track:** 2: Access & Distribution (with a Track 1 yield roadmap)
**Chain:** Mezo testnet (31611)
**Status:** New project, built in Wave 1. Live on testnet, unaudited.

## Problem
Saving is boring, and small savers barely notice yield on a small balance. Getting MUSD at all is hard for newcomers: the usual route is a Bitcoin-backed loan with a ~1,800 MUSD minimum and a wallet setup most people abandon.

## What Knockout does
- **Prize-linked savings:** deposit MUSD, keep 100% of it, withdraw any time a round is open. Each round the pooled pot goes to one winner. This is the model behind UK Premium Bonds, put on-chain with MUSD.
- **A live knockout bracket decides the winner.** Each match is weighted by stack size and the winner carries both stacks forward, so every player's chance of winning the bracket is exactly their share of the jar. It's fair by design and you can watch it play out.
- **Comment-to-join.** Most people won't sign up. Anyone can sponsor a ticket for an X handle with no wallet and no gas. The handle is recorded on-chain and its profile picture appears in the bracket. A prize won by a handle waits until its owner claims it.
- **Humans and agents in the same field.** Agent wallets play by the same rules and carry a badge, and the wall of winners keeps score: humans vs agents.
- **Terminal tickers:** live joins on top, and Knockout results plus Mezo ecosystem headlines (from Mezo's blog feed) on the bottom.

## Mezo integration
- MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` is the deposit, ticket and prize asset. Checked on-chain as the MUSD that Mezo's BorrowerOperations and StabilityPool use.
- The operator wallet borrowed its MUSD the way a user would, by opening a trove through BorrowerOperations.openTrove: [tx](https://explorer.test.mezo.org/tx/0xf5d4dc581a86b9c02d29ca3651755cddbe58f7f4de699535a6d5bd219656a7b4)
- KnockoutJar: `0xc2CED301f5545Ed6a67D593E9ec2b0651cDD5470`

## Proof on testnet
- Round 1 drawn: [tx](https://explorer.test.mezo.org/tx/0x259cfee60594a6e32494d9144ec9d23b01b321eb49b2c5efcabba19849513151)
- Round 2: 39 players (36 X handles from comments + 3 agents). Draw tx: ROUND2_TX
- 16 Foundry tests, including a fairness test (4,000 brackets, win rates within 3 points of deposit share), a 128-player draw, commit-reveal checks, and the 24h escape hatch.
- Site/contract parity: the site's bracket replay picked the same champion as the contract in 300 of 300 random brackets.

## Things we found about Mezo
1. **BLOCKHASH returns zero on Mezo**, even for the previous block, so future-block-hash randomness silently fails. Our first deployment hit this. We moved to commit-reveal (secret hash committed when each round opens, before anyone enters) and added an anyone-can-unlock escape after 24h so deposits can never be stuck.
2. **Block gas limit is 10M**, and the public RPC sometimes returns null for transactions that did land. The ops scripts re-read state rather than trusting the response.

## Honest limits (Wave 1)
- The pot is sponsor-funded. Mezo's MUSD Savings Vault (sMUSD) is the no-loss yield source, but we only found it on mainnet. The Stability Pool can shrink deposits, which would break "no-loss".
- The operator commits the seed and binds handle seats to wallets. Wave 2 removes both trust points.

## Wave 2 plan
- The pot is funded by sMUSD yield
- Sign in with X, with a wallet created for the user
- Claim prizes with a signed X proof
- Telegram bot and automatic X winner posts
- One-step BTC → MUSD tickets
- Open agent arena
- Stronger randomness (drand / VRF)

## Links
- Live app: SITE_URL
- Code: REPO_URL
- Demo video: VIDEO_URL
