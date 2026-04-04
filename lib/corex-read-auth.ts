"use client";

import type { Address, Hex } from "viem";

const READ_AUTH_DOMAIN_NAME = "Corex TEE";
const READ_AUTH_DOMAIN_VERSION = "1";
const READ_AUTH_SCOPE = "account-read";
const READ_AUTH_TTL_SECONDS = 240;
const READ_AUTH_REFRESH_BUFFER_SECONDS = 30;
const READ_AUTH_CACHE_PREFIX = "corex-read-auth:v2:";
const pendingAuthByAccount = new Map<Address, Promise<CorexReadAuth>>();

const readAuthorizationTypes = {
  ReadAuthorization: [
    { name: "account", type: "address" },
    { name: "scope", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export interface CorexReadAuth {
  account: Address;
  scope: string;
  expiresAt: number;
  signature: Hex;
}

export interface CorexReadAuthTypedData {
  domain: {
    name: typeof READ_AUTH_DOMAIN_NAME;
    version: typeof READ_AUTH_DOMAIN_VERSION;
  };
  types: typeof readAuthorizationTypes;
  primaryType: "ReadAuthorization";
  message: {
    account: Address;
    scope: string;
    expiresAt: bigint;
  };
}

export type SignTypedDataAsync = (args: CorexReadAuthTypedData) => Promise<Hex>;

export function buildCorexReadAuthTypedData(auth: Pick<CorexReadAuth, "account" | "scope" | "expiresAt">): CorexReadAuthTypedData {
  return {
    domain: {
      name: READ_AUTH_DOMAIN_NAME,
      version: READ_AUTH_DOMAIN_VERSION,
    },
    types: readAuthorizationTypes,
    primaryType: "ReadAuthorization",
    message: {
      account: normalizeAddress(auth.account),
      scope: auth.scope,
      expiresAt: BigInt(auth.expiresAt),
    },
  };
}

export function buildCorexReadAuthHeaders(auth: CorexReadAuth): HeadersInit {
  return {
    "X-Corex-Read-Account": normalizeAddress(auth.account),
    "X-Corex-Read-Scope": auth.scope,
    "X-Corex-Read-Expires": auth.expiresAt.toString(),
    "X-Corex-Read-Signature": auth.signature,
  };
}

export async function ensureCorexReadAuth(params: {
  address: Address;
  signTypedDataAsync: SignTypedDataAsync;
}): Promise<CorexReadAuth> {
  const account = normalizeAddress(params.address);
  const now = unixNow();
  const cached = readCachedAuth(account);
  if (cached && cached.expiresAt > now + READ_AUTH_REFRESH_BUFFER_SECONDS) {
    return cached;
  }

  const pending = pendingAuthByAccount.get(account);
  if (pending) {
    return pending;
  }

  const next = (async () => {
    const expiresAt = unixNow() + READ_AUTH_TTL_SECONDS;
    const auth: CorexReadAuth = {
      account,
      scope: READ_AUTH_SCOPE,
      expiresAt,
      signature: await params.signTypedDataAsync(
        buildCorexReadAuthTypedData({
          account,
          scope: READ_AUTH_SCOPE,
          expiresAt,
        }),
      ),
    };
    writeCachedAuth(auth);
    return auth;
  })();

  pendingAuthByAccount.set(account, next);
  try {
    return await next;
  } finally {
    pendingAuthByAccount.delete(account);
  }
}

function normalizeAddress(address: Address): Address {
  return address.toLowerCase() as Address;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function readCachedAuth(account: Address): CorexReadAuth | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey(account));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CorexReadAuth>;
    if (
      typeof parsed.account !== "string" ||
      typeof parsed.scope !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.signature !== "string"
    ) {
      window.localStorage.removeItem(cacheKey(account));
      return null;
    }
    if (normalizeAddress(parsed.account as Address) !== account) {
      window.localStorage.removeItem(cacheKey(account));
      return null;
    }
    return {
      account,
      scope: parsed.scope,
      expiresAt: parsed.expiresAt,
      signature: parsed.signature as Hex,
    };
  } catch {
    window.localStorage.removeItem(cacheKey(account));
    return null;
  }
}

function writeCachedAuth(auth: CorexReadAuth): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(cacheKey(auth.account), JSON.stringify(auth));
}

function cacheKey(account: Address): string {
  return `${READ_AUTH_CACHE_PREFIX}${account}`;
}
