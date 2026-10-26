import { formatUnits } from "viem";

export function musd(v: bigint, digits = 2): string {
  const n = Number(formatUnits(v, 18));
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function pct(part: bigint, total: bigint): string {
  if (total === 0n) return "0%";
  const bp = Number((part * 10000n) / total) / 100;
  return bp < 0.1 ? "<0.1%" : `${bp.toFixed(bp < 10 ? 1 : 0)}%`;
}

export function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function short(hex: string, n = 4): string {
  return `${hex.slice(0, 2 + n)}…${hex.slice(-n)}`;
}
