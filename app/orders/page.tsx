"use client";

import { useEffect, useState } from "react";
import { useSignTypedData } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrders, fetchMarkets } from "@/lib/api";
import { ensureCorexReadAuth } from "@/lib/corex-read-auth";
import { formatTokenAmount } from "@/lib/corex";

const STATUSES = ["", "OPEN", "PARTIAL", "FILLED", "CANCELED"] as const;
type Status = (typeof STATUSES)[number];

interface Order {
  orderId: string;
  clientOrderId: string;
  user: string;
  marketId: string;
  side: "BUY" | "SELL";
  price: string;
  initialQty: string;
  remainingQty: string;
  lockedAmount: string;
  status: string;
  seq: string;
  timeInForce: string;
}

interface MarketMeta {
  baseDecimals: number;
  quoteDecimals: number;
  baseSymbol: string;
  quoteSymbol: string;
}

function safeFormat(raw: string, decimals: number): string {
  try {
    return formatTokenAmount(raw, decimals);
  } catch {
    return raw;
  }
}

function OrdersView({ address }: { address: string }) {
  const { signTypedDataAsync } = useSignTypedData();
  const [orders, setOrders] = useState<Order[]>([]);
  const [marketMap, setMarketMap] = useState<Record<string, MarketMeta>>({});
  const [status, setStatus] = useState<Status>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch markets once on mount
  useEffect(() => {
    fetchMarkets()
      .then((d) => {
        const tokens: Record<string, { symbol: string }> = {};
        for (const t of d.tokens ?? []) tokens[t.address.toLowerCase()] = { symbol: t.symbol };

        const map: Record<string, MarketMeta> = {};
        for (const m of d.markets ?? []) {
          const meta: MarketMeta = {
            baseDecimals: m.baseDecimals,
            quoteDecimals: m.quoteDecimals,
            baseSymbol: tokens[m.baseToken.toLowerCase()]?.symbol ?? "BASE",
            quoteSymbol: tokens[m.quoteToken.toLowerCase()]?.symbol ?? "QUOTE",
          };
          map[m.marketId] = meta;
          if (m.marketIdBytes32) map[m.marketIdBytes32.toLowerCase()] = meta;
        }
        setMarketMap(map);
      })
      .catch(() => {}); // non-critical — fall back to raw values
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const auth = await ensureCorexReadAuth({ address: address as `0x${string}`, signTypedDataAsync });
        const data = await fetchOrders(address, auth, status || undefined);
        if (!cancelled) {
          setOrders(data.orders ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to fetch orders");
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
  }, [address, signTypedDataAsync, status]);

  return (
    <div className="mx-auto px-5 py-10 sm:px-7" style={{ maxWidth: "960px" }}>
      <div style={{ marginBottom: "28px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div>
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
            Orders
          </h1>
          <p style={{ marginTop: "4px", fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
            {address}
          </p>
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: "2px" }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                padding: "5px 12px",
                borderRadius: "2px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                cursor: "pointer",
                transition: "all 0.1s ease",
                fontFamily: "var(--font-space-grotesk)",
                textTransform: "uppercase",
                ...(status === s
                  ? { background: "var(--bg-surface)", border: "1px solid var(--border-strong)", color: "var(--fg)" }
                  : { background: "transparent", border: "1px solid var(--border)", color: "var(--fg-subtle)" }
                ),
              }}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {loading && <TableSkeleton />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>{status || "All"} orders</CardTitle>
            <span style={{ fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
              {orders.length} result{orders.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>

          {orders.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "var(--fg-subtle)" }}>No orders found</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr 140px 80px 80px 1fr",
                  gap: "0 12px",
                  padding: "0 0 8px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {["Side", "Price", "Qty (rem / total)", "Status", "TIF", "Order ID"].map((h) => (
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

              {orders.map((o, i) => {
                const meta = marketMap[o.marketId] ?? marketMap[o.marketId.toLowerCase()];
                return (
                  <div
                    key={o.orderId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "52px 1fr 140px 80px 80px 1fr",
                      gap: "0 12px",
                      padding: "10px 0",
                      borderBottom: i < orders.length - 1 ? "1px solid var(--border)" : "none",
                      alignItems: "center",
                    }}
                  >
                    {/* Side */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: o.side === "BUY" ? "var(--buy)" : "var(--sell)",
                      }}
                    >
                      {o.side}
                    </span>

                    {/* Price */}
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                      {meta ? safeFormat(o.price, meta.quoteDecimals) : o.price}
                      {meta && (
                        <span style={{ marginLeft: "4px", fontSize: "10px", color: "var(--fg-subtle)" }}>
                          {meta.quoteSymbol}
                        </span>
                      )}
                    </span>

                    {/* Qty */}
                    <span style={{ fontSize: "12px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "var(--fg)" }}>
                        {meta ? safeFormat(o.remainingQty, meta.baseDecimals) : o.remainingQty}
                      </span>
                      <span style={{ margin: "0 3px", color: "var(--fg-subtle)" }}>/</span>
                      {meta ? safeFormat(o.initialQty, meta.baseDecimals) : o.initialQty}
                      {meta && (
                        <span style={{ marginLeft: "4px", fontSize: "10px", color: "var(--fg-subtle)" }}>
                          {meta.baseSymbol}
                        </span>
                      )}
                    </span>

                    {/* Status */}
                    <StatusPill status={o.status} />

                    {/* TIF */}
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
                      {o.timeInForce}
                    </span>

                    {/* ID */}
                    <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.orderId.slice(0, 14)}…
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    OPEN:     { bg: "var(--buy-dim)",    color: "var(--buy)"    },
    PARTIAL:  { bg: "var(--accent-dim)", color: "var(--accent)" },
    FILLED:   { bg: "oklch(55% 0.10 260 / 0.12)", color: "oklch(72% 0.08 260)" },
    CANCELED: { bg: "var(--sell-dim)",   color: "var(--sell)"   },
  };
  const s = styles[status] ?? { bg: "var(--bg-surface)", color: "var(--fg-muted)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: "2px",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        background: s.bg,
        color: s.color,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

export default function OrdersPage() {
  return <AddressGuard>{(address) => <OrdersView address={address} />}</AddressGuard>;
}

function TableSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: "44px",
            borderRadius: "3px",
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
