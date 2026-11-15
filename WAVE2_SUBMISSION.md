# Knockout — Wave 2

Paste the blocks below into the AKINDO form. Record the video from the script. The deck is the eight slides at the bottom.

## What changed since Wave 1

Wave 1 score: Mezo integration 4, product 5, technical 4, UX 6, materials 2. Payout $11.

The pot was sponsor-funded, and the site described a block-hash draw that does not work on Mezo. Wave 2 changes the thing the score weights most.

- New jar on Mezo testnet (chain 31611): `0x96649EeD4617c1CB9E253f0233D0A891069Da76C`
- It parks idle MUSD 1:1 in Mezo's own MUSD Savings Vault `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` (`deposit` / `withdraw` are 1:1; yield is `claimYield`)
- 10% of claimed yield goes to the treasury `0xd1Ea8Ed3b753bB8bDCd257F0cCF855Cb338aE236`. The other 90% is the pot. Principal is never the prize.
- Anyone can call `harvest()`. A draw harvests before it reads the pot.
- The site can withdraw a deposit and claim a prize. The "How it works" copy now describes commit-reveal, which is what the contract does. Mezo's `BLOCKHASH` returns zero.
- Wave 1 jar, with the rounds already drawn, stays at `0xc2CED301f5545Ed6a67D593E9ec2b0651cDD5470`. It has no vault hook, so it was not upgraded in place.

### Transactions

| Step | Tx |
|---|---|
| Deploy | https://explorer.test.mezo.org/tx/0x84895647e86039893c346cb09a8ec6c09482ec2171e7f2ef396b0bfd30c95b04 |
| `setSavings` (vault, 10% fee) | https://explorer.test.mezo.org/tx/0x79049a0f133b4a3b80538dc40e2375740df0a5bbe391e00c84c98f2bbe460898 |
| Deposit 10 MUSD, parked in the vault | https://explorer.test.mezo.org/tx/0x9ed58887e5343381f1dfa997a5c1da68c0061fd84ed30650008d52abfca30d5b |
| Round 1 drawn by the GitHub keeper (harvests first) | https://explorer.test.mezo.org/tx/0x09f2657a2c6f1c89f5c9c19aa2a4c5d59863ed1b57ddb42f2e3d95d83f63928f |

After the draw: round 2 open, `totalPrincipal` `10 MUSD`, vault `balanceOf(jar)` still `10 MUSD`. The keeper (GitHub Actions, every 30 minutes) locks and draws each round with the committed secret; in Wave 1 it ran 31 rounds without a failure.

**Players moved to the vault jar.** All 48 Wave 1 seats (45 X handles and 3 agents) were withdrawn from the Wave 1 jar by their sponsors and re-entered in the Wave 2 jar with `keeper/migrate.mjs`, the same seats with the same stakes. The Wave 2 jar now holds 49 seats and 740 MUSD, all of it parked in Mezo's MUSD Savings Vault (`balanceOf(jar)` = 740 MUSD, idle MUSD in the jar = 0). The Wave 1 jar is empty; its 31 drawn rounds remain on-chain as history.

Read at the deposit block: jar MUSD balance `0`, vault `balanceOf(jar)` `10 MUSD`, `totalPrincipal` `10 MUSD`, `pot` `0`. The pot is zero because the vault has not distributed yield to this deposit yet. Mezo pays that yield on its own schedule. `harvest()` is permissionless and will move it into the pot, minus the 10% fee.

Tests: `cd contracts && forge test` — 20 passing, including park, fee, draw, and full withdrawal. Plus 3 fork tests that run the jar against Mezo's **real** MUSDSavingsRate on a fork of Mezo testnet (deposit parks 1:1, harvest leaves principal untouched, full withdrawal, and the live jar holds at least every deposit): `MEZO_FORK=1 forge test --match-contract SavingsFork` — 3 passing.

## AKINDO fields

**Project name:** Knockout

**Category:** prize-linked savings

**TL;DR:** No-loss MUSD savings on Mezo: deposits sit in the MUSD Savings Vault, a knockout bracket pays the yield to one winner, and everyone else withdraws their full deposit.

**How it works:** Saving small amounts feels pointless because the yield is invisible. Knockout puts deposits into Mezo's own sMUSD vault, so the principal stays 1:1 and the yield is a prize. Each round every seat enters a weighted bracket. A player's chance of winning is exactly their share of the deposits. The winner is paid the net yield. A 10% fee on that yield is the jar's revenue. Handle seats let someone join from X without a wallet. The draw is commit-reveal, because `BLOCKHASH` returns zero on Mezo.

**Target group:** People who will not open a 1,800 MUSD Bitcoin loan, and who will try a savings product if the money cannot be lost and the prize is watchable. Desktop and mobile web. Mezo testnet today.

**Tech stack:** Solidity 0.8.24, Foundry, Mezo MUSD and MUSDSavingsRate, Next.js, viem.

**Track:** Track 2, Access and Distribution. The yield comes from Track 1's savings vault.

**Chain:** Mezo testnet (31611).

**Status:** Existing Wave 1 project. New jar this wave, because the vault is wired in the contract. All 48 Wave 1 players were moved into it.

**Readiness:** Testnet deployment. Not audited. Do not use with real funds.

**Future milestones:**

1. Within two weeks of the next vault distribution, publish the `harvest` transaction and the pot it created.
2. By the end of December, cap a mainnet jar at a small size after the same deposit, withdraw, and harvest path is repeated on mainnet sMUSD `0xb4D498029af77680cD1eF828b967f010d06C51CC`.
3. By the end of January, replace operator binding of X handles with a signed claim.

**Team:** Yezo. Solo. GitHub https://github.com/yeziR4/musd-knockout

## Video script (about 2 minutes)

Say this while the screen shows the thing named in brackets. Upload as Public or Unlisted.

[Site, home] Knockout is no-loss savings for MUSD on Mezo. You deposit dollars backed by Bitcoin. A knockout bracket picks one winner. Everyone else takes their whole deposit back.

[How it works] In Wave 1 the prize was money we put in ourselves. That is not Mezo yield, and the judges scored integration a 4. This wave the jar parks every deposit in Mezo's own MUSD Savings Vault. Deposit and withdraw are one-for-one. The yield is claimed separately. Ten percent pays the jar. Ninety percent is the pot.

[Explorer, deposit tx, then the vault balance and the jar's MUSD balance] Here is the transaction. Ten test MUSD went in. The jar's own MUSD balance is zero. The vault holds the ten. Principal on the jar is ten. The pot is zero today, because Mezo has not distributed yield to this deposit yet. When it does, anyone can call harvest, and the next draw pays that yield.

[Join tab, Withdraw] Withdraw is on the site. A round has to be open. The deposit comes back in full, because the vault returns one MUSD per one MUSD parked.

[Wave 1 contract link, or a saved bracket replay] Wave 1 already ran the bracket on testnet, commit-reveal, because block hashes on Mezo are zero. Those rounds stay on the first contract. This contract is the yield.

[Back to the home screen] The link, the repo, and these three transactions are in the submission.

## Deck

1. **Knockout.** No-loss MUSD savings. One winner takes the yield. Everyone else withdraws.
2. **Wave 1 score.** Integration 4, product 5, tech 4, UX 6, materials 2. The pot was a sponsor transfer.
3. **What Mezo already built.** The MUSD Savings Vault: deposit and withdraw 1:1, yield via `claimYield`.
4. **What we added.** The jar is a depositor in that vault. 10% fee. The rest is the pot. Principal cannot be won.
5. **Proof.** Deploy, `setSavings`, 10 MUSD deposit. Jar balance 0. Vault balance 10. Three transaction links.
6. **The bracket.** Weighted matches. Chance of winning equals share of deposits. Commit-reveal, because `BLOCKHASH` is zero on Mezo. Unlock after 24 hours.
7. **Who pays.** Savers pay nothing to enter with a wallet. The jar is paid only from yield. Testnet. Not audited.
8. **Next.** Show the first real harvest after Mezo's next distribution. Then a capped mainnet jar on the mainnet vault.
