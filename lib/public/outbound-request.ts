export function outboundSource(from: string | null) {
  return from === "brand" ? "public_brand" : "public_gift_card";
}

export function isOutboundNavigation(method: string, headers: Headers) {
  if (method !== "GET") return false;
  if (headers.has("next-router-prefetch") || headers.has("x-middleware-prefetch")) return false;
  const purpose = `${headers.get("purpose") || ""} ${headers.get("sec-purpose") || ""}`;
  return !/\b(?:prefetch|prerender)\b/i.test(purpose);
}
