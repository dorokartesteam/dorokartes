import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = prisma as any;
  const action = String(body.action || "");
  const data: any = {};
  if (action === "accept") data.status = "QUEUED";
  else if (action === "reject") data.status = "REJECTED";
  else if (action === "review") data.status = "DISCOVERED";
  else return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  if (typeof body.merchantName === "string") data.merchantName = body.merchantName.trim();
  if (typeof body.possibleOfficialUrl === "string") data.possibleOfficialUrl = body.possibleOfficialUrl.trim();
  if (typeof body.title === "string") data.title = body.title.trim();

  try {
    const row = await db.discoveryItem.update({ where: { id }, data });
    return NextResponse.json({ ok: true, row });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "update_failed" }, { status: 500 });
  }
}
