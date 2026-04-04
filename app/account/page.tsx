"use client";

import { useEffect, useState } from "react";
import { useSignTypedData } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAccount, fetchMarkets } from "@/lib/api";
import { ensureCorexReadAuth } from "@/lib/corex-read-auth";
import { formatTokenAmount } from "@/lib/corex";

interface Balance {
  available: string;
  locked: string;
}

interface AccountData {
  account: string;
  balances: Record<string, Balance>;
  withdrawNonce: string;
}

interface TokenMeta {
  symbol: string;
  decimals: number;
}

function AccountView({ address }: { address: string }) {
  const { signTypedDataAsync } = useSignTypedData();
  const [data, setData] = useState<AccountData | null>(null);
  const [tokenMap, setTokenMap] = useState<Record<string, TokenMeta>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const auth = await ensureCorexReadAuth({ address: address as `0x${string}`, signTypedDataAsync });
        const [accountData, marketsData] = await Promise.all([
          fetchAccount(address, auth),
          fetchMarkets(),
        ]);
        if (cancelled) {
          return;
        }
        setData(accountData);
        const map: Record<string, TokenMeta> = {};
        for (const t of marketsData.tokens ?? []) {
          map[t.address.toLowerCase()] = { symbol: t.symbol, decimals: t.decimals };
        }
        setTokenMap(map);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to fetch account");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, signTypedDataAsync]);

  function formatBalance(raw: string, tokenAddress: string): string {
    const meta = tokenMap[tokenAddress.toLowerCase()];
    if (!meta) return raw;
    return formatTokenAmount(raw, meta.decimals);
  }

  function tokenLabel(tokenAddress: string): string {
    const meta = tokenMap[tokenAddress.toLowerCase()];
    return meta ? meta.symbol : `${tokenAddress.slice(0, 8)}…${tokenAddress.slice(-4)}`;
  }

  return (
    <div className="mx-auto px-5 py-10 sm:px-7" style={{ maxWidth: "640px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontFamily: "var(--font-space-grotesk)",
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--fg)",
            margin: 0,
          }}
        >
          Account
        </h1>
        <p style={{ marginTop: "4px", fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
          {address}
        </p>
      </div>

      {loading && <Skeleton />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Withdraw nonce */}
          <Card>
            <CardHeader>
              <CardTitle>Withdraw Nonce</CardTitle>
            </CardHeader>
            <span
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {data.withdrawNonce}
            </span>
          </Card>

          {/* Balances */}
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                {Object.keys(data.balances).length} token{Object.keys(data.balances).length !== 1 ? "s" : ""}
              </span>
            </CardHeader>

            {Object.keys(data.balances).length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "8px 0" }}>
                No balances. Deposit to get started.
              </p>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px",
                    gap: "0 12px",
                    padding: "0 0 8px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {["Token", "Available", "Locked"].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--fg-subtle)",
                        fontFamily: "var(--font-space-grotesk)",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {Object.entries(data.balances).map(([token, bal], i) => (
                  <div
                    key={token}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 120px",
                      gap: "0 12px",
                      padding: "10px 0",
                      borderBottom: i < Object.keys(data.balances).length - 1 ? "1px solid var(--border)" : "none",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {tokenLabel(token)}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                      {formatBalance(bal.available, token)}
                    </span>
                    <span style={{ fontSize: "13px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {formatBalance(bal.locked, token)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  return <AddressGuard>{(address) => <AccountView address={address} />}</AddressGuard>;
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: "100px",
            borderRadius: "4px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        />
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: "3px",
        fontSize: "12px",
        background: "var(--error-dim)",
        border: "1px solid var(--error-border)",
        color: "var(--error)",
      }}
    >
      {message}
    </div>
  );
}
