import {
  buildCorexReadAuthHeaders,
  type CorexReadAuth,
} from "@/lib/corex-read-auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:6680";

export async function fetchCorexConfig() {
  const res = await fetch("/api/corex/config");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch Corex config");
  return data;
}

export async function fetchProxyResult(instructionId: string) {
  const res = await fetch(`/api/corex/proxy-result/${instructionId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch proxy result");
  return data;
}

export async function submitWithdrawIntent(payload: {
  user: string;
  token: string;
  amount: string;
  recipient: string;
  nonce: string;
  deadline: string;
  signature: string;
}) {
  const res = await fetch("/api/corex/withdraw-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to submit withdraw intent");
  return data;
}

export async function fetchAccount(account: string, auth: CorexReadAuth) {
  const res = await fetch(`/api/corex/account?account=${encodeURIComponent(account)}`, {
    headers: buildCorexReadAuthHeaders(auth),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch account");
  return data;
}

export async function fetchOrders(account: string, auth: CorexReadAuth, status?: string) {
  const search = new URLSearchParams({ account });
  if (status) search.set("status", status);
  const res = await fetch(`/api/corex/orders?${search.toString()}`, {
    headers: buildCorexReadAuthHeaders(auth),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch orders");
  return data;
}

export async function fetchMarkets() {
  const res = await fetch(`${API_BASE}/markets`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch markets");
  return data;
}

export async function fetchActivity(account: string, auth: CorexReadAuth) {
  const res = await fetch(`/api/corex/activity?account=${encodeURIComponent(account)}`, {
    headers: buildCorexReadAuthHeaders(auth),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch activity");
  return data;
}

export async function fetchState() {
  const res = await fetch(`${API_BASE}/state`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch state");
  return data;
}
