"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { XRPChart } from "@/components/xrp-chart";
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
    return `~${(p * q).toFixed(4)} ${quote.symbol}`;
  }
  return `~${q.toFixed(4)} ${base.symbol}`;
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
          fontFamily: "var(--font-space-grotesk)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "3px",
  padding: "9px 12px",
  fontSize: "13px",
  color: "var(--fg)",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-strong)",
  outline: "none",
  fontFamily: "inherit",
};

function ActionBanner({ state, compact = false }: { state: ActionState; compact?: boolean }) {
  if (state.kind === "idle") return null;

  const palette =
    state.kind === "success"
      ? { bg: "var(--buy-dim)", border: "var(--buy-border)", color: "var(--buy)" }
      : state.kind === "error"
        ? { bg: "var(--error-dim)", border: "var(--error-border)", color: "var(--error)" }
        : { bg: "var(--accent-dim)", border: "var(--accent-border)", color: "var(--accent)" };

  return (
    <div
      style={{
        borderRadius: "3px",
        padding: compact ? "6px 10px" : "10px 14px",
        fontSize: compact ? "11px" : "12px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
    >
      {state.stage && !compact && (
        <p style={{ fontWeight: 600, color: "var(--fg)", marginBottom: "2px", fontSize: "12px" }}>
          {state.stage}
        </p>
      )}
      {state.message && <p>{state.message}</p>}
      {state.txHash && !compact && (
        <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
          tx {shortAddress(state.txHash, 10, 8)}
        </p>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        marginBottom: "20px",
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

function OrdersSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: "40px",
            background: "var(--bg-surface)",
            borderRadius: "2px",
            animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        />
      ))}
    </div>
  );
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

  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [tif, setTif] = useState<TimeInForce>("GTC");

  const [placeState, setPlaceState] = useState<ActionState>({ kind: "idle" });
  const [cancelStates, setCancelStates] = useState<Record<string, ActionState>>({});

  const base = marketsData?.tokens.find(
    (t) => t.address.toLowerCase() === selectedMarket?.baseToken.toLowerCase(),
  );
  const quote = marketsData?.tokens.find(
    (t) => t.address.toLowerCase() === selectedMarket?.quoteToken.toLowerCase(),
  );

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
      // non-critical
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
      .catch(() => {});
    return () => { cancelled = true; };
  }, [config, publicClient]);

  async function handlePlaceOrder() {
    if (!config || !publicClient || !selectedMarket || !base || !quote) return;
    try {
      const priceRaw = parseAmountInput(price, quote.decimals);
      const qtyRaw = BigInt(Math.floor(parseFloat(qty)));
      const clientOrderId = generateClientOrderId();
      const sideUint8 = side === "BUY" ? 0 : 1;
      const tifUint8 = tif === "GTC" ? 0 : tif === "IOC" ? 1 : 2;

      setPlaceState({ kind: "pending", stage: "Submitting", message: `Sending ${side} order via contract…` });

      const hash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "placeOrder",
        args: [{
          user: address as Address,
          clientOrderId,
          marketId: selectedMarket.marketIdBytes32 as Hex,
          side: sideUint8,
          price: priceRaw,
          qty: qtyRaw,
          timeInForce: tifUint8,
        }],
        value: BigInt(config.feeWei),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assertSuccessfulReceipt(receipt, "placeOrder");

      const instructionId = getInstructionIdFromReceipt(receipt, teeExtensionRegistryAddress ?? undefined);

      setPlaceState({ kind: "pending", stage: "TEE processing", message: "Awaiting TEE confirmation…", txHash: hash, instructionId });

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
        message: `${side} ${result.status}${result.fills?.length ? ` · ${result.fills.length} fill(s)` : ""} · ${shortAddress(result.orderId)}`,
        txHash: hash,
        instructionId,
      });

      await Promise.all([loadOrders(), loadAccount()]);
    } catch (error) {
      setPlaceState({ kind: "error", stage: "Failed", message: getErrorMessage(error) });
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!config || !publicClient) return;
    setCancelStates((prev) => ({ ...prev, [orderId]: { kind: "pending", message: "Canceling…" } }));
    try {
      const hash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "cancelOrder",
        args: [{ user: address as Address, orderId: orderId as Hex }],
        value: BigInt(config.feeWei),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      assertSuccessfulReceipt(receipt, "cancelOrder");

      const instructionId = getInstructionIdFromReceipt(receipt, teeExtensionRegistryAddress ?? undefined);
      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) {
        throw new Error(actionResult.log ?? "TEE cancelOrder failed");
      }

      const result = decodeHexJson<CancelOrderResult>(actionResult.data);
      const canceledOrder = activeOrders.find((o) => o.orderId === orderId);
      const unlockedToken = canceledOrder?.side === "SELL" ? base : quote;
      const unlockedFormatted = unlockedToken
        ? safeFormatAmount(result.unlockedAmount, unlockedToken.decimals)
        : result.unlockedAmount;
      setCancelStates((prev) => ({
        ...prev,
        [orderId]: { kind: "success", message: `Canceled · unlocked ${unlockedFormatted}${unlockedToken ? ` ${unlockedToken.symbol}` : ""}`, txHash: hash },
      }));

      await Promise.all([loadOrders(), loadAccount()]);
    } catch (error) {
      setCancelStates((prev) => ({
        ...prev,
        [orderId]: { kind: "error", message: getErrorMessage(error) },
      }));
    }
  }

  const findBalance = (tokenAddress: string) => {
    const key = Object.keys(balances).find((k) => k.toLowerCase() === tokenAddress.toLowerCase());
    return key ? balances[key] : undefined;
  };

  const baseBalanceRaw  = base  ? findBalance(base.address)  : undefined;
  const quoteBalanceRaw = quote ? findBalance(quote.address) : undefined;

  const baseAvailable  = base  && baseBalanceRaw  ? parseFloat(formatUnits(BigInt(baseBalanceRaw.available),  base.decimals))  : null;
  const baseLocked     = base  && baseBalanceRaw  ? parseFloat(formatUnits(BigInt(baseBalanceRaw.locked),     base.decimals))  : null;
  const quoteAvailable = quote && quoteBalanceRaw ? parseFloat(formatUnits(BigInt(quoteBalanceRaw.available), quote.decimals)) : null;
  const quoteLocked    = quote && quoteBalanceRaw ? parseFloat(formatUnits(BigInt(quoteBalanceRaw.locked),    quote.decimals)) : null;

  const priceFloat = parseFloat(price);
  const qtyFloat   = parseFloat(qty);

  const insufficientFunds = (() => {
    if (!price || !qty || isNaN(priceFloat) || isNaN(qtyFloat)) return false;
    try {
      if (side === "BUY" && quote && quoteBalanceRaw) {
        const priceRaw = parseAmountInput(price, quote.decimals);
        return priceRaw * BigInt(Math.floor(qtyFloat)) > BigInt(quoteBalanceRaw.available);
      }
      if (side === "SELL" && baseAvailable !== null) return qtyFloat > baseAvailable;
    } catch {}
    return false;
  })();

  const actionsDisabled = !config || !publicClient || !selectedMarket;
  const placePending    = placeState.kind === "pending";
  const canPlace        = !actionsDisabled && !placePending && !!price && !!qty && !insufficientFunds;

  return (
    <div className="mx-auto px-5 py-8 sm:px-7" style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
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
            Trade
          </h1>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              padding: "2px 7px",
              borderRadius: "2px",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}
          >
            Dark Pool
          </span>
        </div>
        <p style={{ marginTop: "4px", fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
          {address}
        </p>
      </div>

      {loadError && <ErrorBanner message={loadError} />}

      <div
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
        }}
        className="xl:grid-cols-[420px_1fr]"
      >
        {/* ── Place Order ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Place Order</CardTitle>
            {selectedMarket && base && quote && (
              <span style={{ fontSize: "11px", color: "var(--fg-muted)", letterSpacing: "0.01em" }}>
                {base.symbol} / {quote.symbol}
              </span>
            )}
          </CardHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Market picker */}
            <Field label="Market">
              <select
                value={selectedMarket?.marketId ?? ""}
                onChange={(e) => {
                  const m = marketsData?.markets.find((mk) => mk.marketId === e.target.value);
                  if (m) setSelectedMarket(m);
                }}
                style={inputStyle}
              >
                {(marketsData?.markets ?? []).map((m) => (
                  <option key={m.marketId} value={m.marketId}>
                    {base?.symbol ?? "BASE"} / {quote?.symbol ?? "QUOTE"} · {shortAddress(m.marketId, 8, 6)}
                  </option>
                ))}
              </select>
            </Field>

            {/* Balances strip */}
            {base && quote && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { token: base,  available: baseAvailable,  locked: baseLocked,  relevant: side === "SELL" },
                  { token: quote, available: quoteAvailable, locked: quoteLocked, relevant: side === "BUY"  },
                ].map(({ token, available, locked, relevant }) => (
                  <div
                    key={token.address}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "3px",
                      background: relevant ? "var(--bg-surface)" : "transparent",
                      border: `1px solid ${relevant ? "var(--border-strong)" : "var(--border)"}`,
                    }}
                  >
                    <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", color: relevant ? "var(--accent)" : "var(--fg-subtle)", textTransform: "uppercase" }}>
                      {token.symbol}
                    </p>
                    <p style={{ marginTop: "2px", fontSize: "14px", fontWeight: 500, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                      {available !== null ? available.toFixed(4) : "—"}
                    </p>
                    <p style={{ fontSize: "10px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
                      {locked !== null ? `${locked.toFixed(4)} locked` : "available"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Side toggle — large, prominent */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {(["BUY", "SELL"] as Side[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  style={{
                    padding: "12px",
                    borderRadius: "3px",
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                    fontFamily: "var(--font-space-grotesk)",
                    ...(side === s
                      ? s === "BUY"
                        ? { background: "var(--buy-dim)", border: "1px solid var(--buy-border)", color: "var(--buy)" }
                        : { background: "var(--sell-dim)", border: "1px solid var(--sell-border)", color: "var(--sell)" }
                      : { background: "transparent", border: "1px solid var(--border)", color: "var(--fg-subtle)" }
                    ),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Price */}
            <Field label={`Price (${quote?.symbol ?? "QUOTE"} per ${base?.symbol ?? "BASE"})`}>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1.50"
                style={inputStyle}
              />
            </Field>

            {/* Quantity */}
            <Field label={`Quantity (${base?.symbol ?? "BASE"})`}>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="10"
                style={inputStyle}
              />
            </Field>

            {/* Time In Force */}
            <Field label="Time In Force">
              <div style={{ display: "flex", gap: "4px" }}>
                {(["GTC", "IOC", "FOK"] as TimeInForce[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTif(t)}
                    style={{
                      flex: 1,
                      padding: "7px",
                      borderRadius: "3px",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      cursor: "pointer",
                      transition: "all 0.1s ease",
                      fontFamily: "var(--font-space-grotesk)",
                      ...(tif === t
                        ? { background: "var(--bg-surface)", border: "1px solid var(--border-strong)", color: "var(--fg)" }
                        : { background: "transparent", border: "1px solid var(--border)", color: "var(--fg-subtle)" }
                      ),
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: "11px", color: "var(--fg-subtle)", marginTop: "2px" }}>
                {TIF_INFO[tif].description}
              </p>
            </Field>

            {/* Preview strip */}
            {selectedMarket && base && quote && (price || qty) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px 20px",
                  padding: "10px 12px",
                  borderRadius: "3px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {[
                  { k: "Side",     v: side },
                  { k: "Price",    v: price ? `${price} ${quote.symbol}/${base.symbol}` : "—" },
                  { k: "Qty",      v: qty ? `${qty} ${base.symbol}` : "—" },
                  { k: "TIF",      v: tif },
                  { k: "Locks",    v: price && qty ? lockedAmountPreview(side, price, qty, selectedMarket, marketsData?.tokens ?? []) : "—" },
                  { k: "Fee",      v: config ? `${config.feeWei} wei` : "—" },
                ].map(({ k, v }) => (
                  <div key={k}>
                    <span style={{ fontSize: "10px", color: "var(--fg-subtle)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block" }}>{k}</span>
                    <span style={{ fontSize: "12px", color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Insufficient funds */}
            {insufficientFunds && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "3px",
                  fontSize: "11px",
                  background: "var(--sell-dim)",
                  border: "1px solid var(--sell-border)",
                  color: "var(--sell)",
                }}
              >
                {side === "BUY" && quote && quoteBalanceRaw
                  ? (() => {
                      try {
                        const needed = formatUnits(parseAmountInput(price, quote.decimals) * BigInt(Math.floor(qtyFloat)), quote.decimals);
                        const have = formatUnits(BigInt(quoteBalanceRaw.available), quote.decimals);
                        return `Insufficient ${quote.symbol} — need ${needed}, have ${have}`;
                      } catch { return `Insufficient ${quote?.symbol} balance`; }
                    })()
                  : `Insufficient ${base?.symbol} — need ${qtyFloat.toFixed(4)}, have ${(baseAvailable ?? 0).toFixed(4)}`
                }
              </div>
            )}

            {/* Submit */}
            <button
              onClick={() => void handlePlaceOrder()}
              disabled={!canPlace}
              style={{
                padding: "13px",
                borderRadius: "3px",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: canPlace ? "pointer" : "not-allowed",
                opacity: canPlace ? 1 : 0.4,
                transition: "opacity 0.15s",
                fontFamily: "var(--font-space-grotesk)",
                ...(side === "BUY"
                  ? { background: "var(--buy-dim)", border: "1px solid var(--buy-border)", color: "var(--buy)" }
                  : { background: "var(--sell-dim)", border: "1px solid var(--sell-border)", color: "var(--sell)" }
                ),
              }}
            >
              {placePending ? "Placing…" : `Place ${side} Order`}
            </button>

            <ActionBanner state={placeState} />
          </div>
        </Card>

        {/* ── Right column: Chart + Active Orders ─────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Chart */}
        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <CardTitle>XRP / USDT</CardTitle>
              <span style={{ fontSize: "10px", color: "var(--fg-subtle)", letterSpacing: "0.06em" }}>
                1H · Binance
              </span>
            </div>
          </CardHeader>
          <XRPChart />
        </Card>

        {/* Active Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Active Orders</CardTitle>
            <button
              onClick={() => void loadOrders()}
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--fg-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "2px",
              }}
            >
              Refresh
            </button>
          </CardHeader>

          {loadingOrders ? (
            <OrdersSkeleton />
          ) : activeOrders.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "var(--fg-subtle)" }}>No active orders in the book</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr 100px 80px 60px 64px",
                  gap: "0 12px",
                  padding: "6px 0 8px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {["Side", "Price · Qty", "Status", "TIF", "ID", ""].map((h) => (
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

              {activeOrders.map((order, i) => {
                const cancelState = cancelStates[order.orderId] ?? { kind: "idle" };
                const canceling = cancelState.kind === "pending";
                const canceled  = cancelState.kind === "success";

                return (
                  <div key={order.orderId}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "52px 1fr 100px 80px 60px 64px",
                        gap: "0 12px",
                        padding: "10px 0",
                        borderBottom: i < activeOrders.length - 1 ? "1px solid var(--border)" : "none",
                        alignItems: "center",
                      }}
                    >
                      {/* Side */}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: order.side === "BUY" ? "var(--buy)" : "var(--sell)",
                        }}
                      >
                        {order.side}
                      </span>

                      {/* Price · Qty */}
                      <div>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                          {selectedMarket
                            ? safeFormatAmount(order.price, selectedMarket.quoteDecimals)
                            : order.price}
                        </span>
                        <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {order.remainingQty}{" / "}{order.initialQty}
                        </span>
                      </div>

                      {/* Status */}
                      <StatusPill status={order.status} />

                      {/* TIF */}
                      <span style={{ fontSize: "11px", color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
                        {order.timeInForce}
                      </span>

                      {/* ID */}
                      <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {order.orderId.slice(0, 8)}…
                      </span>

                      {/* Cancel */}
                      <button
                        onClick={() => void handleCancelOrder(order.orderId)}
                        disabled={canceling || canceled}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "2px",
                          fontSize: "10px",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          cursor: canceling || canceled ? "not-allowed" : "pointer",
                          opacity: canceling || canceled ? 0.45 : 1,
                          background: "var(--sell-dim)",
                          border: "1px solid var(--sell-border)",
                          color: "var(--sell)",
                          transition: "opacity 0.15s",
                          textTransform: "uppercase",
                          fontFamily: "var(--font-space-grotesk)",
                        }}
                      >
                        {canceling ? "…" : canceled ? "Done" : "Cancel"}
                      </button>
                    </div>

                    {cancelState.kind !== "idle" && (
                      <div style={{ paddingBottom: "8px" }}>
                        <ActionBanner state={cancelState} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        </div>{/* end right column */}
      </div>
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

export default function TradePage() {
  return <AddressGuard>{(address) => <TradeView address={address} />}</AddressGuard>;
}
