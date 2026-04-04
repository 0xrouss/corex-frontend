import {
  erc20Abi,
  formatUnits,
  hexToString,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

export { erc20Abi };

export interface CorexFrontendConfig {
  chainId: number;
  feeWei: string;
  instructionSender: Address;
  custodyAddress: Address;
  extensionId?: Hex;
  authorizedSigner?: Address;
  marketId?: string;
  marketIdBytes32?: Hex;
}

export interface CorexProxyActionResult {
  status: number;
  log?: string;
  data?: Hex;
}

export interface SyncDepositResult {
  depositId: Hex;
  user: Address;
  token: Address;
  amount: string;
  available: string;
  locked: string;
}

export interface RequestWithdrawResult {
  user: Address;
  token: Address;
  amount: string;
  recipient: Address;
  withdrawNonce: string;
  authorizedSigner: Address;
  authorizationDigest: Hex;
  teeAuth: Hex;
}

export interface SubmitWithdrawIntentResult {
  user: Address;
  token: Address;
  amount: string;
  recipient: Address;
  withdrawNonce: string;
  deadline: string;
  intentDigest: Hex;
  authorizedSigner: Address;
  authorizationDigest: Hex;
  teeAuth: Hex;
  finalizeTxHash: Hex;
}

const withdrawIntentTypes = {
  WithdrawIntent: [
    { name: "user", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const corexCustodyAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "depositId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "finalizeWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "withdrawNonce", type: "uint64" },
      { name: "teeAuth", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "nextDepositNonce",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;

export const corexTestTokenAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const corexInstructionSenderAbi = [
  {
    type: "function",
    name: "depositAndSync",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "placeOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "clientOrderId", type: "bytes32" },
          { name: "marketId", type: "bytes32" },
          { name: "side", type: "uint8" },
          { name: "price", type: "uint256" },
          { name: "qty", type: "uint256" },
          { name: "timeInForce", type: "uint8" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "cancelOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "orderId", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "requestWithdraw",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getSelectedTeeIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "teeExtensionRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const teeExtensionRegistryAbi = [
  {
    type: "event",
    name: "TeeInstructionsSent",
    anonymous: false,
    inputs: [
      { indexed: true, name: "extensionId", type: "uint256" },
      { indexed: true, name: "instructionId", type: "bytes32" },
      { indexed: true, name: "rewardEpochId", type: "uint32" },
      {
        indexed: false,
        name: "teeMachines",
        type: "tuple[]",
        components: [
          { name: "teeId", type: "address" },
          { name: "teeProxyId", type: "address" },
          { name: "url", type: "string" },
        ],
      },
      { indexed: false, name: "opType", type: "bytes32" },
      { indexed: false, name: "opCommand", type: "bytes32" },
      { indexed: false, name: "message", type: "bytes" },
      { indexed: false, name: "cosigners", type: "address[]" },
      { indexed: false, name: "cosignersThreshold", type: "uint64" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
  },
] as const;

export function parseAmountInput(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!normalized) throw new Error("Amount is required");
  const amount = parseUnits(normalized, decimals);
  if (amount <= BigInt(0)) throw new Error("Amount must be greater than zero");
  return amount;
}

export function formatTokenAmount(value: string, decimals: number): string {
  try {
    return trimTrailingZeros(formatUnits(BigInt(value), decimals));
  } catch {
    return value;
  }
}

export function decodeHexJson<T>(value: Hex): T {
  return JSON.parse(hexToString(value)) as T;
}

export function buildWithdrawIntentTypedData(
  config: Pick<CorexFrontendConfig, "chainId" | "custodyAddress">,
  intent: {
    user: Address;
    token: Address;
    amount: bigint;
    recipient: Address;
    nonce: bigint;
    deadline: bigint;
  },
) {
  return {
    domain: {
      name: "Corex",
      version: "1",
      chainId: config.chainId,
      verifyingContract: config.custodyAddress,
    },
    types: withdrawIntentTypes,
    primaryType: "WithdrawIntent" as const,
    message: intent,
  };
}

export function normalizeProxyActionResult(payload: unknown): CorexProxyActionResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid proxy result payload");
  }

  const root = payload as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;

  return {
    status: typeof result.status === "number" ? result.status : -1,
    log: typeof result.log === "string" ? result.log : undefined,
    data: typeof result.data === "string" ? (result.data as Hex) : undefined,
  };
}

export function getInstructionIdFromReceipt(
  receipt: TransactionReceipt,
  teeExtensionRegistryAddress?: Address,
): Hex {
  const [parsed] = parseEventLogs({
    abi: teeExtensionRegistryAbi,
    eventName: "TeeInstructionsSent",
    logs: receipt.logs,
    strict: false,
  });

  const instructionId = parsed?.args?.instructionId;
  if (instructionId) return instructionId as Hex;

  if (teeExtensionRegistryAddress) {
    const registryLog = [...receipt.logs]
      .reverse()
      .find(
        (log) =>
          log.address.toLowerCase() === teeExtensionRegistryAddress.toLowerCase() &&
          log.topics.length > 2,
      );
    const registryInstructionId = registryLog?.topics[2];
    if (registryInstructionId) return registryInstructionId as Hex;
  }

  const fallback = receipt.logs[receipt.logs.length - 1]?.topics[2];
  if (!fallback) {
    throw new Error("Instruction id not found in transaction receipt");
  }

  return fallback as Hex;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function shortAddress(value: string, start = 6, end = 4): string {
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, "$1");
}
