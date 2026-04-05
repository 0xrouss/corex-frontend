import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Address, Hex } from "viem";
import type { CorexFrontendConfig } from "@/lib/corex";

interface DeploymentFileShape {
  chainId?: number;
  instructionSender?: string;
  extensionId?: string;
  market?: {
    marketId?: string;
    marketIdBytes32?: string;
  };
  custody?: {
    address?: string;
  };
  withdraw?: {
    authorizedSigner?: string;
  };
}

const DEFAULT_PROXY_URL = "http://127.0.0.1:6676";
const DEFAULT_API_URL = "http://127.0.0.1:6680";
const DEFAULT_FEE_WEI = "1000000000000";

export async function loadCorexFrontendConfig(): Promise<CorexFrontendConfig> {
  const deployment = await readDeploymentFile();

  const instructionSender = pickString(
    process.env.COREX_INSTRUCTION_SENDER,
    deployment?.instructionSender,
  );
  const custodyAddress = pickString(
    process.env.COREX_CUSTODY_ADDRESS,
    deployment?.custody?.address,
  );

  if (!instructionSender) {
    throw new Error("Corex instruction sender is not configured");
  }
  if (!custodyAddress) {
    throw new Error("Corex custody address is not configured");
  }

  const chainId = Number(
    pickString(
      process.env.COREX_CHAIN_ID,
      deployment?.chainId?.toString(),
      "114",
    ),
  );

  return {
    chainId,
    feeWei: pickString(process.env.COREX_FEE_WEI, DEFAULT_FEE_WEI)!,
    instructionSender: instructionSender as Address,
    custodyAddress: custodyAddress as Address,
    extensionId: pickString(process.env.EXTENSION_ID, deployment?.extensionId) as
      | Hex
      | undefined,
    authorizedSigner: pickString(
      process.env.COREX_WITHDRAW_SIGNER_ADDRESS,
      deployment?.withdraw?.authorizedSigner,
    ) as Address | undefined,
    marketId: pickString(process.env.COREX_MARKET_ID, deployment?.market?.marketId),
    marketIdBytes32: pickString(
      process.env.COREX_MARKET_ID_BYTES32,
      deployment?.market?.marketIdBytes32,
    ) as Hex | undefined,
  };
}

export function resolveCorexProxyUrl(): string {
  return pickString(
    process.env.COREX_PROXY_URL,
    process.env.NEXT_PUBLIC_COREX_PROXY_URL,
    DEFAULT_PROXY_URL,
  )!;
}

export function resolveCorexApiUrl(): string {
  return pickString(
    process.env.COREX_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    DEFAULT_API_URL,
  )!;
}

async function readDeploymentFile(): Promise<DeploymentFileShape | null> {
  for (const file of resolveDeploymentFilePaths()) {
    try {
      const raw = await readFile(file, "utf8");
      return JSON.parse(raw) as DeploymentFileShape;
    } catch {
      continue;
    }
  }
  return null;
}

function resolveDeploymentFilePaths(): string[] {
  const configured = process.env.COREX_DEPLOYMENT_FILE;
  if (!configured) {
    return [
      path.resolve(
        process.cwd(),
        "..",
        "corex-tee",
        "config",
        "coston2",
        "corex-deployment.json",
      ),
    ];
  }

  if (path.isAbsolute(configured)) return [configured];
  return [path.resolve(process.cwd(), configured)];
}

function pickString(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
