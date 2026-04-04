"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMarkets } from "@/lib/api";

interface Market {
  marketId: string;
  marketIdBytes32: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals: number;
  quoteDecimals: number;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  role: string;
}

interface MarketsData {
  markets: Market[];
  tokens: Token[];
}

export default function MarketsPage() {
  const [data, setData] = useState<MarketsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarkets()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto px-5 py-10 sm:px-7" style={{ maxWidth: "760px" }}>
      <PageHeader
        title="Markets"
        subtitle="Active market metadata from the TEE runtime"
      />

      {loading && <Skeleton rows={3} />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Markets */}
          <Card>
            <CardHeader>
              <CardTitle>Markets</CardTitle>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                {data.markets.length} active
              </span>
            </CardHeader>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.markets.map((m, i) => (
                <div
                  key={m.marketId}
                  style={{
                    padding: "12px 0",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-space-grotesk)",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--fg)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {m.marketId}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                      {m.baseDecimals}dp / {m.quoteDecimals}dp
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    {[
                      { label: "base",    value: m.baseToken },
                      { label: "quote",   value: m.quoteToken },
                      { label: "bytes32", value: m.marketIdBytes32, truncate: true },
                    ].map(({ label, value, truncate }) => (
                      <div key={label} style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
                        <span style={{ width: "44px", flexShrink: 0, color: "var(--fg-subtle)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {label}
                        </span>
                        <span
                          style={{
                            color: "var(--fg-muted)",
                            fontVariantNumeric: "tabular-nums",
                            overflow: truncate ? "hidden" : undefined,
                            textOverflow: truncate ? "ellipsis" : undefined,
                            whiteSpace: truncate ? "nowrap" : undefined,
                          }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Tokens */}
          <Card>
            <CardHeader>
              <CardTitle>Tokens</CardTitle>
            </CardHeader>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.tokens.map((t, i) => (
                <div
                  key={t.address}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 0",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <RolePill role={t.role} />
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)" }}>{t.symbol}</span>
                      <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--fg-muted)" }}>{t.name}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "11px", color: "var(--fg-muted)" }}>
                    <span>{t.decimals} dp</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {t.address.slice(0, 8)}…{t.address.slice(-6)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    BASE:  { bg: "oklch(55% 0.10 260 / 0.14)", color: "oklch(75% 0.08 260)" },
    QUOTE: { bg: "var(--accent-dim)",           color: "var(--accent)" },
  };
  const s = styles[role] ?? { bg: "var(--bg-surface)", color: "var(--fg-muted)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: "2px",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        background: s.bg,
        color: s.color,
      }}
    >
      {role}
    </span>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
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
        {title}
      </h1>
      <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--fg-muted)" }}>
        {subtitle}
      </p>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: "80px",
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
        borderRadius: "4px",
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
