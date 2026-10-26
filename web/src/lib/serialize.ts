import type { JarState } from "./types";

// JSON has no bigint: encode as {"$n":"123"} and revive on the client.

export function toJson(state: JarState): string {
  return JSON.stringify(state, (_k, v) => (typeof v === "bigint" ? { $n: v.toString() } : v));
}

export function fromJson(text: string): JarState {
  return JSON.parse(text, (_k, v) =>
    v && typeof v === "object" && typeof v.$n === "string" ? BigInt(v.$n) : v,
  );
}
