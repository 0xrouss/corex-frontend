"use client";

import { useAccount } from "wagmi";
import { ReactNode } from "react";

export function AddressGuard({ children }: { children: (address: string) => ReactNode }) {
  const { address } = useAccount();

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        >
          🔌
        </div>
        <p className="text-base font-medium" style={{ color: "var(--muted)" }}>
          Connect your wallet to continue
        </p>
      </div>
    );
  }

  return <>{children(address)}</>;
}
