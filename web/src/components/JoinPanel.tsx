"use client";

import { useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseUnits, type EIP1193Provider } from "viem";
import { erc20Abi, jarAbi } from "@/lib/abi";
import { EXPLORER, FAUCET_URL, JAR, MEZO_TESTNET_APP, MUSD, mezoTestnet } from "@/lib/config";

type Status = { kind: "idle" | "busy" | "ok" | "error"; text?: string; tx?: string };

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const tone = status.kind === "error" ? "text-accent" : status.kind === "ok" ? "text-win" : "text-muted";
  return (
    <p className={`mt-3 text-sm ${tone}`} role="status">
      {status.text}
      {status.tx && (
        <>
          {" "}
          <a className="underline underline-offset-2" href={`${EXPLORER}/tx/${status.tx}`} target="_blank" rel="noreferrer">
            View transaction ↗
          </a>
        </>
      )}
    </p>
  );
}

function JoinWithX() {
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    setStatus({ kind: "busy", text: "Checking your X account…" });
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const body = await res.json();
      if (!body.ok) return setStatus({ kind: "error", text: body.error ?? "Something went wrong." });
      if (body.already) return setStatus({ kind: "ok", text: `@${body.handle} is already in the bracket.` });
      setStatus({ kind: "ok", text: `You're in, @${body.handle}. Your face appears in the bracket within a minute.`, tx: body.txHash });
      setHandle("");
    } catch {
      setStatus({ kind: "error", text: "Couldn't reach the server. Try again." });
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted">01</span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-white">Free ticket</span>
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">Join with X</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Type your X handle and we sponsor a 10 MUSD ticket in your name. No wallet, no gas. To claim a prize, you&apos;ll
        connect the real X account.
      </p>
      <form onSubmit={join} className="mt-5 flex gap-2">
        <label className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-paper px-4 focus-within:border-ink">
          <span className="text-muted">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourhandle"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            aria-label="Your X handle"
            className="min-w-0 flex-1 bg-transparent py-2 pl-0.5 text-sm outline-none"
          />
        </label>
        <button
          disabled={status.kind === "busy"}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-accent disabled:opacity-50"
        >
          {status.kind === "busy" ? "Joining…" : "Join"}
        </button>
      </form>
      <StatusLine status={status} />
    </div>
  );
}

function JoinWithWallet() {
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function join() {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return setStatus({ kind: "error", text: "No browser wallet found. Install MetaMask or another EVM wallet." });
    if (!JAR) return setStatus({ kind: "error", text: "The jar isn't configured." });
    let value: bigint;
    try {
      value = parseUnits(amount || "0", 18);
    } catch {
      return setStatus({ kind: "error", text: "Enter a valid amount." });
    }
    if (value <= 0n) return setStatus({ kind: "error", text: "Enter an amount above 0." });

    try {
      setStatus({ kind: "busy", text: "Connecting your wallet…" });
      const wallet = createWalletClient({ chain: mezoTestnet, transport: custom(eth) });
      const pub = createPublicClient({ chain: mezoTestnet, transport: http() });
      const [account] = await wallet.requestAddresses();
      try {
        await wallet.switchChain({ id: mezoTestnet.id });
      } catch {
        await wallet.addChain({ chain: mezoTestnet });
      }

      const balance = await pub.readContract({ address: MUSD, abi: erc20Abi, functionName: "balanceOf", args: [account] });
      if (balance < value) return setStatus({ kind: "error", text: "Not enough test MUSD in this wallet. Get some first (links below)." });

      const allowance = await pub.readContract({ address: MUSD, abi: erc20Abi, functionName: "allowance", args: [account, JAR] });
      if (allowance < value) {
        setStatus({ kind: "busy", text: "Approve MUSD in your wallet (1 of 2)…" });
        const hash = await wallet.writeContract({ account, chain: mezoTestnet, address: MUSD, abi: erc20Abi, functionName: "approve", args: [JAR, value] });
        await pub.waitForTransactionReceipt({ hash }).catch(() => undefined);
      }

      setStatus({ kind: "busy", text: "Confirm the deposit in your wallet (2 of 2)…" });
      const hash = await wallet.writeContract({ account, chain: mezoTestnet, address: JAR, abi: jarAbi, functionName: "deposit", args: [value] });
      await pub.waitForTransactionReceipt({ hash }).catch(() => undefined);
      setStatus({ kind: "ok", text: `You're in with ${amount} MUSD. Withdraw any time a round is open.`, tx: hash });
    } catch (err) {
      const msg = (err as { shortMessage?: string }).shortMessage ?? "";
      setStatus({ kind: "error", text: /reject|denied/i.test(msg) ? "Cancelled in your wallet." : msg || "The deposit failed." });
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-6">
      <span className="font-mono text-xs text-muted">02</span>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">Join with wallet</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Deposit your own test MUSD. Your chance grows with your stack, and you can withdraw all of it whenever a round is open.
      </p>
      <div className="mt-5 flex gap-2">
        <label className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-paper px-4 focus-within:border-ink">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            aria-label="Amount of MUSD"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none tabular"
          />
          <span className="text-xs text-muted">MUSD</span>
        </label>
        <button
          onClick={join}
          disabled={status.kind === "busy"}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-accent disabled:opacity-50"
        >
          {status.kind === "busy" ? "Working…" : "Connect & join"}
        </button>
      </div>
      <StatusLine status={status} />
      <p className="mt-4 text-xs text-muted">
        Need test MUSD?{" "}
        <a className="underline underline-offset-2 hover:text-ink" href={FAUCET_URL} target="_blank" rel="noreferrer">
          Faucet ↗
        </a>{" "}
        then{" "}
        <a className="underline underline-offset-2 hover:text-ink" href={MEZO_TESTNET_APP} target="_blank" rel="noreferrer">
          borrow or swap on Mezo ↗
        </a>
      </p>
    </div>
  );
}

function SendAgent() {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-6">
      <span className="font-mono text-xs text-muted">03</span>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">Send your agent</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
        Agents play by the same rules as humans: approve MUSD, call deposit(). They show up with a badge so you can see who
        wins more, people or bots.
      </p>
      <code className="mt-4 rounded-lg bg-paper px-3 py-2 font-mono text-xs">jar.deposit(10e18)</code>
      {JAR && (
        <a
          href={`${EXPLORER}/address/${JAR}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 self-start rounded-full border border-line px-4 py-2 text-sm font-medium transition hover:border-ink"
        >
          Contract ↗
        </a>
      )}
    </div>
  );
}

export function JoinPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <JoinWithX />
      <JoinWithWallet />
      <SendAgent />
    </div>
  );
}
