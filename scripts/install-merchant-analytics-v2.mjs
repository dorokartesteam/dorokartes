import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const merchantLayoutPath = path.join(root, "app", "merchant", "layout.tsx");

function mustRead(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

let schema = mustRead(schemaPath);

if (!schema.includes("model CatalogViewEvent {")) {
  const merchantNeedle = "  clicks      OutboundClick[]";
  const giftNeedle = "  clicks      OutboundClick[]";
  const firstClick = schema.indexOf(merchantNeedle);
  if (firstClick < 0) throw new Error("Could not locate Merchant.clicks in Prisma schema.");
  const firstEnd = firstClick + merchantNeedle.length;
  schema = schema.slice(0, firstEnd) + "\n  catalogViews CatalogViewEvent[]" + schema.slice(firstEnd);

  const secondClick = schema.indexOf(giftNeedle, firstEnd + 30);
  if (secondClick < 0) throw new Error("Could not locate GiftCard.clicks in Prisma schema.");
  const secondEnd = secondClick + giftNeedle.length;
  schema = schema.slice(0, secondEnd) + "\n  catalogViews CatalogViewEvent[]" + schema.slice(secondEnd);

  const insertBefore = "model ImportSource {";
  const modelIndex = schema.indexOf(insertBefore);
  if (modelIndex < 0) throw new Error("Could not locate ImportSource model insertion point.");

  const model = `model CatalogViewEvent {\n  id String @id @default(cuid())\n\n  merchantId String\n  merchant   Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)\n\n  giftCardId String?\n  giftCard   GiftCard? @relation(fields: [giftCardId], references: [id], onDelete: Cascade)\n\n  sessionId  String\n  pageType   String\n  sourcePath String\n  viewedAt   DateTime @default(now())\n\n  @@index([merchantId, viewedAt])\n  @@index([giftCardId, viewedAt])\n  @@index([sessionId, viewedAt])\n  @@index([pageType, viewedAt])\n}\n\n`;

  schema = schema.slice(0, modelIndex) + model + schema.slice(modelIndex);
  fs.writeFileSync(schemaPath, schema, "utf8");
  console.log("PASS: Prisma schema patched with CatalogViewEvent.");
} else {
  console.log("SKIP: CatalogViewEvent already exists in Prisma schema.");
}

let layout = mustRead(merchantLayoutPath);
const importLine = 'import "./merchant-v4-2-analytics.css";';
if (!layout.includes(importLine)) {
  const anchor = 'import "./merchant-v4-1.css";';
  if (!layout.includes(anchor)) throw new Error("Could not locate merchant-v4-1.css import in merchant layout.");
  layout = layout.replace(anchor, `${anchor}\n${importLine}`);
  fs.writeFileSync(merchantLayoutPath, layout, "utf8");
  console.log("PASS: Merchant Analytics V2 CSS import added.");
} else {
  console.log("SKIP: Merchant Analytics V2 CSS import already present.");
}

console.log("PASS: Merchant Analytics V2 installer completed.");
