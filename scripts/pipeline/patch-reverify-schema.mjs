import fs from "node:fs";

const path = "prisma/schema.prisma";
let s = fs.readFileSync(path, "utf8");

if (!s.includes("model ProductionVerificationSnapshot")) {
  const marker = "/**\n * |--------------------------------------------------------------------------\n * | VERIFICATION HISTORY";

  const model = `model ProductionVerificationSnapshot {
  id String @id @default(cuid())

  giftCardId String
  giftCard GiftCard @relation(fields: [giftCardId], references: [id], onDelete: Cascade)

  officialUrl String
  contentHash String?
  pageRole VerificationPageRole?
  httpStatus Int?
  fetchTier String?
  preflightKind String
  source String
  observedAt DateTime @default(now())

  @@index([giftCardId, observedAt])
  @@index([officialUrl])
}

`;

  if (!s.includes(marker)) {
    console.error("Could not find VERIFICATION HISTORY marker.");
    process.exit(1);
  }

  s = s.replace(marker, model + marker);
}

if (!s.includes("productionVerificationSnapshots ProductionVerificationSnapshot[]")) {
  const m = /model GiftCard \{([\s\S]*?)\n\}/m;
  const match = s.match(m);

  if (!match) {
    console.error("Could not find GiftCard model.");
    process.exit(1);
  }

  const block = match[0].replace(
    /\n\}$/,
    "\n\n  productionVerificationSnapshots ProductionVerificationSnapshot[]\n}",
  );

  s = s.replace(match[0], block);
}

fs.writeFileSync(path, s);
console.log("schema.prisma patched with ProductionVerificationSnapshot.");
