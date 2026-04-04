"use client";

import { type ReactNode, useEffect, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildWithdrawIntentTypedData,
  corexInstructionSenderAbi,
  corexTestTokenAbi,
  decodeHexJson,
  erc20Abi,
  formatTokenAmount,
  getErrorMessage,
  getInstructionIdFromReceipt,
  normalizeProxyActionResult,
  parseAmountInput,
  shortAddress,
  type CorexFrontendConfig,
  type SubmitWithdrawIntentResult,
  type SyncDepositResult,
} from "@/lib/corex";
import { ensureCorexReadAuth } from "@/lib/corex-read-auth";
import {
  fetchAccount,
  fetchActivity,
  fetchCorexConfig,
  fetchMarkets,
  fetchProxyResult,
  submitWithdrawIntent,
} from "@/lib/api";

interface Balance {
  available: string;
  locked: string;
}

interface AccountData {
  account: string;
  balances: Record<string, Balance>;
  withdrawNonce: string;
}

interface DepositActivity {
  depositId: string;
  token: string;
  amount: string;
  seq: string;
}

interface WithdrawalActivity {
  token: string;
  amount: string;
  recipient: string;
  withdrawNonce: string;
  seq: string;
}

interface ActivityData {
  deposits: DepositActivity[];
  withdrawals: WithdrawalActivity[];
}

interface Market {
  marketId: string;
  marketIdBytes32: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals: number;
  quoteDecimals: number;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  role: string;
}

interface MarketsData {
  markets: Market[];
  tokens: Token[];
}

interface Snapshot {
  account: AccountData;
  activity: ActivityData;
  markets: MarketsData;
}

interface BalanceRow {
  token: Token;
  balance: Balance;
}

interface ActionState {
  kind: "idle" | "pending" | "success" | "error";
  stage?: string;
  message?: string;
  txHashes?: Hex[];
  instructionId?: Hex;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

const BLOCK_EXPLORERS: Record<number, string> = {
  114:     "https://coston2-explorer.flare.network",  // Flare Testnet Coston2
  14:      "https://flare-explorer.flare.network",    // Flare Mainnet
  1:       "https://etherscan.io",
  11155111:"https://sepolia.etherscan.io",
  8453:    "https://basescan.org",
  84532:   "https://sepolia.basescan.org",
};

function getTxUrl(chainId: number | undefined, hash: string): string | null {
  if (!chainId) return null;
  const base = BLOCK_EXPLORERS[chainId];
  return base ? `${base}/tx/${hash}` : null;
}

function ActionBanner({ state, chainId }: { state: ActionState; chainId?: number }) {
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
        padding: "10px 14px",
        fontSize: "12px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
    >
      {state.stage && (
        <p style={{ fontWeight: 600, color: "var(--fg)", marginBottom: "4px", fontSize: "12px" }}>
          {state.stage}
        </p>
      )}
      {state.message && <p>{state.message}</p>}
      {state.txHashes?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
          {state.txHashes.map((hash) => {
            const url = getTxUrl(chainId, hash);
            const label = `tx ${shortAddress(hash, 8, 6)}`;
            const chipStyle: React.CSSProperties = {
              fontSize: "10px",
              padding: "2px 7px",
              borderRadius: "2px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              color: "var(--fg-muted)",
              fontVariantNumeric: "tabular-nums",
              textDecoration: "none",
            };
            return url ? (
              <a key={hash} href={url} target="_blank" rel="noopener noreferrer" style={chipStyle}>
                {label} ↗
              </a>
            ) : (
              <span key={hash} style={chipStyle}>{label}</span>
            );
          })}
        </div>
      ) : null}
      {state.instructionId ? (
        <p style={{ marginTop: "4px", fontSize: "10px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
          instruction {shortAddress(state.instructionId, 10, 8)}
        </p>
      ) : null}
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

function TokenSelector({
  label,
  tokens,
  value,
  onChange,
}: {
  label: string;
  tokens: Token[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        <option value="">Select token</option>
        {tokens.map((token) => (
          <option key={token.address} value={token.address}>
            {token.symbol} · {token.role} · {shortAddress(token.address)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function FlowSteps({ items, color }: { items: string[]; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
      {items.map((item, i) => (
        <div key={item} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "2px",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: `${color}18`,
              border: `1px solid ${color}30`,
              color,
              fontFamily: "var(--font-space-grotesk)",
            }}
          >
            <span style={{ fontSize: "9px", opacity: 0.7 }}>{i + 1}</span>
            {item}
          </span>
          {i < items.length - 1 && (
            <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "3px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
          marginBottom: "8px",
          fontFamily: "var(--font-space-grotesk)",
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {lines.map((line, i) => (
          <p key={i} style={{ fontSize: "11px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function BalanceSnapshot({ rows }: { rows: BalanceRow[] }) {
  if (!rows.length) {
    return (
      <p style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "4px 0" }}>
        No TEE balances yet. Successful deposits will appear here.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
      {rows.map(({ token, balance }) => (
        <div
          key={token.address}
          style={{
            padding: "12px",
            borderRadius: "3px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)" }}>{token.symbol}</span>
            <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>{token.role}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div>
              <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", display: "block" }}>Available</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                {formatTokenAmount(balance.available, token.decimals)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-subtle)", display: "block" }}>Locked</span>
              <span style={{ fontSize: "12px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {formatTokenAmount(balance.locked, token.decimals)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "1fr 1fr" }}>
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: "480px",
            borderRadius: "4px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        />
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findToken(tokens: Token[] | undefined, address: string | undefined) {
  if (!tokens || !address) return undefined;
  return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

function findBalance(balances: Record<string, Balance> | undefined, tokenAddress: string | undefined) {
  if (!balances || !tokenAddress) return undefined;
  const entry = Object.entries(balances).find(([a]) => a.toLowerCase() === tokenAddress.toLowerCase());
  return entry?.[1];
}

function getBalanceRows(balances: Record<string, Balance> | undefined, tokens: Token[] | undefined): BalanceRow[] {
  if (!balances || !tokens) return [];
  return tokens.flatMap((token) => {
    const balance = findBalance(balances, token.address);
    return balance ? [{ token, balance }] : [];
  });
}

function parseAmountLabel(value: string, decimals: number) {
  try { return parseAmountInput(value, decimals).toString(); }
  catch { return "invalid"; }
}

function assertSuccessfulReceipt(receipt: { status: "success" | "reverted"; transactionHash: Hex }, action: string) {
  if (receipt.status === "success") return;
  throw new Error(`${action} transaction reverted: ${receipt.transactionHash}`);
}

// ─── Main view ────────────────────────────────────────────────────────────────

function TransferView({ address }: { address: string }) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<CorexFrontendConfig | null>(null);
  const [selectedTeeIds, setSelectedTeeIds] = useState<readonly Address[]>([]);
  const [teeExtensionRegistryAddress, setTeeExtensionRegistryAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [depositToken, setDepositToken] = useState("");
  const [withdrawToken, setWithdrawToken] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const [depositState, setDepositState] = useState<ActionState>({ kind: "idle" });
  const [withdrawState, setWithdrawState] = useState<ActionState>({ kind: "idle" });
  const [mintToken, setMintToken] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [mintState, setMintState] = useState<ActionState>({ kind: "idle" });
  const [depositWalletBalance, setDepositWalletBalance] = useState<bigint | null>(null);
  const [depositWalletBalanceLoading, setDepositWalletBalanceLoading] = useState(false);
  const [depositWalletBalanceError, setDepositWalletBalanceError] = useState<string | null>(null);
  const [depositWalletBalanceVersion, setDepositWalletBalanceVersion] = useState(0);

  useEffect(() => { void loadAll(); }, [address]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!recipient) setRecipient(address); }, [address, recipient]);

  useEffect(() => {
    const tokens = snapshot?.markets.tokens ?? [];
    if (!tokens.length) return;
    const defaultToken = tokens.find((t) => t.role === "QUOTE") ?? tokens[0];
    if (!depositToken) setDepositToken(defaultToken.address);
    if (!withdrawToken) setWithdrawToken(defaultToken.address);
  }, [depositToken, snapshot, withdrawToken]);

  const depositTokenMeta  = findToken(snapshot?.markets.tokens, depositToken);
  const withdrawTokenMeta = findToken(snapshot?.markets.tokens, withdrawToken);
  const depositBalance    = findBalance(snapshot?.account.balances, depositTokenMeta?.address);
  const withdrawBalance   = findBalance(snapshot?.account.balances, withdrawTokenMeta?.address);
  const balanceRows       = getBalanceRows(snapshot?.account.balances, snapshot?.markets.tokens);
  const nextWithdrawNonce = snapshot
    ? (BigInt(snapshot.account.withdrawNonce) + BigInt(1)).toString()
    : null;

  useEffect(() => {
    if (!config || !publicClient) return;
    let cancelled = false;
    Promise.all([
      publicClient.readContract({ address: config.instructionSender, abi: corexInstructionSenderAbi, functionName: "getSelectedTeeIds" }),
      publicClient.readContract({ address: config.instructionSender, abi: corexInstructionSenderAbi, functionName: "teeExtensionRegistry" }),
    ])
      .then(([teeIds, registryAddress]) => {
        if (cancelled) return;
        setSelectedTeeIds(teeIds);
        setTeeExtensionRegistryAddress(registryAddress);
      })
      .catch(() => { if (!cancelled) { setSelectedTeeIds([]); setTeeExtensionRegistryAddress(null); } });
    return () => { cancelled = true; };
  }, [config, publicClient]);

  useEffect(() => {
    if (!publicClient || !depositTokenMeta) {
      setDepositWalletBalance(null);
      setDepositWalletBalanceError(null);
      setDepositWalletBalanceLoading(false);
      return;
    }
    let cancelled = false;
    setDepositWalletBalanceLoading(true);
    setDepositWalletBalanceError(null);
    publicClient
      .readContract({ address: depositTokenMeta.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [address as Address] })
      .then((balance) => { if (!cancelled) setDepositWalletBalance(balance); })
      .catch((error) => { if (!cancelled) { setDepositWalletBalance(null); setDepositWalletBalanceError(getErrorMessage(error)); } })
      .finally(() => { if (!cancelled) setDepositWalletBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [address, depositTokenMeta, depositWalletBalanceVersion, publicClient]);

  const depositActionsDisabled =
    !config || !publicClient || selectedTeeIds.length === 0 || loading;
  const withdrawActionsDisabled = !config || loading;
  const mintActionsDisabled = !config || !publicClient || loading;

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const auth = await ensureCorexReadAuth({
        address: address as Address,
        signTypedDataAsync,
      });
      const [markets, account, activity, corexConfig] = await Promise.all([
        fetchMarkets(),
        fetchAccount(address, auth),
        fetchActivity(address, auth),
        fetchCorexConfig(),
      ]);
      setSnapshot({ markets, account, activity });
      setConfig(corexConfig);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshAccountSnapshot() {
    const auth = await ensureCorexReadAuth({
      address: address as Address,
      signTypedDataAsync,
    });
    const [account, activity] = await Promise.all([
      fetchAccount(address, auth),
      fetchActivity(address, auth),
    ]);
    setSnapshot((current) => current ? { ...current, account, activity } : null);
  }

  async function handleDeposit() {
    if (!config || !publicClient || !depositTokenMeta) return;
    try {
      const amount = parseAmountInput(depositAmount, depositTokenMeta.decimals);
      const token = depositTokenMeta.address as Address;

      setDepositState({ kind: "pending", stage: "Approving token", message: `Authorizing ${depositTokenMeta.symbol} for Corex custody.` });

      const approveHash = await writeContractAsync({ chainId: config.chainId, address: token, abi: erc20Abi, functionName: "approve", args: [config.custodyAddress, amount] });
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      assertSuccessfulReceipt(approveReceipt, "approve");

      setDepositState({ kind: "pending", stage: "Depositing and syncing", message: `Escrowing ${depositTokenMeta.symbol} and dispatching TEE credit.`, txHashes: [approveHash] });

      const depositHash = await writeContractAsync({ chainId: config.chainId, address: config.instructionSender, abi: corexInstructionSenderAbi, functionName: "depositAndSync", args: [token, amount], value: BigInt(config.feeWei) });
      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
      assertSuccessfulReceipt(depositReceipt, "depositAndSync");

      const instructionId = getInstructionIdFromReceipt(depositReceipt, teeExtensionRegistryAddress ?? undefined);
      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) throw new Error(actionResult.log ?? "TEE depositAndSync failed");

      const synced = decodeHexJson<SyncDepositResult>(actionResult.data);
      await refreshAccountSnapshot();
      setDepositWalletBalanceVersion((v) => v + 1);
      setDepositAmount("");
      setDepositState({ kind: "success", stage: "Deposit settled", message: `Deposit ${shortAddress(synced.depositId)} is now in the TEE session balance.`, txHashes: [approveHash, depositHash], instructionId });
    } catch (error) {
      setDepositState({ kind: "error", stage: "Deposit failed", message: getErrorMessage(error) });
    }
  }

  async function handleWithdraw() {
    if (!config || !withdrawTokenMeta || !snapshot) return;
    try {
      const amount = parseAmountInput(withdrawAmount, withdrawTokenMeta.decimals);
      const user = address as Address;
      const token = withdrawTokenMeta.address as Address;
      const recipientValue = recipient.trim();
      if (!isAddress(recipientValue)) {
        throw new Error("Recipient must be a valid address");
      }
      const recipientAddress = recipientValue as Address;
      const nonce = BigInt(snapshot.account.withdrawNonce) + BigInt(1);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);

      setWithdrawState({
        kind: "pending",
        stage: "Signing withdraw intent",
        message: "Authorizing the EIP-712 withdraw payload in your wallet.",
      });

      const signature = await signTypedDataAsync(
        buildWithdrawIntentTypedData(config, {
          user,
          token,
          amount,
          recipient: recipientAddress,
          nonce,
          deadline,
        }),
      );

      setWithdrawState({
        kind: "pending",
        stage: "Submitting to TEE",
        message: "Posting the signed intent to the TEE runtime and waiting for on-chain finalization.",
      });

      const settled = await submitWithdrawIntent({
        user,
        token,
        amount: amount.toString(),
        recipient: recipientAddress,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        signature,
      }) as SubmitWithdrawIntentResult;

      await refreshAccountSnapshot();
      setWithdrawAmount("");
      setWithdrawState({
        kind: "success",
        stage: "Withdrawal finalized",
        message: `Nonce ${settled.withdrawNonce} consumed, TEE finalized custody release to ${shortAddress(recipientAddress)}.`,
        txHashes: [settled.finalizeTxHash],
      });
    } catch (error) {
      setWithdrawState({ kind: "error", stage: "Withdrawal failed", message: getErrorMessage(error) });
    }
  }

  async function handleMint() {
    if (!config || !publicClient) return;
    const mintTokenMeta = findToken(snapshot?.markets.tokens, mintToken);
    if (!mintTokenMeta) return;
    try {
      const amount = parseAmountInput(mintAmount, mintTokenMeta.decimals);
      setMintState({ kind: "pending", stage: "Minting tokens", message: `Minting ${mintAmount} ${mintTokenMeta.symbol} to your wallet.` });
      const mintHash = await writeContractAsync({ chainId: config.chainId, address: mintTokenMeta.address as Address, abi: corexTestTokenAbi, functionName: "mint", args: [address as Address, amount] });
      const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
      assertSuccessfulReceipt(mintReceipt, "mint");
      setDepositWalletBalanceVersion((v) => v + 1);
      setMintAmount("");
      setMintState({ kind: "success", stage: "Tokens minted", message: `${mintAmount} ${mintTokenMeta.symbol} minted to your wallet.`, txHashes: [mintHash] });
    } catch (error) {
      setMintState({ kind: "error", stage: "Mint failed", message: getErrorMessage(error) });
    }
  }

  return (
    <div className="mx-auto px-5 py-8 sm:px-7" style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
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
            Deposit & Withdraw
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
            Custody + TEE
          </span>
        </div>
        <p style={{ marginTop: "4px", fontSize: "11px", color: "var(--fg-subtle)", fontVariantNumeric: "tabular-nums" }}>
          {address}
        </p>
        <p style={{ marginTop: "8px", maxWidth: "680px", fontSize: "12px", lineHeight: 1.6, color: "var(--fg-muted)" }}>
          Deposits: <span style={{ color: "var(--fg)" }}>approve(custody)</span> → <span style={{ color: "var(--fg)" }}>depositAndSync()</span> escrows tokens then dispatches the TEE credit.
          Withdrawals: your wallet signs an <span style={{ color: "var(--fg)" }}>EIP-712 WithdrawIntent</span>, then the TEE verifies it over REST and submits <span style={{ color: "var(--fg)" }}>finalizeWithdraw()</span>.
        </p>
      </div>

      {loadError && <ErrorBanner message={loadError} />}

      {/* Info strip */}
      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "20px" }}>
        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <Metric label="Instruction sender" value={shortAddress(config?.instructionSender ?? "not configured")} />
          <Metric label="Custody" value={shortAddress(config?.custodyAddress ?? "not configured")} />
          <Metric label="TEE fee" value={config ? `${config.feeWei} wei` : "loading"} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TEE Routing</CardTitle>
          </CardHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: selectedTeeIds.length > 0 ? "var(--buy)" : "var(--sell)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)" }}>
              {selectedTeeIds.length > 0 ? `${selectedTeeIds.length} TEE selected` : "No TEE selected"}
            </span>
          </div>
          <p style={{ fontSize: "11px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
            {selectedTeeIds.length > 0
              ? `Routing through ${shortAddress(selectedTeeIds[0])}.`
              : "Run selectTee() in the deployed CorexInstructionSender."}
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session State</CardTitle>
          </CardHeader>
          <Metric label="Withdraw nonce" value={snapshot?.account.withdrawNonce ?? "0"} />
          <Metric label="Deposits" value={String(snapshot?.activity.deposits.length ?? 0)} />
          <Metric label="Withdrawals" value={String(snapshot?.activity.withdrawals.length ?? 0)} />
        </Card>
      </div>

      {/* TEE Balances */}
      {!loading && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Your TEE Balances</CardTitle>
          </CardHeader>
          <BalanceSnapshot rows={balanceRows} />
        </Card>
      )}

      {/* Deposit & Withdraw */}
      {loading ? (
        <SkeletonGrid />
      ) : (
        <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "1fr 1fr" }}>
          {/* Deposit */}
          <Card>
            <CardHeader>
              <CardTitle>Deposit</CardTitle>
            </CardHeader>
            <FlowSteps items={["approve token", "deposit + sync", "poll TEE"]} color="var(--buy)" />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <TokenSelector label="Token" tokens={snapshot?.markets.tokens ?? []} value={depositToken} onChange={setDepositToken} />
              <Field label="Amount">
                <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="10.5" style={inputStyle} />
              </Field>
              <PreviewBox
                title={depositTokenMeta ? `${depositTokenMeta.symbol} preview` : "Deposit preview"}
                lines={[
                  depositWalletBalanceLoading
                    ? "Wallet balance: loading…"
                    : depositWalletBalance !== null && depositTokenMeta
                      ? `Wallet balance: ${formatTokenAmount(depositWalletBalance.toString(), depositTokenMeta.decimals)}`
                      : depositWalletBalanceError
                        ? `Wallet balance: unavailable`
                        : "Wallet balance: select a token",
                  depositBalance && depositTokenMeta
                    ? `TEE available: ${formatTokenAmount(depositBalance.available, depositTokenMeta.decimals)} · locked: ${formatTokenAmount(depositBalance.locked, depositTokenMeta.decimals)}`
                    : "TEE balance: none tracked yet",
                  depositAmount && depositTokenMeta
                    ? `Raw amount: ${parseAmountLabel(depositAmount, depositTokenMeta.decimals)}`
                    : "Raw amount: —",
                ]}
              />
              <button
                onClick={() => void handleDeposit()}
                disabled={depositActionsDisabled || !depositTokenMeta || !depositAmount || depositState.kind === "pending"}
                style={{
                  padding: "11px",
                  borderRadius: "3px",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  opacity: depositActionsDisabled || !depositTokenMeta || !depositAmount || depositState.kind === "pending" ? 0.4 : 1,
                  background: "var(--buy-dim)",
                  border: "1px solid var(--buy-border)",
                  color: "var(--buy)",
                  fontFamily: "var(--font-space-grotesk)",
                  transition: "opacity 0.15s",
                }}
              >
                Approve, deposit, sync
              </button>
              <ActionBanner state={depositState} chainId={config?.chainId} />
            </div>
          </Card>

          {/* Withdraw */}
          <Card>
            <CardHeader>
              <CardTitle>Withdraw</CardTitle>
            </CardHeader>
            <FlowSteps items={["sign intent", "POST to TEE", "TEE finalizes"]} color="var(--sell)" />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <TokenSelector label="Token" tokens={snapshot?.markets.tokens ?? []} value={withdrawToken} onChange={setWithdrawToken} />
              <Field label="Amount">
                <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="5" style={inputStyle} />
              </Field>
              <Field label="Recipient">
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} />
              </Field>
              <PreviewBox
                title={withdrawTokenMeta ? `${withdrawTokenMeta.symbol} preview` : "Withdraw preview"}
                lines={[
                  withdrawBalance && withdrawTokenMeta
                    ? `TEE available: ${formatTokenAmount(withdrawBalance.available, withdrawTokenMeta.decimals)}`
                    : "TEE available: none tracked yet",
                  withdrawBalance && withdrawTokenMeta
                    ? `TEE locked: ${formatTokenAmount(withdrawBalance.locked, withdrawTokenMeta.decimals)}`
                    : "TEE locked: 0",
                  withdrawAmount && withdrawTokenMeta
                    ? `Raw amount: ${parseAmountLabel(withdrawAmount, withdrawTokenMeta.decimals)}`
                    : "Raw amount: —",
                  `Intent nonce: ${snapshot?.account.withdrawNonce ?? "0"} → ${nextWithdrawNonce ?? "—"}`,
                  "Settlement path: wallet signs, TEE verifies, TEE sends finalizeWithdraw().",
                ]}
              />
              <button
                onClick={() => void handleWithdraw()}
                disabled={withdrawActionsDisabled || !withdrawTokenMeta || !withdrawAmount || !recipient.trim() || withdrawState.kind === "pending"}
                style={{
                  padding: "11px",
                  borderRadius: "3px",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  opacity: withdrawActionsDisabled || !withdrawTokenMeta || !withdrawAmount || !recipient.trim() || withdrawState.kind === "pending" ? 0.4 : 1,
                  background: "var(--sell-dim)",
                  border: "1px solid var(--sell-border)",
                  color: "var(--sell)",
                  fontFamily: "var(--font-space-grotesk)",
                  transition: "opacity 0.15s",
                }}
              >
                Sign & submit intent
              </button>
              <ActionBanner state={withdrawState} chainId={config?.chainId} />
            </div>
          </Card>
        </div>
      )}

      {/* Mint Test Tokens */}
      {!loading && (
        <div style={{ marginTop: "20px" }}>
          <Card>
            <CardHeader>
              <CardTitle>Mint Test Tokens</CardTitle>
              <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>owner only</span>
            </CardHeader>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "16px", lineHeight: 1.5 }}>
              Mint tokens directly to your connected wallet. Only works if your wallet is the token contract owner.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <TokenSelector label="Token" tokens={snapshot?.markets.tokens ?? []} value={mintToken} onChange={setMintToken} />
              <Field label="Amount">
                <input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} placeholder="1000" style={inputStyle} />
              </Field>
              <button
                onClick={() => void handleMint()}
                disabled={mintActionsDisabled || !mintToken || !mintAmount || mintState.kind === "pending"}
                style={{
                  padding: "11px",
                  borderRadius: "3px",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  opacity: mintActionsDisabled || !mintToken || !mintAmount || mintState.kind === "pending" ? 0.4 : 1,
                  background: "oklch(55% 0.10 290 / 0.14)",
                  border: "1px solid oklch(55% 0.10 290 / 0.28)",
                  color: "oklch(75% 0.10 290)",
                  fontFamily: "var(--font-space-grotesk)",
                  transition: "opacity 0.15s",
                  maxWidth: "280px",
                }}
              >
                Mint to my wallet
              </button>
              <ActionBanner state={mintState} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function TransferPage() {
  return <AddressGuard>{(address) => <TransferView address={address} />}</AddressGuard>;
}
