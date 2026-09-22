import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const CANDIDATES = [
  { label: "Chania Culture", ids: ["cmtb77tnt004ndkiyw1tey12d", "cmtb7r23t0004u8iyh8gmkixy"] },
  { label: "Kois Optics", ids: ["cmta1in6000deq8iyzrf26jcw", "cmtb7r3ne000bu8iyhr8e822r"] },
  { label: "Laura Ashley", ids: ["cmta1ldih00owq8iybi4h3dxo", "cmta421t70002t8iywrh9oyoy"] },
  { label: "LEGO / Storegreece", ids: ["cmtb7r1ep0001u8iyqwzxbtq4", "cmta1jjkg00heq8iyq7zpj3cf"] },
  { label: "SportCafe", ids: ["cmta1gxm7007gq8iycl9elv83", "cmta4yfe1000zsciy02ejjqqf"] },
] as const;

function fmt(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function main() {
  const { prisma } = await import("../../lib/prisma");
  const clientPkg = await import("@prisma/client");
  const PrismaAny: any = (clientPkg as any).Prisma;

  console.log("Dorokartes Duplicate Gift Card Inspector v1");
  console.log("===========================================");
  console.log("READ ONLY — no database writes and no deletes.");
  console.log("");

  const relationFields =
    PrismaAny?.dmmf?.datamodel?.models
      ?.find((m: any) => m.name === "GiftCard")
      ?.fields?.filter((f: any) => f.kind === "object") ?? [];

  console.log("GiftCard relation fields detected from Prisma DMMF:");
  if (!relationFields.length) {
    console.log("  (No DMMF relation metadata exposed by this Prisma client.)");
  } else {
    for (const f of relationFields) {
      console.log(
        `  ${f.name} -> ${f.type} | list=${!!f.isList} | relation=${f.relationName ?? "-"}`
      );
    }
  }
  console.log("");

  for (const group of CANDIDATES) {
    console.log(`### ${group.label}`);
    const cards = await prisma.giftCard.findMany({
      where: { id: { in: [...group.ids] } },
      include: { merchant: true },
    });

    for (const id of group.ids) {
      const card: any = cards.find((c: any) => c.id === id);
      if (!card) {
        console.log(`MISSING CARD ${id}`);
        continue;
      }

      console.log(`CARD ${card.id}`);
      console.log(`  merchant       : ${card.merchant?.name ?? "-"} (${card.merchantId})`);
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

      // Best-effort relation counts using Prisma relation metadata.
      for (const rel of relationFields) {
        if (rel.name === "merchant") continue;

        const delegateName =
          rel.type.length > 0
            ? rel.type.charAt(0).toLowerCase() + rel.type.slice(1)
            : "";

        const delegate: any = (prisma as any)[delegateName];
        if (!delegate?.count) continue;

        const targetModel =
          PrismaAny?.dmmf?.datamodel?.models?.find((m: any) => m.name === rel.type);
        if (!targetModel) continue;

        const backRefs = targetModel.fields.filter(
          (f: any) => f.kind === "object" && f.type === "GiftCard"
        );

        let counted = false;
        for (const back of backRefs) {
          const scalarFk =
            targetModel.fields.find(
              (f: any) =>
                f.kind === "scalar" &&
                Array.isArray(back.relationFromFields) &&
                back.relationFromFields.includes(f.name)
            ) ??
            targetModel.fields.find(
              (f: any) =>
                f.kind === "scalar" &&
                ["giftCardId", "cardId"].includes(f.name)
            );

          if (!scalarFk) continue;

          try {
            const count = await delegate.count({
              where: { [scalarFk.name]: card.id },
            });
            console.log(`  relation ${rel.name}/${rel.type}: ${count} row(s) via ${scalarFk.name}`);
            counted = true;
            break;
          } catch {
            // Keep inspector resilient across schema variations.
          }
        }

        if (!counted && rel.isList) {
          console.log(`  relation ${rel.name}/${rel.type}: count not auto-resolved`);
        }
      }

      console.log("");
    }
  }

  console.log("INSPECTION COMPLETE. Database unchanged.");
  console.log("Use this output to choose canonical cards and build one guarded merge/delete batch.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("");
  console.error("FAILED:", error);
  process.exitCode = 1;
});
