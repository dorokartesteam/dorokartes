import { NextRequest, NextResponse } from "next/server";
import { sendActivationFollowUp } from "@/lib/merchant/follow-up";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const result = await sendActivationFollowUp({
      leadId: id,
      origin: new URL(request.url).origin,
      automated: false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Follow-up failed." },
      { status: 409 },
    );
  }
}
