"use client";

import { useEffect, useState } from "react";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrders } from "@/lib/api";

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

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  OPEN: { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
  PARTIAL: { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" },
  FILLED: { bg: "rgba(99,102,241,0.12)", color: "#a5b4fc" },
  CANCELED: { bg: "rgba(239,68,68,0.08)", color: "#f87171" },
};

function OrdersView({ address }: { address: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<Status>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchOrders(address, status || undefined)
      .then((d) => setOrders(d.orders ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address, status]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Orders</h1>
          <p className="mt-1 text-sm font-mono" style={{ color: "var(--muted)" }}>
            {address}
          </p>
        </div>

        {/* Status filter tabs */}
        <div
          className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--card-border)" }}
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150"
              style={
                status === s
                  ? { background: "rgba(255,255,255,0.1)", color: "#fff" }
                  : { color: "var(--muted)" }
              }
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
            <CardTitle>
              {status || "All"} orders
            </CardTitle>
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              {orders.length} result{orders.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>

          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              No orders found.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {orders.map((o) => {
                const style = STATUS_STYLES[o.status] ?? { bg: "rgba(255,255,255,0.06)", color: "#fff" };
                return (
                  <div
                    key={o.orderId}
                    className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl px-4 py-3 sm:grid-cols-4"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {/* Side + price */}
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background: o.side === "BUY" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                          color: o.side === "BUY" ? "#4ade80" : "#f87171",
                        }}
                      >
                        {o.side}
                      </span>
                      <span className="text-sm font-semibold text-white tabular-nums">
                        {o.price}
                      </span>
                    </div>

                    {/* Qty */}
                    <div className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                      <span className="text-white">{o.remainingQty}</span>
                      <span className="mx-1">/</span>
                      {o.initialQty}
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {o.status}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {o.timeInForce}
                      </span>
                    </div>

                    {/* Order ID */}
                    <div className="text-xs font-mono truncate" style={{ color: "var(--muted)" }}>
                      {o.orderId.slice(0, 14)}…
                    </div>
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

export default function OrdersPage() {
  return <AddressGuard>{(address) => <OrdersView address={address} />}</AddressGuard>;
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-14 rounded-xl"
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
