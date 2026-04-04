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
    <div className="mx-auto px-5 py-10 sm:px-7" style={{ maxWidth: "960px" }}>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            State
          </h1>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              padding: "2px 7px",
              borderRadius: "2px",
              background: "var(--sell-dim)",
              border: "1px solid var(--sell-border)",
              color: "var(--sell)",
              textTransform: "uppercase",
            }}
          >
            Debug
          </span>
        </div>
        <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--fg-muted)" }}>
          Full serialized TEE runtime state — memory-backed, resets on restart
        </p>
      </div>

      {loading && (
        <div
          style={{
            height: "240px",
            borderRadius: "4px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        />
      )}

      {error && (
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
          {error}
        </div>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Raw State</CardTitle>
          </CardHeader>
          <pre
            style={{
              overflow: "auto",
              borderRadius: "3px",
              padding: "14px",
              fontSize: "11px",
              lineHeight: 1.6,
              maxHeight: "70vh",
              background: "oklch(6% 0.007 65)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border)",
              margin: 0,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
