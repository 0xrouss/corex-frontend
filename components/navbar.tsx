"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "@/components/connect-wallet-button";

const NAV_LINKS = [
  { href: "/markets",  label: "Markets"  },
  { href: "/trade",    label: "Trade"    },
  { href: "/orders",   label: "Orders"   },
  { href: "/account",  label: "Account"  },
  { href: "/transfer", label: "Transfer" },
  { href: "/activity", label: "Activity" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address } = useAccount();

  return (
    <header
      className="fixed top-0 inset-x-0 z-50"
      style={{
        background: "oklch(6.5% 0.007 65)",
        borderBottom: "1px solid var(--border)",
        height: "48px",
      }}
    >
      <nav
        className="mx-auto flex h-full items-center gap-0 px-5 sm:px-7"
        style={{ maxWidth: "1400px" }}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 mr-7">
          <span
            style={{
              fontFamily: "var(--font-space-grotesk)",
              fontWeight: 700,
              fontSize: "15px",
              letterSpacing: "-0.01em",
              color: "var(--fg)",
            }}
          >
            COREX
          </span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}
          >
            TEE
          </span>
        </Link>

        {/* Vertical rule */}
        <div
          className="mr-7 shrink-0"
          style={{ width: "1px", height: "16px", background: "var(--border-strong)" }}
        />

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="px-3 py-1 text-xs font-medium transition-colors duration-150"
                style={{
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  borderBottom: active
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
                  paddingBottom: active ? "calc(0.25rem - 1px)" : "0.25rem",
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Address */}
        {address && (
          <span
            className="hidden sm:flex items-center gap-1.5 mr-4"
            style={{ fontSize: "11px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}
          >
            <span
              style={{
                display: "inline-block",
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--buy)",
                flexShrink: 0,
              }}
            />
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}

        <ConnectWalletButton />
      </nav>
    </header>
  );
}
