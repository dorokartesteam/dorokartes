import { NextRequest, NextResponse } from "next/server";
import { runDueActivationFollowUps } from "@/lib/merchant/follow-up";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const result = await runDueActivationFollowUps({
    origin: new URL(request.url).origin,
    limit: 25,
    automated: false,
  });
  return NextResponse.json({ ok: true, ...result });
}
