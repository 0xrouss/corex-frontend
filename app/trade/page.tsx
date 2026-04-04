"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  corexInstructionSenderAbi,
  decodeHexJson,
  formatTokenAmount,
  getErrorMessage,
  getInstructionIdFromReceipt,
  normalizeProxyActionResult,
  parseAmountInput,
  shortAddress,
  type CorexFrontendConfig,
} from "@/lib/corex";
import {
  fetchAccount,
  fetchCorexConfig,
  fetchMarkets,
  fetchOrders,
  fetchProxyResult,
} from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  role: string;
}

interface Market {
  marketId: string;
  marketIdBytes32: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals: number;
  quoteDecimals: number;
}

interface MarketsData {
  markets: Market[];
  tokens: Token[];
}

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
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELED";
  seq: string;
  timeInForce: string;
}

interface PlaceOrderFill {
  makerOrderId: string;
  makerUser: string;
  takerUser: string;
  qty: string;
  price: string;
}

interface PlaceOrderResult {
  orderId: string;
  status: string;
  filledQty: string;
  remainingQty: string;
  lockedAmount: string;
  fills: PlaceOrderFill[];
}

interface CancelOrderResult {
  orderId: string;
  status: string;
  unlockedAmount: string;
}

interface Balance {
  available: string;
  locked: string;
}

interface ActionState {
  kind: "idle" | "pending" | "success" | "error";
  stage?: string;
  message?: string;
  txHash?: Hex;
  instructionId?: Hex;
}

type Side = "BUY" | "SELL";
type TimeInForce = "GTC" | "IOC" | "FOK";

const TIF_INFO: Record<TimeInForce, { label: string; description: string }> = {
  GTC: { label: "GTC", description: "Good-Till-Cancelled — stays open until filled or manually canceled." },
  IOC: { label: "IOC", description: "Immediate-Or-Cancel — fills what matches now, cancels the rest." },
  FOK: { label: "FOK", description: "Fill-Or-Kill — must fill entirely right now or the whole order is canceled." },
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  OPEN:     { bg: "rgba(34,197,94,0.12)",    color: "#4ade80" },
  PARTIAL:  { bg: "rgba(245,158,11,0.12)",   color: "#fbbf24" },
  FILLED:   { bg: "rgba(99,102,241,0.12)",   color: "#a5b4fc" },
  CANCELED: { bg: "rgba(239,68,68,0.08)",    color: "#f87171" },
};

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateClientOrderId(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function assertSuccessfulReceipt(
  receipt: { status: "success" | "reverted"; transactionHash: Hex },
  action: string,
) {
  if (receipt.status === "success") return;
  throw new Error(`${action} transaction reverted: ${receipt.transactionHash}`);
}

function safeFormatAmount(raw: string, decimals: number) {
  try {
    return formatTokenAmount(raw, decimals);
  } catch {
    return raw;
  }
}

function lockedAmountPreview(
  side: Side,
  price: string,
  qty: string,
  market: Market,
  tokens: Token[],
): string {
  const base = tokens.find((t) => t.address.toLowerCase() === market.baseToken.toLowerCase());
  const quote = tokens.find((t) => t.address.toLowerCase() === market.quoteToken.toLowerCase());
  if (!base || !quote) return "—";

  const p = parseFloat(price);
  const q = parseFloat(qty);
  if (!p || !q || isNaN(p) || isNaN(q)) return "—";

  if (side === "BUY") {
    return `~${(p * q).toFixed(4)} ${quote.symbol} locked`;
  }
  return `~${q.toFixed(4)} ${base.symbol} locked`;
}

// ─── Main view ───────────────────────────────────────────────────────────────

function TradeView({ address }: { address: string }) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [config, setConfig] = useState<CorexFrontendConfig | null>(null);
  const [marketsData, setMarketsData] = useState<MarketsData | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [teeExtensionRegistryAddress, setTeeExtensionRegistryAddress] = useState<Address | null>(null);

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, Balance>>({});

  // Form state
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [tif, setTif] = useState<TimeInForce>("GTC");

  // Action states
  const [placeState, setPlaceState] = useState<ActionState>({ kind: "idle" });
  const [cancelStates, setCancelStates] = useState<Record<string, ActionState>>({});

  const base = marketsData?.tokens.find(
    (t) => t.address.toLowerCase() === selectedMarket?.baseToken.toLowerCase(),
  );
  const quote = marketsData?.tokens.find(
    (t) => t.address.toLowerCase() === selectedMarket?.quoteToken.toLowerCase(),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    const [cfg, markets] = await Promise.all([fetchCorexConfig(), fetchMarkets()]);
    setConfig(cfg);
    setMarketsData(markets);
    if (markets.markets.length > 0) setSelectedMarket(markets.markets[0]);
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const data = await fetchAccount(address);
      setBalances(data.balances ?? {});
    } catch {
      // non-critical, balances will show as empty
    }
  }, [address]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const [open, partial] = await Promise.all([
        fetchOrders(address, "OPEN"),
        fetchOrders(address, "PARTIAL"),
      ]);
      setActiveOrders([...(open.orders ?? []), ...(partial.orders ?? [])]);
    } catch (e) {
      setLoadError(getErrorMessage(e));
    } finally {
      setLoadingOrders(false);
    }
  }, [address]);

  useEffect(() => {
    loadConfig().catch((e: unknown) => setLoadError(getErrorMessage(e)));
  }, [loadConfig]);

  useEffect(() => {
    void loadOrders();
    void loadAccount();
  }, [loadOrders, loadAccount]);

  // Fetch TEE registry address once config is loaded
  useEffect(() => {
    if (!config || !publicClient) return;
    let cancelled = false;

    publicClient
      .readContract({
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "teeExtensionRegistry",
      })
      .then((addr) => {
        if (!cancelled) setTeeExtensionRegistryAddress(addr as Address);
      })
      .catch(() => { /* non-critical */ });

    return () => { cancelled = true; };
  }, [config, publicClient]);

  // ── Place order ───────────────────────────────────────────────────────────

  async function handlePlaceOrder() {
    if (!config || !publicClient || !selectedMarket || !base || !quote) return;

    try {
      const priceRaw = parseAmountInput(price, quote.decimals);
      const qtyRaw = BigInt(Math.floor(parseFloat(qty)));
      const clientOrderId = generateClientOrderId();
      const sideUint8 = side === "BUY" ? 0 : 1;
      const tifUint8 = tif === "GTC" ? 0 : tif === "IOC" ? 1 : 2;

      setPlaceState({
        kind: "pending",
        stage: "Placing order",
        message: `Sending ${side} order to TEE via contract…`,
      });

      const hash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "placeOrder",
        args: [
          {
            user: address as Address,
            clientOrderId,
            marketId: selectedMarket.marketIdBytes32 as Hex,
            side: sideUint8,
            price: priceRaw,
            qty: qtyRaw,
            timeInForce: tifUint8,
          },
        ],
        value: BigInt(config.feeWei),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assertSuccessfulReceipt(receipt, "placeOrder");

      const instructionId = getInstructionIdFromReceipt(
        receipt,
        teeExtensionRegistryAddress ?? undefined,
      );

      setPlaceState({
        kind: "pending",
        stage: "Waiting for TEE",
        message: "Polling TEE for order confirmation…",
        txHash: hash,
        instructionId,
      });

      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) {
        throw new Error(actionResult.log ?? "TEE placeOrder failed");
      }

      const result = decodeHexJson<PlaceOrderResult>(actionResult.data);

      setPrice("");
      setQty("");
      setPlaceState({
        kind: "success",
        stage: "Order placed",
        message: `${side} order ${result.status}${result.fills?.length ? ` — ${result.fills.length} fill(s)` : ""}. Order ID: ${shortAddress(result.orderId)}`,
        txHash: hash,
        instructionId,
      });

      await Promise.all([loadOrders(), loadAccount()]);
    } catch (error) {
      setPlaceState({
        kind: "error",
        stage: "Order failed",
        message: getErrorMessage(error),
      });
    }
  }

  // ── Cancel order ──────────────────────────────────────────────────────────

  async function handleCancelOrder(orderId: string) {
    if (!config || !publicClient) return;

    setCancelStates((prev) => ({
      ...prev,
      [orderId]: { kind: "pending", stage: "Canceling", message: "Sending cancel to TEE…" },
    }));

    try {
      const hash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "cancelOrder",
        args: [
          {
            user: address as Address,
            orderId: orderId as Hex,
          },
        ],
        value: BigInt(config.feeWei),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assertSuccessfulReceipt(receipt, "cancelOrder");

      const instructionId = getInstructionIdFromReceipt(
        receipt,
        teeExtensionRegistryAddress ?? undefined,
      );

      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) {
        throw new Error(actionResult.log ?? "TEE cancelOrder failed");
      }

      const result = decodeHexJson<CancelOrderResult>(actionResult.data);

      setCancelStates((prev) => ({
        ...prev,
        [orderId]: {
          kind: "success",
          stage: "Canceled",
          message: `Order canceled. Unlocked: ${result.unlockedAmount}`,
          txHash: hash,
          instructionId,
        },
      }));

      await Promise.all([loadOrders(), loadAccount()]);
    } catch (error) {
      setCancelStates((prev) => ({
        ...prev,
        [orderId]: {
          kind: "error",
          stage: "Cancel failed",
          message: getErrorMessage(error),
        },
      }));
    }
  }

  // Balances for base and quote tokens (case-insensitive key lookup)
  const findBalance = (tokenAddress: string) => {
    const key = Object.keys(balances).find(
      (k) => k.toLowerCase() === tokenAddress.toLowerCase(),
    );
    return key ? balances[key] : undefined;
  };
  const baseBalanceRaw = base ? findBalance(base.address) : undefined;
  const quoteBalanceRaw = quote ? findBalance(quote.address) : undefined;

  const baseAvailable = base && baseBalanceRaw
    ? parseFloat(formatUnits(BigInt(baseBalanceRaw.available), base.decimals))
    : null;
  const baseLocked = base && baseBalanceRaw
    ? parseFloat(formatUnits(BigInt(baseBalanceRaw.locked), base.decimals))
    : null;
  const quoteAvailable = quote && quoteBalanceRaw
    ? parseFloat(formatUnits(BigInt(quoteBalanceRaw.available), quote.decimals))
    : null;
  const quoteLocked = quote && quoteBalanceRaw
    ? parseFloat(formatUnits(BigInt(quoteBalanceRaw.locked), quote.decimals))
    : null;

  // Insufficient funds check.
  // qty is a plain integer (whole base units, not scaled by baseDecimals).
  // price is scaled by quoteDecimals. So BUY locks priceRaw * qtyInt raw quote atoms.
  // For SELL, compare whole-token quantities in human-readable terms.
  const priceFloat = parseFloat(price);
  const qtyFloat = parseFloat(qty);
  const insufficientFunds = (() => {
    if (!price || !qty || isNaN(priceFloat) || isNaN(qtyFloat)) return false;
    try {
      if (side === "BUY" && quote && quoteBalanceRaw) {
        const priceRaw = parseAmountInput(price, quote.decimals);
        const qtyInt = BigInt(Math.floor(qtyFloat));
        return priceRaw * qtyInt > BigInt(quoteBalanceRaw.available);
      }
      if (side === "SELL" && baseAvailable !== null) {
        // baseAvailable is in human-readable whole tokens (formatUnits applied)
        return qtyFloat > baseAvailable;
      }
    } catch {
      // invalid input — let the contract reject it
    }
    return false;
  })();

  const actionsDisabled = !config || !publicClient || !selectedMarket;
  const placePending = placeState.kind === "pending";
  const canPlace = !actionsDisabled && !placePending && !!price && !!qty && !insufficientFunds;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Trade</h1>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: "rgba(245,158,11,0.14)",
              border: "1px solid rgba(245,158,11,0.24)",
              color: "#fbbf24",
            }}
          >
            TEE order book
          </span>
        </div>
        <p className="text-sm font-mono" style={{ color: "var(--muted)" }}>{address}</p>
      </div>

      {loadError && <ErrorBanner message={loadError} />}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ── Place Order ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Place Order</CardTitle>
          </CardHeader>

          <div className="flex flex-col gap-5">
            {/* Market picker */}
            <Field label="Market">
              <select
                value={selectedMarket?.marketId ?? ""}
                onChange={(e) => {
                  const m = marketsData?.markets.find((mk) => mk.marketId === e.target.value);
                  if (m) setSelectedMarket(m);
                }}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={inputStyle}
              >
                {(marketsData?.markets ?? []).map((m) => (
                  <option key={m.marketId} value={m.marketId}>
                    {base?.symbol ?? "BASE"} / {quote?.symbol ?? "QUOTE"} · {shortAddress(m.marketId, 8, 6)}
                  </option>
                ))}
              </select>
            </Field>

            {/* Market info pill */}
            {selectedMarket && base && quote && (
              <div
                className="flex flex-wrap gap-3 rounded-xl px-4 py-3 text-xs font-mono"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span style={{ color: "var(--muted)" }}>
                  base <span className="text-white">{base.symbol}</span> ({base.decimals} dp)
                </span>
                <span style={{ color: "var(--muted)" }}>
                  quote <span className="text-white">{quote.symbol}</span> ({quote.decimals} dp)
                </span>
                <span style={{ color: "var(--muted)" }}>
                  fee <span className="text-white">{config?.feeWei ?? "—"} wei</span>
                </span>
              </div>
            )}

            {/* TEE Balances */}
            {base && quote && (
              <div
                className="grid grid-cols-2 gap-2"
              >
                {[
                  {
                    token: base,
                    available: baseAvailable,
                    locked: baseLocked,
                    highlighted: side === "SELL",
                  },
                  {
                    token: quote,
                    available: quoteAvailable,
                    locked: quoteLocked,
                    highlighted: side === "BUY",
                  },
                ].map(({ token, available, locked, highlighted }) => (
                  <div
                    key={token.address}
                    className="rounded-xl px-3 py-3"
                    style={{
                      background: highlighted ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                      border: highlighted
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: highlighted ? "#fff" : "var(--muted)" }}>
                      {token.symbol}
                    </p>
                    <p
                      className="mt-1 text-sm font-mono tabular-nums"
                      style={{ color: available !== null ? "#fff" : "var(--muted)" }}
                    >
                      {available !== null ? available.toFixed(4) : "—"}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {locked !== null ? `${locked.toFixed(4)} locked` : "available"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Side toggle */}
            <Field label="Side">
              <div
                className="flex rounded-xl p-1 gap-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {(["BUY", "SELL"] as Side[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-150"
                    style={
                      side === s
                        ? s === "BUY"
                          ? { background: "rgba(34,197,94,0.18)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.28)" }
                          : { background: "rgba(239,68,68,0.16)", color: "#f87171", border: "1px solid rgba(239,68,68,0.28)" }
                        : { color: "rgba(255,255,255,0.35)", border: "1px solid transparent" }
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            {/* Price */}
            <Field label={`Price (${quote?.symbol ?? "quote"} per ${base?.symbol ?? "base"})`}>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1.50"
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={inputStyle}
              />
            </Field>

            {/* Quantity */}
            <Field label={`Quantity (${base?.symbol ?? "base"})`}>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={inputStyle}
              />
            </Field>

            {/* Time In Force */}
            <Field label="Time In Force">
              <div className="flex flex-col gap-2">
                <div
                  className="flex rounded-xl p-1 gap-1"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {(["GTC", "IOC", "FOK"] as TimeInForce[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTif(t)}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all duration-150"
                      style={
                        tif === t
                          ? { background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }
                          : { color: "rgba(255,255,255,0.35)", border: "1px solid transparent" }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
                  {TIF_INFO[tif].description}
                </p>
              </div>
            </Field>

            {/* Preview */}
            {selectedMarket && base && quote && (
              <div
                className="rounded-2xl px-4 py-4"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
                  Order preview
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {[
                    `Side: ${side}`,
                    `Price: ${price || "—"} ${quote.symbol}/${base.symbol}`,
                    `Quantity: ${qty || "—"} ${base.symbol}`,
                    `Type: ${TIF_INFO[tif].label}`,
                    price && qty
                      ? lockedAmountPreview(side, price, qty, selectedMarket, marketsData?.tokens ?? [])
                      : "Locked: —",
                  ].map((line) => (
                    <p key={line} className="text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Insufficient funds warning */}
            {insufficientFunds && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#f87171",
                }}
              >
                {side === "BUY" && quote && quoteBalanceRaw
                  ? (() => {
                      try {
                        const needed = formatUnits(
                          parseAmountInput(price, quote.decimals) * BigInt(Math.floor(qtyFloat)),
                          quote.decimals,
                        );
                        const have = formatUnits(BigInt(quoteBalanceRaw.available), quote.decimals);
                        return `Insufficient ${quote.symbol}. Need ${needed}, have ${have}.`;
                      } catch {
                        return `Insufficient ${quote?.symbol} balance.`;
                      }
                    })()
                  : `Insufficient ${base?.symbol} balance. Need ${qtyFloat.toFixed(4)}, have ${(baseAvailable ?? 0).toFixed(4)}.`}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={() => void handlePlaceOrder()}
              disabled={!canPlace}
              className="rounded-xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={
                side === "BUY"
                  ? {
                      background: "linear-gradient(135deg, rgba(34,197,94,0.24), rgba(34,197,94,0.14))",
                      border: "1px solid rgba(34,197,94,0.24)",
                      color: "#dcfce7",
                    }
                  : {
                      background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.12))",
                      border: "1px solid rgba(239,68,68,0.22)",
                      color: "#fee2e2",
                    }
              }
            >
              {placePending ? "Placing…" : `Place ${side} order`}
            </button>

            <ActionBanner state={placeState} />
          </div>
        </Card>

        {/* ── Active Orders ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Active Orders</CardTitle>
            <button
              onClick={() => void loadOrders()}
              className="text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              Refresh
            </button>
          </CardHeader>

          {loadingOrders ? (
            <OrdersSkeleton />
          ) : activeOrders.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              No open or partial orders.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeOrders.map((order) => {
                const style = STATUS_STYLES[order.status] ?? { bg: "rgba(255,255,255,0.06)", color: "#fff" };
                const cancelState = cancelStates[order.orderId] ?? { kind: "idle" };
                const canceling = cancelState.kind === "pending";

                return (
                  <div
                    key={order.orderId}
                    className="rounded-xl px-4 py-3 flex flex-col gap-2"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    {/* Row 1: side, price, qty, status, tif */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background: order.side === "BUY" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                          color: order.side === "BUY" ? "#4ade80" : "#f87171",
                        }}
                      >
                        {order.side}
                      </span>

                      <span className="text-sm font-semibold text-white tabular-nums">
                        {selectedMarket
                          ? safeFormatAmount(order.price, selectedMarket.quoteDecimals)
                          : order.price}
                        {" "}{quote?.symbol}
                      </span>

                      <span className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                        {order.remainingQty}
                        {" / "}
                        {order.initialQty}
                        {" "}{base?.symbol}
                      </span>

                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: style.bg, color: style.color }}
                      >
                        {order.status}
                      </span>

                      <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                        {order.timeInForce}
                      </span>
                    </div>

                    {/* Row 2: order id + cancel button */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {order.orderId.slice(0, 18)}…
                      </span>
                      <button
                        onClick={() => void handleCancelOrder(order.orderId)}
                        disabled={canceling || cancelState.kind === "success"}
                        className="rounded-lg px-3 py-1 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          background: "rgba(239,68,68,0.1)",
                          border: "1px solid rgba(239,68,68,0.2)",
                          color: "#f87171",
                        }}
                      >
                        {canceling ? "Canceling…" : cancelState.kind === "success" ? "Canceled" : "Cancel"}
                      </button>
                    </div>

                    {/* Cancel state banner */}
                    {cancelState.kind !== "idle" && (
                      <ActionBanner state={cancelState} compact />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function TradePage() {
  return <AddressGuard>{(address) => <TradeView address={address} />}</AddressGuard>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionBanner({ state, compact = false }: { state: ActionState; compact?: boolean }) {
  if (state.kind === "idle") return null;

  const palette =
    state.kind === "success"
      ? { background: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", color: "#86efac" }
      : state.kind === "error"
        ? { background: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", color: "#fca5a5" }
        : { background: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", color: "#fcd34d" };

  return (
    <div
      className="rounded-2xl px-4 py-3 text-sm"
      style={{ background: palette.background, border: `1px solid ${palette.border}`, color: palette.color }}
    >
      <div className="flex flex-col gap-1">
        {state.stage && !compact && <p className="font-semibold text-white">{state.stage}</p>}
        {state.message && <p className={compact ? "text-xs" : ""}>{state.message}</p>}
        {state.txHash && !compact && (
          <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.6)" }}>
            tx {shortAddress(state.txHash, 10, 8)}
          </p>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-6 rounded-xl px-4 py-3 text-sm"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
    >
      {message}
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-16 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
        />
      ))}
    </div>
  );
}
