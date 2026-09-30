import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const candidates = await prisma.merchantLocation.findMany({
    where: {
      active: true,
      verificationStatus: "VERIFIED",
      city: "Αττική",
      administrativeArea: "Ηλιούπολη",
      merchant: {
        name: {
          contains: "Boudoir",
          mode: "insensitive",
        },
      },
    },
    select: {
      id: true,
      merchant: { select: { name: true } },
      city: true,
      administrativeArea: true,
      area: true,
      addressLine: true,
      sourceUrl: true,
    },
  });

  console.log("Candidates:", candidates);

  if (candidates.length !== 1) {
    throw new Error(
      `STOP: expected exactly 1 Boudoir location, found ${candidates.length}. Database unchanged.`
    );
  }

  const row = candidates[0];

  await prisma.merchantLocation.update({
    where: { id: row.id },
    data: {
      city: "Ηλιούπολη",
      administrativeArea: "Αττική",
    },
  });

  console.log("FIXED:", {
    id: row.id,
    merchant: row.merchant.name,
    city: "Ηλιούπολη",
    administrativeArea: "Αττική",
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
