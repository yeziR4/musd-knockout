"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";

const tints = ["#ffd6e0", "#ffe7c2", "#d9f0d0", "#d6e8f5", "#e8dcf5", "#f5e1d6"];

function tintFor(seat: string) {
  let h = 0;
  for (let i = 2; i < seat.length; i += 6) h = (h * 31 + seat.charCodeAt(i)) >>> 0;
  return tints[h % tints.length];
}

function initials(p: Profile) {
  const base = p.handle ?? p.name.replace(/^0x/, "");
  return base.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

export function Avatar({
  profile,
  size = 36,
  dim = false,
  ring = false,
}: {
  profile: Profile;
  size?: number;
  dim?: boolean;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const remote = profile.kind === "x" && profile.handle && !profile.noRemoteAvatar && !failed;
  const isAgent = profile.kind === "agent";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-500 ${
        dim ? "opacity-30 grayscale" : ""
      } ${ring ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""}`}
      style={{
        width: size,
        height: size,
        background: isAgent ? "var(--agent-soft)" : tintFor(profile.seat),
        borderRadius: isAgent ? size * 0.28 : undefined,
      }}
      title={profile.name}
    >
      {remote ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatar/${profile.handle}`}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : isAgent ? (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} aria-hidden>
          <rect x="4" y="7" width="16" height="12" rx="3" fill="none" stroke="var(--agent)" strokeWidth="2" />
          <circle cx="9" cy="13" r="1.6" fill="var(--agent)" />
          <circle cx="15" cy="13" r="1.6" fill="var(--agent)" />
          <path d="M12 7V4" stroke="var(--agent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <span className="font-semibold text-ink/70" style={{ fontSize: size * 0.36 }}>
          {initials(profile)}
        </span>
      )}
    </span>
  );
}
