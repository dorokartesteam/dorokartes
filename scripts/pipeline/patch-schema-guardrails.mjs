import fs from "node:fs";

const path = "prisma/schema.prisma";
let s = fs.readFileSync(path, "utf8");

if (!s.includes("enum ReviewFlagType")) {
  const enumAnchor = `enum VerificationPageRole {
  CANONICAL_PURCHASE
  CHECKOUT
  TERMS
  PROMOTION
  CONTENT
  GIFT_GUIDE
  GAMING_VOUCHER
  GENERIC
  UNKNOWN
}`;
  const addition = `${enumAnchor}

enum ReviewFlagType {
  ROLE_CHANGED
  CANONICAL_URL_CHANGED
  FETCH_UNSTABLE
  CONTENT_CHANGED
}

enum ReviewFlagStatus {
  OPEN
  RESOLVED
  DISMISSED
}`;
  if (!s.includes(enumAnchor)) {
    console.error("Could not find VerificationPageRole enum.");
    process.exit(1);
  }
  s = s.replace(enumAnchor, addition);
}

if (!s.includes("model VerificationFetchObservation")) {
  const marker = "/**\n * |--------------------------------------------------------------------------\n * | VERIFICATION HISTORY";
  const models = `model VerificationFetchObservation {
  id String @id @default(cuid())

  discoveryItemId String
  discoveryItem DiscoveryItem @relation(fields: [discoveryItemId], references: [id], onDelete: Cascade)

  preflightKind String
  contentHash String?
  httpStatus Int?
  fetchTier String?
  observedAt DateTime @default(now())

  @@index([discoveryItemId, observedAt])
  @@index([preflightKind])
}

model ProductionReviewFlag {
  id String @id @default(cuid())

  giftCardId String
  giftCard GiftCard @relation(fields: [giftCardId], references: [id], onDelete: Cascade)

  type ReviewFlagType
  status ReviewFlagStatus @default(OPEN)

  oldValue String?
  newValue String?
  reason String

  createdAt DateTime @default(now())
  resolvedAt DateTime?

  @@index([giftCardId, status])
  @@index([type, status])
}

`;
  if (!s.includes(marker)) {
    console.error("Could not find VERIFICATION HISTORY marker.");
    process.exit(1);
  }
  s = s.replace(marker, models + marker);
}

if (!s.includes("fetchObservations VerificationFetchObservation[]")) {
  const m = /model DiscoveryItem \{([\s\S]*?)\n\}/m;
  const match = s.match(m);
  if (!match) {
    console.error("Could not find DiscoveryItem model.");
    process.exit(1);
  }
  const block = match[0].replace(/\n\}$/, "\n\n  fetchObservations VerificationFetchObservation[]\n}");
  s = s.replace(match[0], block);
}

if (!s.includes("reviewFlags ProductionReviewFlag[]")) {
  const m = /model GiftCard \{([\s\S]*?)\n\}/m;
  const match = s.match(m);
  if (!match) {
    console.error("Could not find GiftCard model.");
    process.exit(1);
  }
  const block = match[0].replace(/\n\}$/, "\n\n  reviewFlags ProductionReviewFlag[]\n}");
  s = s.replace(match[0], block);
}

fs.writeFileSync(path, s);
console.log("schema.prisma patched with verification guardrails.");
