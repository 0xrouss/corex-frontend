"use client";

import { useEffect, useState } from "react";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchActivity, fetchMarkets } from "@/lib/api";
import { formatTokenAmount } from "@/lib/corex";

interface Deposit {
  depositId: string;
  user: string;
  token: string;
  amount: string;
  seq: string;
}

interface Withdrawal {
  user: string;
  token: string;
  amount: string;
  recipient: string;
  withdrawNonce: string;
  authorizedSigner: string;
  authorizationDigest: string;
  teeAuth: string;
  seq: string;
}

interface ActivityData {
  account: string;
  deposits: Deposit[];
  withdrawals: Withdrawal[];
}

interface TokenMeta {
  symbol: string;
  decimals: number;
}

function ActivityView({ address }: { address: string }) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [tokenMap, setTokenMap] = useState<Record<string, TokenMeta>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchActivity(address), fetchMarkets()])
      .then(([activityData, marketsData]) => {
        setData(activityData);
        const map: Record<string, TokenMeta> = {};
        for (const t of marketsData.tokens ?? []) {
          map[t.address.toLowerCase()] = { symbol: t.symbol, decimals: t.decimals };
        }
        setTokenMap(map);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  function formatAmount(raw: string, tokenAddress: string): string {
    const meta = tokenMap[tokenAddress.toLowerCase()];
    if (!meta) return raw;
    try {
      return formatTokenAmount(raw, meta.decimals);
    } catch {
      return raw;
    }
  }

  function tokenLabel(tokenAddress: string): string {
    const meta = tokenMap[tokenAddress.toLowerCase()];
    return meta ? meta.symbol : `${tokenAddress.slice(0, 10)}…${tokenAddress.slice(-4)}`;
  }

  return (
    <div className="mx-auto px-5 py-10 sm:px-7" style={{ maxWidth: "760px" }}>
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
          Activity
        </h1>
        <p style={{ marginTop: "4px", fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
          {address}
        </p>
      </div>

      {loading && <Skeleton />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Deposits */}
          <Card>
            <CardHeader>
              <CardTitle>Deposits</CardTitle>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                {data.deposits.length}
              </span>
            </CardHeader>

            {data.deposits.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "8px 0" }}>No deposits.</p>
            ) : (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 60px",
                    gap: "0 12px",
                    padding: "0 0 8px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {["Token", "Amount", "Seq"].map((h) => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-space-grotesk)" }}>
                      {h}
                    </span>
                  ))}
                </div>

                {data.deposits.map((d, i) => (
                  <div
                    key={d.depositId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 60px",
                      gap: "0 12px",
                      padding: "10px 0",
                      borderBottom: i < data.deposits.length - 1 ? "1px solid var(--border)" : "none",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
                      {tokenLabel(d.token)}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--buy)", fontVariantNumeric: "tabular-nums" }}>
                      +{formatAmount(d.amount, d.token)}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                      {d.seq}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Withdrawals */}
          <Card>
            <CardHeader>
              <CardTitle>Withdrawals</CardTitle>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                {data.withdrawals.length}
              </span>
            </CardHeader>

            {data.withdrawals.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "8px 0" }}>No withdrawals.</p>
            ) : (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 1fr 60px",
                    gap: "0 12px",
                    padding: "0 0 8px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {["Token", "Amount", "Recipient", "Nonce"].map((h) => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-space-grotesk)" }}>
                      {h}
                    </span>
                  ))}
                </div>

                {data.withdrawals.map((w, i) => (
                  <div
                    key={`${w.withdrawNonce}-${w.seq}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 1fr 60px",
                      gap: "0 12px",
                      padding: "10px 0",
                      borderBottom: i < data.withdrawals.length - 1 ? "1px solid var(--border)" : "none",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
                      {tokenLabel(w.token)}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--sell)", fontVariantNumeric: "tabular-nums" }}>
                      -{formatAmount(w.amount, w.token)}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.recipient.slice(0, 10)}…{w.recipient.slice(-6)}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                      {w.withdrawNonce}
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

export default function ActivityPage() {
  return <AddressGuard>{(address) => <ActivityView address={address} />}</AddressGuard>;
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: "140px",
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
