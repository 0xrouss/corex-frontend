import { NextResponse, type NextRequest } from "next/server";
import { resolveCorexApiUrl } from "@/lib/server/corex-config";

const READ_AUTH_HEADERS = [
  "X-Corex-Read-Account",
  "X-Corex-Read-Scope",
  "X-Corex-Read-Expires",
  "X-Corex-Read-Signature",
] as const;

export async function proxyCorexRead(request: NextRequest, path: string) {
  const apiUrl = resolveCorexApiUrl().replace(/\/$/, "");
  const target = new URL(`${apiUrl}${path}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const headers = new Headers();
  for (const key of READ_AUTH_HEADERS) {
    const value = request.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  try {
    const response = await fetch(target.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      return NextResponse.json(
        payload ?? { error: `Failed to fetch ${path}` },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Failed to fetch ${path}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
