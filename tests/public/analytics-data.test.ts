import assert from "node:assert/strict";
import { test } from "node:test";

test("analytics distinguishes unavailable data from a real zero and isolates source failures", async t => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
  const { prisma } = await import("../../lib/prisma");
  const { getAnalyticsData } = await import("../../lib/admin/analytics");
  function replace(target: object, key: string, replacement: unknown) {
    const original = Reflect.get(target, key);
    Reflect.set(target, key, replacement);
    t.after(() => { Reflect.set(target, key, original); });
  }
  let failOutbound = true;
  let failSearch = false;
  replace(prisma.outboundClick, "groupBy", async () => { if (failOutbound) throw new Error("offline"); return []; });
  replace(prisma.outboundClick, "findMany", async () => []);
  replace(prisma.giftCard, "findMany", async () => []);
  replace(prisma.merchant, "findMany", async () => []);
  replace(prisma.searchEvent, "count", async () => { if (failSearch) throw new Error("offline"); return 5; });
  replace(prisma.searchEvent, "findMany", async () => []);
  const unavailable = await getAnalyticsData(new Date("2026-09-15T12:00:00Z"));
  assert.equal(unavailable.outbound, null);
  assert.equal(unavailable.search?.count, 5);
  assert.equal(unavailable.since.toISOString(), "2026-08-16T12:00:00.000Z");
  failOutbound = false;
  failSearch = true;
  const empty = await getAnalyticsData();
  assert.equal(empty.outbound?.clicks, 0);
  assert.equal(empty.search, null);
});
