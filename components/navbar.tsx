"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "@/components/connect-wallet-button";

const NAV_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/transfer", label: "Transfer" },
  { href: "/trade", label: "Trade" },
  { href: "/orders", label: "Orders" },
  { href: "/markets", label: "Markets" },
  { href: "/activity", label: "Activity" },
  { href: "/state", label: "State" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address } = useAccount();

  return (
    <header
      className="fixed top-0 inset-x-0 z-50"
      style={{
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        backgroundColor: "rgba(6, 6, 10, 0.72)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="text-lg font-semibold tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Corex
          </span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.25)",
            }}
          >
            TEE
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="relative px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200"
                style={{
                  color: active ? "#ffffff" : "rgba(255,255,255,0.5)",
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                }}
              >
                {label}
                {active && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, #f59e0b, transparent)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Address pill */}
        {address && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-full"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "#22c55e" }}
            />
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}

        {/* Connect button */}
        <ConnectWalletButton />
      </nav>
    </header>
  );
}
