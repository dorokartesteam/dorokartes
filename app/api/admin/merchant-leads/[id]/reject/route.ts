import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const lead = await prisma.merchantLead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  await prisma.merchantLead.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
