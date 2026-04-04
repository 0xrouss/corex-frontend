import { NextResponse } from "next/server";
import { loadCorexFrontendConfig } from "@/lib/server/corex-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await loadCorexFrontendConfig();
    return NextResponse.json(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Corex config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
