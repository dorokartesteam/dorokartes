import robotsParser from "robots-parser";
import { DISCOVERY_CONFIG } from "./config";

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DISCOVERY_CONFIG.requestTimeoutMs,
  );

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": DISCOVERY_CONFIG.userAgent,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const origin = parsed.origin;

  let robots = robotsCache.get(origin);

  if (!robots) {
    const robotsUrl = `${origin}/robots.txt`;
    let body = "";

    try {
      body = await fetchText(robotsUrl);
    } catch {
      // If robots.txt is unavailable, do not block verification.
      body = "";
    }

    robots = robotsParser(robotsUrl, body);
    robotsCache.set(origin, robots);
  }

  return robots.isAllowed(url, DISCOVERY_CONFIG.userAgent) !== false;
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
