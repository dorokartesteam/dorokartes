import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const CANDIDATES = [
  { label: "Chania Culture", ids: ["cmtb77tnt004ndkiyw1tey12d", "cmtb7r23t0004u8iyh8gmkixy"] },
  { label: "Kois Optics", ids: ["cmta1in6000deq8iyzrf26jcw", "cmtb7r3ne000bu8iyhr8e822r"] },
  { label: "Laura Ashley", ids: ["cmta1ldih00owq8iybi4h3dxo", "cmta421t70002t8iywrh9oyoy"] },
  { label: "LEGO / Storegreece", ids: ["cmtb7r1ep0001u8iyqwzxbtq4", "cmta1jjkg00heq8iyq7zpj3cf"] },
  { label: "SportCafe", ids: ["cmta1gxm7007gq8iycl9elv83", "cmta4yfe1000zsciy02ejjqqf"] },
] as const;

type FKRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

function qident(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function fmt(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  console.log("Dorokartes Duplicate Gift Card Inspector v1.1");
  console.log("=============================================");
  console.log("READ ONLY — no database writes and no deletes.");
  console.log("");

  const fkRows = await prisma.$queryRawUnsafe<FKRow[]>(`
    SELECT DISTINCT
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'GiftCard'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_schema, tc.table_name, kcu.column_name
  `);

  console.log(`Foreign-key relations pointing to GiftCard.id: ${fkRows.length}`);
  for (const fk of fkRows) {
    console.log(`  ${fk.table_schema}.${fk.table_name}.${fk.column_name}`);
  }
  console.log("");

  for (const group of CANDIDATES) {
    console.log(`### ${group.label}`);

    const cards = await prisma.giftCard.findMany({
      where: { id: { in: [...group.ids] } },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
            slug: true,
            websiteUrl: true,
          },
        },
      },
    });

    for (const id of group.ids) {
      const card: any = cards.find((c: any) => c.id === id);

      if (!card) {
        console.log(`MISSING CARD ${id}`);
        console.log("");
        continue;
      }

      console.log(`CARD ${card.id}`);
      console.log(`  merchant       : ${card.merchant?.name ?? "-"} (${card.merchantId})`);
      console.log(`  merchant slug  : ${card.merchant?.slug ?? "-"}`);
      console.log(`  merchant site  : ${card.merchant?.websiteUrl ?? "-"}`);
      console.log(`  title          : ${fmt(card.title)}`);
      console.log(`  slug           : ${fmt(card.slug)}`);
      console.log(`  officialUrl    : ${fmt(card.officialUrl)}`);
      console.log(`  status         : ${fmt(card.status)}`);
      console.log(`  verification   : ${fmt(card.verificationStatus)}`);
      console.log(`  lastVerifiedAt : ${fmt(card.lastVerifiedAt)}`);
      console.log(`  createdAt      : ${fmt(card.createdAt)}`);
      console.log(`  updatedAt      : ${fmt(card.updatedAt)}`);
      console.log(`  seoTitle       : ${fmt(card.seoTitle)}`);
      console.log(`  metaDescription: ${fmt(card.metaDescription)}`);

      let relationTotal = 0;

      for (const fk of fkRows) {
        const sql = `
          SELECT COUNT(*)::int AS count
          FROM ${qident(fk.table_schema)}.${qident(fk.table_name)}
          WHERE ${qident(fk.column_name)} = $1
        `;

        const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(sql, card.id);
        const count = Number(rows?.[0]?.count ?? 0);
        relationTotal += count;

        if (count > 0) {
          console.log(
            `  relation       : ${fk.table_schema}.${fk.table_name}.${fk.column_name} = ${count}`
          );
        }
      }

      console.log(`  relation total : ${relationTotal}`);
      console.log("");
    }
  }

  console.log("INSPECTION COMPLETE. Database unchanged.");
  console.log("No automatic canonical choice was made.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
