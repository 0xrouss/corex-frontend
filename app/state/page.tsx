"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchState } from "@/lib/api";

export default function StatePage() {
  const [data, setData] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchState()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white">State</h1>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            debug
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Full serialized TEE runtime state — memory-backed, resets on restart
        </p>
      </div>

      {loading && (
        <div
          className="h-64 rounded-2xl animate-pulse"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        />
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Raw State</CardTitle>
          </CardHeader>
          <pre
            className="overflow-auto rounded-xl p-4 text-xs leading-relaxed"
            style={{
              background: "rgba(0,0,0,0.3)",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.05)",
              maxHeight: "70vh",
              fontFamily: "var(--font-geist-mono), monospace",
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
