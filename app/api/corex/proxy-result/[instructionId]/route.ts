import { NextResponse, type NextRequest } from "next/server";
import { resolveCorexProxyUrl } from "@/lib/server/corex-config";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 1500;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instructionId: string }> },
) {
  const { instructionId } = await params;
  const proxyUrl = resolveCorexProxyUrl().replace(/\/$/, "");
  const target = `${proxyUrl}/action/result/${instructionId}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(target, { cache: "no-store" });

      if (response.ok) {
        const json = (await response.json()) as {
          result?: { status?: number };
          status?: number;
        };
        const status = json.result?.status ?? json.status;
        if (typeof status === "number" && status < 2) {
          return NextResponse.json(json);
        }
      }
    } catch {}

    await sleep(POLL_INTERVAL_MS);
  }

  return NextResponse.json(
    { error: `Timed out waiting for TEE result for ${instructionId}` },
    { status: 504 },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
