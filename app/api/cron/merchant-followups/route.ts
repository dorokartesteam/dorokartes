import { NextRequest, NextResponse } from "next/server";
import { runDueActivationFollowUps } from "@/lib/merchant/follow-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueActivationFollowUps({
    origin: new URL(request.url).origin,
    limit: 25,
    automated: true,
  });

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
}
