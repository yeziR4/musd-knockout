# Knockout

**Save MUSD. Survive the bracket. Never lose your stack.**

Knockout is no-loss prize savings on [Mezo](https://mezo.org). Everyone in the jar enters a weighted knockout bracket, and one champion takes the pot. Everyone else can withdraw every MUSD they put in.

- **Live app:** https://knockout-musd.vercel.app
- **Contract (Mezo testnet):** [`0xc2CED301f5545Ed6a67D593E9ec2b0651cDD5470`](https://explorer.test.mezo.org/address/0xc2CED301f5545Ed6a67D593E9ec2b0651cDD5470)
- **MUSD (testnet):** `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`

## How it works

1. **Deposits are never at risk.** Principal and the pot are tracked separately. Withdraw any time a round is open.
2. **The bracket is fair by design.** In each match, your chance of advancing is your stack divided by both stacks combined, and the winner carries both stacks forward. So your chance of winning the bracket is exactly your share of the jar.
3. **Comment-to-join.** `depositForHandle` sponsors a ticket for an X handle with no wallet needed. The handle is emitted on-chain, so the site shows the player's profile picture. A prize won by a handle waits until its owner claims it.
4. **Verifiable draws.** The seed comes from commit-reveal: a secret's hash is committed when each round opens, before anyone enters. Anyone can replay a draw from its `Drawn` event with `bracketWinner(seed, weights)`, and the site does exactly that.

### Why commit-reveal and not block hashes
`BLOCKHASH` returns zero on Mezo (even for the previous block), so future-block-hash randomness silently fails there. If a draw is never revealed, anyone can `unlock()` after 24h so deposits can't get stuck.

## Repo

| Path | What |
|---|---|
| `contracts/src/KnockoutJar.sol` | The jar: seats, deposits, bracket, commit-reveal draw |
| `contracts/test/` | 16 Foundry tests, including fairness over 4,000 brackets and a 128-player draw |
| `contracts/ops.sh` | Operator chores: `status`, `draw`, `ticket <handle>` |
| `web/` | Next.js site: live bracket replay, tickers, winners, roadmap |
| `web/src/lib/bracket.ts` | TypeScript mirror of the bracket, which matched the contract in 300/300 random brackets (`web/scripts/parity.ts`) |

```bash
cd contracts && forge test
cd web && npm install && npm run dev
```

Testnet only, unaudited.
