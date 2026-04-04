const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:6680";

export async function fetchAccount(account: string) {
  const res = await fetch(`${API_BASE}/account?account=${encodeURIComponent(account)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch account");
  return data;
}

export async function fetchOrders(account: string, status?: string) {
  const url = new URL(`${API_BASE}/orders`);
  url.searchParams.set("account", account);
  if (status) url.searchParams.set("status", status);
  const res = await fetch(url.toString());
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

export async function fetchActivity(account: string) {
  const res = await fetch(`${API_BASE}/activity?account=${encodeURIComponent(account)}`);
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
