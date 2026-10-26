import { APP_NAME } from "@/lib/config";

/** Four lines merge into one: a bracket collapsing to a champion. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <path
        d="M3 5h6v5H3M3 18h6v5H3M9 7.5h5v13H9M14 14h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="23.5" cy="14" r="3.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <Mark />
      <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
