"use client";

import { useEffect, useState } from "react";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchActivity } from "@/lib/api";

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

function ActivityView({ address }: { address: string }) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchActivity(address)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Activity</h1>
        <p className="mt-1 text-sm font-mono" style={{ color: "var(--muted)" }}>
          {address}
        </p>
      </div>

      {loading && <Skeleton />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div className="flex flex-col gap-6">
          {/* Deposits */}
          <Card>
            <CardHeader>
              <CardTitle>Deposits</CardTitle>
              <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                {data.deposits.length}
              </span>
            </CardHeader>
            {data.deposits.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
                No deposits.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.deposits.map((d) => (
                  <div
                    key={d.depositId}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(34,197,94,0.04)",
                      border: "1px solid rgba(34,197,94,0.1)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}
                      >
                        DEPOSIT
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                        {d.token.slice(0, 10)}…{d.token.slice(-4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-white">
                        +{d.amount}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        seq {d.seq}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Withdrawals */}
          <Card>
            <CardHeader>
              <CardTitle>Withdrawals</CardTitle>
              <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                {data.withdrawals.length}
              </span>
            </CardHeader>
            {data.withdrawals.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
                No withdrawals.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.withdrawals.map((w) => (
                  <div
                    key={`${w.withdrawNonce}-${w.seq}`}
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(239,68,68,0.04)",
                      border: "1px solid rgba(239,68,68,0.1)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-md"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
                        >
                          WITHDRAW
                        </span>
                        <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                          {w.token.slice(0, 10)}…{w.token.slice(-4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums text-white">
                          -{w.amount}
                        </span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          nonce {w.withdrawNonce}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-mono" style={{ color: "var(--muted)" }}>
                      → {w.recipient.slice(0, 12)}…{w.recipient.slice(-6)}
                    </div>
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
