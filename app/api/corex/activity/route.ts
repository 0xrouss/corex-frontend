import type { NextRequest } from "next/server";
import { proxyCorexRead } from "@/lib/server/corex-read-proxy";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyCorexRead(request, "/activity");
}
