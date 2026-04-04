"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { AddressGuard } from "@/components/ui/address-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  corexCustodyAbi,
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
  type RequestWithdrawResult,
  type SyncDepositResult,
} from "@/lib/corex";
import {
  fetchAccount,
  fetchActivity,
  fetchCorexConfig,
  fetchMarkets,
  fetchProxyResult,
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

function TransferView({ address }: { address: string }) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

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

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    if (!recipient) {
      setRecipient(address);
    }
  }, [address, recipient]);

  useEffect(() => {
    const tokens = snapshot?.markets.tokens ?? [];
    if (!tokens.length) return;

    const defaultToken = tokens.find((token) => token.role === "QUOTE") ?? tokens[0];
    if (!depositToken) setDepositToken(defaultToken.address);
    if (!withdrawToken) setWithdrawToken(defaultToken.address);
  }, [depositToken, snapshot, withdrawToken]);

  const depositTokenMeta = findToken(snapshot?.markets.tokens, depositToken);
  const withdrawTokenMeta = findToken(snapshot?.markets.tokens, withdrawToken);
  const depositBalance = findBalance(snapshot?.account.balances, depositTokenMeta?.address);
  const withdrawBalance = findBalance(snapshot?.account.balances, withdrawTokenMeta?.address);
  const balanceRows = getBalanceRows(snapshot?.account.balances, snapshot?.markets.tokens);

  useEffect(() => {
    if (!config || !publicClient) return;

    let cancelled = false;
    Promise.all([
      publicClient.readContract({
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "getSelectedTeeIds",
      }),
      publicClient.readContract({
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "teeExtensionRegistry",
      }),
    ])
      .then(([teeIds, registryAddress]) => {
        if (cancelled) return;
        setSelectedTeeIds(teeIds);
        setTeeExtensionRegistryAddress(registryAddress);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedTeeIds([]);
        setTeeExtensionRegistryAddress(null);
      });

    return () => {
      cancelled = true;
    };
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
      .readContract({
        address: depositTokenMeta.address as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as Address],
      })
      .then((balance) => {
        if (cancelled) return;
        setDepositWalletBalance(balance);
      })
      .catch((error) => {
        if (cancelled) return;
        setDepositWalletBalance(null);
        setDepositWalletBalanceError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setDepositWalletBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, depositTokenMeta, depositWalletBalanceVersion, publicClient]);

  const actionsDisabled =
    !config || !publicClient || selectedTeeIds.length === 0 || loading;

  async function loadAll() {
    setLoading(true);
    setLoadError(null);

    try {
      const [markets, account, activity, corexConfig] = await Promise.all([
        fetchMarkets(),
        fetchAccount(address),
        fetchActivity(address),
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
    const [account, activity] = await Promise.all([
      fetchAccount(address),
      fetchActivity(address),
    ]);

    setSnapshot((current) =>
      current
        ? {
            ...current,
            account,
            activity,
          }
        : null,
    );
  }

  async function handleDeposit() {
    if (!config || !publicClient || !depositTokenMeta) return;

    try {
      const amount = parseAmountInput(depositAmount, depositTokenMeta.decimals);
      const token = depositTokenMeta.address as Address;

      setDepositState({
        kind: "pending",
        stage: "Approving token",
        message: `Authorizing ${depositTokenMeta.symbol} for Corex custody.`,
      });

      const approveHash = await writeContractAsync({
        chainId: config.chainId,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [config.custodyAddress, amount],
      });
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      });
      assertSuccessfulReceipt(approveReceipt, "approve");

      setDepositState({
        kind: "pending",
        stage: "Depositing and syncing",
        message: `Escrowing ${depositTokenMeta.symbol} in custody and dispatching the TEE credit in one transaction.`,
        txHashes: [approveHash],
      });

      const depositHash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "depositAndSync",
        args: [token, amount],
        value: BigInt(config.feeWei),
      });
      const depositReceipt = await publicClient.waitForTransactionReceipt({
        hash: depositHash,
      });
      assertSuccessfulReceipt(depositReceipt, "depositAndSync");
      const instructionId = getInstructionIdFromReceipt(
        depositReceipt,
        teeExtensionRegistryAddress ?? undefined,
      );
      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) {
        throw new Error(actionResult.log ?? "TEE depositAndSync failed");
      }

      const synced = decodeHexJson<SyncDepositResult>(actionResult.data);
      await refreshAccountSnapshot();
      setDepositWalletBalanceVersion((current) => current + 1);
      setDepositAmount("");
      setDepositState({
        kind: "success",
        stage: "Deposit settled",
        message: `Deposit ${shortAddress(synced.depositId)} is now visible in the TEE session balance.`,
        txHashes: [approveHash, depositHash],
        instructionId,
      });
    } catch (error) {
      setDepositState({
        kind: "error",
        stage: "Deposit failed",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleWithdraw() {
    if (!config || !publicClient || !withdrawTokenMeta) return;

    try {
      const amount = parseAmountInput(withdrawAmount, withdrawTokenMeta.decimals);
      const user = address as Address;
      const token = withdrawTokenMeta.address as Address;
      const recipientAddress = recipient.trim() as Address;

      setWithdrawState({
        kind: "pending",
        stage: "Requesting TEE authorization",
        message: "Calling requestWithdraw() and waiting for the signed withdrawal.",
      });

      const requestHash = await writeContractAsync({
        chainId: config.chainId,
        address: config.instructionSender,
        abi: corexInstructionSenderAbi,
        functionName: "requestWithdraw",
        args: [
          {
            user,
            token,
            amount,
            recipient: recipientAddress,
          },
        ],
        value: BigInt(config.feeWei),
      });

      const requestReceipt = await publicClient.waitForTransactionReceipt({
        hash: requestHash,
      });
      assertSuccessfulReceipt(requestReceipt, "requestWithdraw");
      const instructionId = getInstructionIdFromReceipt(
        requestReceipt,
        teeExtensionRegistryAddress ?? undefined,
      );
      const proxyPayload = await fetchProxyResult(instructionId);
      const actionResult = normalizeProxyActionResult(proxyPayload);

      if (actionResult.status !== 1 || !actionResult.data) {
        throw new Error(actionResult.log ?? "TEE requestWithdraw failed");
      }

      const authorization = decodeHexJson<RequestWithdrawResult>(actionResult.data);

      setWithdrawState({
        kind: "pending",
        stage: "Finalizing on-chain",
        message: "Submitting finalizeWithdraw() with the TEE signature.",
        txHashes: [requestHash],
        instructionId,
      });

      const finalizeHash = await writeContractAsync({
        chainId: config.chainId,
        address: config.custodyAddress,
        abi: corexCustodyAbi,
        functionName: "finalizeWithdraw",
        args: [
          user,
          recipientAddress,
          token,
          amount,
          BigInt(authorization.withdrawNonce),
          authorization.teeAuth,
        ],
      });

      const finalizeReceipt = await publicClient.waitForTransactionReceipt({
        hash: finalizeHash,
      });
      assertSuccessfulReceipt(finalizeReceipt, "finalizeWithdraw");
      await refreshAccountSnapshot();
      setWithdrawAmount("");
      setWithdrawState({
        kind: "success",
        stage: "Withdrawal finalized",
        message: `Nonce ${authorization.withdrawNonce} consumed and custody released to ${shortAddress(recipientAddress)}.`,
        txHashes: [requestHash, finalizeHash],
        instructionId,
      });
    } catch (error) {
      setWithdrawState({
        kind: "error",
        stage: "Withdrawal failed",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleMint() {
    if (!config || !publicClient) return;
    const mintTokenMeta = findToken(snapshot?.markets.tokens, mintToken);
    if (!mintTokenMeta) return;

    try {
      const amount = parseAmountInput(mintAmount, mintTokenMeta.decimals);

      setMintState({
        kind: "pending",
        stage: "Minting tokens",
        message: `Minting ${mintAmount} ${mintTokenMeta.symbol} to your wallet.`,
      });

      const mintHash = await writeContractAsync({
        chainId: config.chainId,
        address: mintTokenMeta.address as Address,
        abi: corexTestTokenAbi,
        functionName: "mint",
        args: [address as Address, amount],
      });

      const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
      assertSuccessfulReceipt(mintReceipt, "mint");

      setDepositWalletBalanceVersion((current) => current + 1);
      setMintAmount("");
      setMintState({
        kind: "success",
        stage: "Tokens minted",
        message: `${mintAmount} ${mintTokenMeta.symbol} minted to your wallet.`,
        txHashes: [mintHash],
      });
    } catch (error) {
      setMintState({
        kind: "error",
        stage: "Mint failed",
        message: getErrorMessage(error),
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Deposit & Withdraw
          </h1>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: "rgba(245,158,11,0.14)",
              border: "1px solid rgba(245,158,11,0.24)",
              color: "#fbbf24",
            }}
          >
            custody + TEE flow
          </span>
        </div>
        <p className="text-sm font-mono" style={{ color: "var(--muted)" }}>
          {address}
        </p>
        <p className="max-w-3xl text-sm leading-6" style={{ color: "rgba(255,255,255,0.68)" }}>
          Deposits now use one public contract entrypoint:
          <span className="text-white"> approve(custody)</span> then
          <span className="text-white"> depositAndSync()</span>, which escrows tokens first and
          only then dispatches the TEE credit instruction. Withdrawals do the reverse: the TEE signs an authorization through
          <span className="text-white"> requestWithdraw()</span>, then custody releases funds with
          <span className="text-white"> finalizeWithdraw()</span>.
        </p>
      </div>

      {loadError && <ErrorBanner message={loadError} />}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
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
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full"
              style={{
                background: selectedTeeIds.length > 0 ? "#22c55e" : "#ef4444",
              }}
            />
            <span className="text-sm text-white">
              {selectedTeeIds.length > 0
                ? `${selectedTeeIds.length} TEE selected`
                : "No TEE selected"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--muted)" }}>
            {selectedTeeIds.length > 0
              ? `Instructions will route through ${shortAddress(selectedTeeIds[0])}.`
              : "Run selectTee() in the deployed CorexInstructionSender before using this page."}
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session State</CardTitle>
          </CardHeader>
          <Metric
            label="Withdraw nonce"
            value={snapshot?.account.withdrawNonce ?? "0"}
          />
          <Metric
            label="Deposits"
            value={String(snapshot?.activity.deposits.length ?? 0)}
          />
          <Metric
            label="Withdrawals"
            value={String(snapshot?.activity.withdrawals.length ?? 0)}
          />
        </Card>
      </div>

      {!loading ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your TEE Balances</CardTitle>
          </CardHeader>
          <BalanceSnapshot rows={balanceRows} />
        </Card>
      ) : null}

      {loading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Deposit</CardTitle>
            </CardHeader>

            <FlowPillGroup
              items={[
                "approve token",
                "deposit and sync",
                "poll tee result",
              ]}
              tint="rgba(34,197,94,0.12)"
              border="rgba(34,197,94,0.18)"
              color="#4ade80"
            />

            <div className="mt-5 flex flex-col gap-4">
              <TokenSelector
                label="Token"
                tokens={snapshot?.markets.tokens ?? []}
                value={depositToken}
                onChange={setDepositToken}
              />

              <Field label="Amount">
                <input
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                  placeholder="10.5"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                  style={inputStyle}
                />
              </Field>

              <PreviewBox
                title={depositTokenMeta ? `${depositTokenMeta.symbol} deposit preview` : "Deposit preview"}
                lines={[
                  depositWalletBalanceLoading
                    ? "Wallet balance on-chain: loading…"
                    : depositWalletBalance !== null && depositTokenMeta
                      ? `Wallet balance on-chain: ${formatTokenAmount(
                          depositWalletBalance.toString(),
                          depositTokenMeta.decimals,
                        )}`
                      : depositWalletBalanceError
                        ? `Wallet balance on-chain: unavailable (${depositWalletBalanceError})`
                        : "Wallet balance on-chain: select a token",
                  depositBalance && depositTokenMeta
                    ? `Current TEE available: ${formatTokenAmount(
                        depositBalance.available,
                        depositTokenMeta.decimals,
                      )} · locked: ${formatTokenAmount(
                        depositBalance.locked,
                        depositTokenMeta.decimals,
                      )}`
                    : "Current TEE balance: none tracked yet",
                  depositTokenMeta
                    ? `Decimals: ${depositTokenMeta.decimals}`
                    : "Select a token",
                  depositAmount && depositTokenMeta
                    ? `Raw amount: ${parseAmountLabel(depositAmount, depositTokenMeta.decimals)}`
                    : "Raw amount: —",
                  depositBalance && depositTokenMeta
                    ? `TEE balance after sync will add to ${formatTokenAmount(
                        depositBalance.available,
                        depositTokenMeta.decimals,
                      )} available`
                    : "TEE balance will update after depositAndSync() succeeds",
                ]}
              />

              <button
                onClick={() => void handleDeposit()}
                disabled={actionsDisabled || !depositTokenMeta || !depositAmount || depositState.kind === "pending"}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(34,197,94,0.24), rgba(34,197,94,0.14))",
                  border: "1px solid rgba(34,197,94,0.24)",
                  color: "#dcfce7",
                }}
              >
                Approve, deposit, sync
              </button>

              <ActionBanner state={depositState} />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Withdraw</CardTitle>
            </CardHeader>

            <FlowPillGroup
              items={[
                "request TEE signature",
                "poll proxy result",
                "finalize in custody",
              ]}
              tint="rgba(239,68,68,0.1)"
              border="rgba(239,68,68,0.18)"
              color="#f87171"
            />

            <div className="mt-5 flex flex-col gap-4">
              <TokenSelector
                label="Token"
                tokens={snapshot?.markets.tokens ?? []}
                value={withdrawToken}
                onChange={setWithdrawToken}
              />

              <Field label="Amount">
                <input
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="5"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                  style={inputStyle}
                />
              </Field>

              <Field label="Recipient">
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-xl px-4 py-3 text-sm font-mono text-white outline-none"
                  style={inputStyle}
                />
              </Field>

              <PreviewBox
                title={withdrawTokenMeta ? `${withdrawTokenMeta.symbol} withdraw preview` : "Withdraw preview"}
                lines={[
                  withdrawBalance && withdrawTokenMeta
                    ? `Available in TEE: ${formatTokenAmount(withdrawBalance.available, withdrawTokenMeta.decimals)}`
                    : "Available in TEE: none tracked yet",
                  withdrawBalance && withdrawTokenMeta
                    ? `Locked in TEE: ${formatTokenAmount(withdrawBalance.locked, withdrawTokenMeta.decimals)}`
                    : "Locked in TEE: 0",
                  withdrawAmount && withdrawTokenMeta
                    ? `Raw amount: ${parseAmountLabel(withdrawAmount, withdrawTokenMeta.decimals)}`
                    : "Raw amount: —",
                  `Next withdraw nonce: ${snapshot?.account.withdrawNonce ?? "0"} -> ${
                    snapshot
                      ? String(BigInt(snapshot.account.withdrawNonce) + BigInt(1))
                      : "—"
                  }`,
                ]}
              />

              <button
                onClick={() => void handleWithdraw()}
                disabled={
                  actionsDisabled ||
                  !withdrawTokenMeta ||
                  !withdrawAmount ||
                  !recipient.trim() ||
                  withdrawState.kind === "pending"
                }
                className="rounded-xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.12))",
                  border: "1px solid rgba(239,68,68,0.22)",
                  color: "#fee2e2",
                }}
              >
                Request & finalize
              </button>

              <ActionBanner state={withdrawState} />
            </div>
          </Card>
        </div>
      )}

      {!loading && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Mint Test Tokens</CardTitle>
            </CardHeader>

            <p className="text-sm leading-6" style={{ color: "rgba(255,255,255,0.55)" }}>
              Mint tokens directly to your connected wallet. Only works if your wallet is the owner of the token contract.
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <TokenSelector
                label="Token"
                tokens={snapshot?.markets.tokens ?? []}
                value={mintToken}
                onChange={setMintToken}
              />

              <Field label="Amount">
                <input
                  value={mintAmount}
                  onChange={(event) => setMintAmount(event.target.value)}
                  placeholder="1000"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                  style={inputStyle}
                />
              </Field>

              <button
                onClick={() => void handleMint()}
                disabled={actionsDisabled || !mintToken || !mintAmount || mintState.kind === "pending"}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.24), rgba(139,92,246,0.14))",
                  border: "1px solid rgba(139,92,246,0.28)",
                  color: "#e9d5ff",
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
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
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

function FlowPillGroup({
  items,
  tint,
  border,
  color,
}: {
  items: string[];
  tint: string;
  border: string;
  color: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em]"
          style={{ background: tint, border: `1px solid ${border}`, color }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PreviewBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        {lines.map((line) => (
          <p key={line} className="text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
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
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No TEE balances yet. Successful deposits will appear here and feed the withdraw panel below.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rows.map(({ token, balance }) => (
        <div
          key={token.address}
          className="rounded-2xl px-4 py-4"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{token.symbol}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
                {token.role}
              </p>
            </div>
            <span
              className="rounded-full px-2 py-1 text-[11px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.74)",
              }}
            >
              {token.decimals} dp
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Metric
              label="Available"
              value={formatTokenAmount(balance.available, token.decimals)}
            />
            <Metric
              label="Locked"
              value={formatTokenAmount(balance.locked, token.decimals)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-4 text-sm">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="font-mono text-white">{value}</span>
    </div>
  );
}

function ActionBanner({ state }: { state: ActionState }) {
  if (state.kind === "idle") return null;

  const palette =
    state.kind === "success"
      ? {
          background: "rgba(34,197,94,0.08)",
          border: "rgba(34,197,94,0.18)",
          color: "#86efac",
        }
      : state.kind === "error"
        ? {
            background: "rgba(239,68,68,0.08)",
            border: "rgba(239,68,68,0.2)",
            color: "#fca5a5",
          }
        : {
            background: "rgba(245,158,11,0.08)",
            border: "rgba(245,158,11,0.2)",
            color: "#fcd34d",
          };

  return (
    <div
      className="rounded-2xl px-4 py-4 text-sm"
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
    >
      <div className="flex flex-col gap-2">
        {state.stage && <p className="font-semibold text-white">{state.stage}</p>}
        {state.message && <p>{state.message}</p>}
        {state.txHashes?.length ? (
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {state.txHashes.map((hash) => (
              <span
                key={hash}
                className="rounded-full px-2 py-1"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                tx {shortAddress(hash, 8, 6)}
              </span>
            ))}
          </div>
        ) : null}
        {state.instructionId ? (
          <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.72)" }}>
            instruction {state.instructionId}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-6 rounded-xl px-4 py-3 text-sm"
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

function SkeletonGrid() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {[1, 2].map((index) => (
        <div
          key={index}
          className="h-[34rem] animate-pulse rounded-2xl"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        />
      ))}
    </div>
  );
}

function findToken(tokens: Token[] | undefined, address: string | undefined) {
  if (!tokens || !address) return undefined;
  return tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
}

function findBalance(
  balances: Record<string, Balance> | undefined,
  tokenAddress: string | undefined,
) {
  if (!balances || !tokenAddress) return undefined;

  const entry = Object.entries(balances).find(
    ([address]) => address.toLowerCase() === tokenAddress.toLowerCase(),
  );

  return entry?.[1];
}

function getBalanceRows(
  balances: Record<string, Balance> | undefined,
  tokens: Token[] | undefined,
): BalanceRow[] {
  if (!balances || !tokens) return [];

  return tokens.flatMap((token) => {
    const balance = findBalance(balances, token.address);
    return balance ? [{ token, balance }] : [];
  });
}

function parseAmountLabel(value: string, decimals: number) {
  try {
    return parseAmountInput(value, decimals).toString();
  } catch {
    return "invalid";
  }
}

function assertSuccessfulReceipt(
  receipt: { status: "success" | "reverted"; transactionHash: Hex },
  action: string,
) {
  if (receipt.status === "success") return;
  throw new Error(`${action} transaction reverted: ${receipt.transactionHash}`);
}

const inputStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
} as const;
