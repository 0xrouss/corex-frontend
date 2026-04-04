import { NextResponse } from "next/server";
import { resolveCorexApiUrl } from "@/lib/server/corex-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiUrl = resolveCorexApiUrl().replace(/\/$/, "");

  try {
    const body = await request.json();
    const response = await fetch(`${apiUrl}/withdraw-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error ?? "Failed to submit withdraw intent" },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit withdraw intent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
