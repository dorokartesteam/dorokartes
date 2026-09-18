import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
  setAdminReviewState,
  type AdminReviewState,
} from "../../../../../lib/admin-review";
import { DiscoveryStatus } from "../../../../../src/generated/prisma/client";

type BulkBody = {
  ids?: string[];
  action?: "ACCEPT" | "REJECT" | "NEEDS_REVIEW";
};

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as BulkBody;
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x) => typeof x === "string" && x.trim()))]
    : [];

  if (!ids.length) {
    return NextResponse.json({ error: "No discovery items selected." }, { status: 400 });
  }

  let reviewState: AdminReviewState;
  let status: DiscoveryStatus;

  switch (body.action) {
    case "ACCEPT":
      reviewState = "ACCEPTED";
      status = DiscoveryStatus.QUEUED;
      break;
    case "REJECT":
      reviewState = "REJECTED";
      status = DiscoveryStatus.REJECTED;
      break;
    case "NEEDS_REVIEW":
      reviewState = "NEEDS_REVIEW";
      status = DiscoveryStatus.DISCOVERED;
      break;
    default:
      return NextResponse.json({ error: "Invalid bulk action." }, { status: 400 });
  }

  const items = await prisma.discoveryItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, notes: true },
  });

  if (!items.length) {
    return NextResponse.json({ error: "No matching discovery items found." }, { status: 404 });
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status,
          notes: setAdminReviewState(item.notes, reviewState),
        },
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    updated: items.length,
    action: body.action,
  });
}
