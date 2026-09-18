import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAnalyticsPath, prepareGoogleAnalytics } from "../../lib/public/google-analytics";

test("only public page routes are eligible for GA", () => {
  for (const path of ["/", "/browse", "/brands/sephora", "/gift-cards/card", "/categories/beauty", "/occasions/birthday", "/regions", "/register-store"]) assert.equal(isPublicAnalyticsPath(path), true, path);
  for (const path of ["/admin", "/admin/analytics", "/api/admin/gift-card", "/go/card", "/administrator", "/%61dmin"]) assert.equal(isPublicAnalyticsPath(path), false, path);
});

test("GA config initializes once, skips admin and disables history tracking before admin navigation", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = new URL("https://dorokartes.gr/admin");
  const observed: unknown[] = [];
  const listeners = new Map<string, () => void>();
  const fake: Record<string, unknown> = {
    location, dispatchEvent: () => true,
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    history: {
      pushState: (_data: unknown, _unused: string, url: string) => { observed.push(fake["ga-disable-G-TEST"]); location.href = new URL(url, location).href; },
      replaceState: () => { throw new Error("history failed"); },
    },
  };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
    prepareGoogleAnalytics("G-TEST");
    assert.equal(fake.dataLayer, undefined);
    assert.equal(fake["ga-disable-G-TEST"], true);
    const history = fake.history as History;
    history.pushState({}, "", "/browse");
    prepareGoogleAnalytics("G-TEST");
    prepareGoogleAnalytics("G-TEST");
    const queue = Reflect.get(fake, "dataLayer") as IArguments[];
    assert.equal(queue.filter(args => args[0] === "config").length, 1);
    assert.equal(queue.filter(args => args[0] === "event" && args[1] === "page_view").length, 0);
    history.pushState({}, "", "/admin/analytics");
    assert.deepEqual(observed, [false, true]);
    prepareGoogleAnalytics("G-TEST");
    assert.equal(queue.length, 2);
    location.href = "https://dorokartes.gr/categories";
    listeners.get("popstate")!();
    assert.equal(fake["ga-disable-G-TEST"], false);
    assert.throws(() => history.replaceState({}, "", "/admin"));
    assert.equal(fake["ga-disable-G-TEST"], false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("GA does not initialize on localhost or with an invalid ID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fake = { location: new URL("http://localhost/browse") };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
    prepareGoogleAnalytics("G-TEST");
    assert.equal("dataLayer" in fake, false);
    fake.location = new URL("https://dorokartes.gr/browse");
    prepareGoogleAnalytics("invalid");
    assert.equal("dataLayer" in fake, false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
