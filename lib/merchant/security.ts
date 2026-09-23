import { createHash, randomBytes } from "node:crypto";

export const MERCHANT_SESSION_COOKIE = "dorokartes_merchant_session";

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
