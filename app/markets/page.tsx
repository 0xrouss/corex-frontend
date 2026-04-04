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

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  BASE: { bg: "rgba(99,102,241,0.12)", color: "#a5b4fc" },
  QUOTE: { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" },
};

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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Markets</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Active market metadata from the TEE runtime
        </p>
      </div>

      {loading && <Skeleton />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div className="flex flex-col gap-6">
          {/* Markets */}
          <Card>
            <CardHeader>
              <CardTitle>Markets</CardTitle>
              <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                {data.markets.length} active
              </span>
            </CardHeader>
            <div className="flex flex-col gap-3">
              {data.markets.map((m) => (
                <div
                  key={m.marketId}
                  className="rounded-xl px-4 py-4"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-semibold tracking-tight text-white">
                      {m.marketId}
                    </span>
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                      <span>base dec: {m.baseDecimals}</span>
                      <span>·</span>
                      <span>quote dec: {m.quoteDecimals}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs font-mono" style={{ color: "var(--muted)" }}>
                    <div className="flex gap-2">
                      <span className="w-20 shrink-0">base</span>
                      <span className="text-white/70">{m.baseToken}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 shrink-0">quote</span>
                      <span className="text-white/70">{m.quoteToken}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 shrink-0">bytes32</span>
                      <span className="text-white/40 truncate">{m.marketIdBytes32}</span>
                    </div>
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
            <div className="flex flex-col gap-3">
              {data.tokens.map((t) => {
                const style = ROLE_STYLES[t.role] ?? { bg: "rgba(255,255,255,0.06)", color: "#fff" };
                return (
                  <div
                    key={t.address}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {t.role}
                      </span>
                      <div>
                        <span className="text-sm font-semibold text-white">{t.symbol}</span>
                        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>{t.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                      <span>decimals: {t.decimals}</span>
                      <span className="font-mono hidden sm:inline">
                        {t.address.slice(0, 10)}…{t.address.slice(-6)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="h-40 rounded-2xl"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        />
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        color: "#f87171",
      }}
    >
      {message}
    </div>
  );
}
