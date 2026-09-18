import assert from "node:assert/strict";
import { test } from "node:test";
import { isOutboundNavigation } from "../../lib/public/outbound-request";

test("normal GET navigation remains eligible for click tracking", () => {
  assert.equal(isOutboundNavigation("GET", new Headers({ referer: "https://dorokartes.gr/gift-cards/test" })), true);
});
test("HEAD checks cannot create clicks", () => {
  assert.equal(isOutboundNavigation("HEAD", new Headers()), false);
});
test("Next.js and browser prefetch/prerender requests cannot create clicks", () => {
  const requests: Record<string, string>[] = [
    { "next-router-prefetch": "1" },
    { "x-middleware-prefetch": "1" },
    { purpose: "prefetch" },
    { "sec-purpose": "prefetch;prerender" },
    { purpose: "PREFETCH" },
  ];
  for (const headers of requests) assert.equal(isOutboundNavigation("GET", new Headers(headers)), false);
});
