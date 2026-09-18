import fs from "node:fs";

const path = "prisma/schema.prisma";
let s = fs.readFileSync(path, "utf8");

if (!s.includes("enum DiscoveryScanStatus")) {
  const marker = "enum DiscoveryStatus {";
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error("DiscoveryStatus enum not found");

  const block = `enum DiscoveryScanStatus {
  PENDING
  SCANNED_NO_CANDIDATE
  CANDIDATES_FOUND
  BLOCKED
  ERROR
}

`;
  s = s.slice(0, idx) + block + s.slice(idx);
}

if (!s.includes("model MerchantDiscoveryScan")) {
  s += `

model MerchantDiscoveryScan {
  id String @id @default(cuid())

  merchantDomain String @unique
  merchantName String
  websiteUrl String
  category String?

  status DiscoveryScanStatus @default(PENDING)
  candidateCount Int @default(0)
  requestCount Int @default(0)
  lastError String?
  lastScannedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, lastScannedAt])
}
`;
}

fs.writeFileSync(path, s);
console.log("schema.prisma patched with durable discovery scan state.");
