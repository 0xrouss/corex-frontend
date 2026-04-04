"use client";

import { useAccount } from "wagmi";
import { ReactNode } from "react";

export function AddressGuard({ children }: { children: (address: string) => ReactNode }) {
  const { address } = useAccount();

  if (!address) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          paddingTop: "120px",
          paddingBottom: "120px",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "1px",
            background: "var(--border-strong)",
          }}
        />
        <p
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--fg-muted)",
            letterSpacing: "0.02em",
          }}
        >
          Connect wallet to continue
        </p>
        <div
          style={{
            width: "32px",
            height: "1px",
            background: "var(--border-strong)",
          }}
        />
      </div>
    );
  }

  return <>{children(address)}</>;
}
