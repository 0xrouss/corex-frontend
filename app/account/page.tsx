"use client";

import { useEffect, useState } from "react";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAccount } from "@/lib/api";

interface Balance {
  available: string;
  locked: string;
}

interface AccountData {
  account: string;
  balances: Record<string, Balance>;
  withdrawNonce: string;
}

function AccountView({ address }: { address: string }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAccount(address)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Account</h1>
        <p className="mt-1 text-sm font-mono" style={{ color: "var(--muted)" }}>
          {address}
        </p>
      </div>

      {loading && <Skeleton />}
      {error && <ErrorBanner message={error} />}

      {data && (
        <div className="flex flex-col gap-4">
          {/* Withdraw nonce */}
          <Card>
            <CardHeader>
              <CardTitle>Withdraw Nonce</CardTitle>
            </CardHeader>
            <span className="text-3xl font-semibold tabular-nums text-white">
              {data.withdrawNonce}
            </span>
          </Card>

          {/* Balances */}
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
            </CardHeader>
            {Object.keys(data.balances).length === 0 ? (
              <p style={{ color: "var(--muted)" }} className="text-sm">
                No balances yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(data.balances).map(([token, bal]) => (
                  <div
                    key={token}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                      {token.slice(0, 10)}…{token.slice(-6)}
                    </span>
                    <div className="flex items-center gap-4 text-sm tabular-nums">
                      <span className="text-white">
                        <span style={{ color: "var(--muted)" }} className="mr-1 text-xs">avail</span>
                        {bal.available}
                      </span>
                      <span style={{ color: "var(--muted)" }}>
                        <span className="mr-1 text-xs">locked</span>
                        {bal.locked}
                      </span>
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

export default function AccountPage() {
  return <AddressGuard>{(address) => <AccountView address={address} />}</AddressGuard>;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="h-28 rounded-2xl"
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
