import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { Prisma } from "../../src/generated/prisma/client";

test("outbound route logs navigation only and preserves redirects when tracking fails", async t => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
  const { prisma } = await import("../../lib/prisma");
  const { GET } = await import("../../app/go/[id]/route");
  const card = { id: "card", merchantId: "merchant", officialUrl: "https://merchant.example/gift", status: "ACTIVE", merchant: { status: "ACTIVE" } };
  const originalFind = prisma.giftCard.findUnique;
  const originalCreate = prisma.outboundClick.create;
  const create = t.mock.fn(async (args: Prisma.OutboundClickCreateArgs) => ({ id: "test", ...args.data }));
  prisma.giftCard.findUnique = (async () => card) as unknown as typeof originalFind;
  prisma.outboundClick.create = create as unknown as typeof originalCreate;
  t.after(() => {
    prisma.giftCard.findUnique = originalFind;
    prisma.outboundClick.create = originalCreate;
  });
  const request = (method = "GET", headers: Record<string, string> = {}) => new NextRequest("https://dorokartes.gr/go/card?from=brand", { method, headers });
  const routeContext = { params: Promise.resolve({ id: "card" }) };
  const response = await GET(request(), routeContext);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), card.officialUrl);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(create.mock.calls[0].arguments[0].data.source, "public_brand");
  assert.equal(create.mock.calls[0].arguments[0].data.giftCardId, "card");
  await GET(request("HEAD"), routeContext);
  await GET(request("GET", { "next-router-prefetch": "1" }), routeContext);
  assert.equal(create.mock.callCount(), 1);
  card.merchant.status = "INACTIVE";
  assert.equal((await GET(request(), routeContext)).headers.get("location"), "https://dorokartes.gr/browse");
  assert.equal(create.mock.callCount(), 1);
  card.merchant.status = "ACTIVE";
  create.mock.mockImplementation(async () => { throw new Error("database unavailable"); });
  assert.equal((await GET(request(), routeContext)).headers.get("location"), card.officialUrl);
});
