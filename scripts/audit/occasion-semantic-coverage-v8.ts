import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      merchant: { status: "ACTIVE" },
      occasions: { none: {} },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      merchant: {
        select: {
          name: true,
        },
      },
      categories: {
        orderBy: [
          { primary: "desc" },
          { category: { slug: "asc" } },
        ],
        select: {
          primary: true,
          category: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const stats = new Map<
    string,
    {
      name: string;
      cards: number;
      primary: number;
      examples: string[];
    }
  >();

  const noCategory: Array<{
    id: string;
    merchant: string;
    title: string;
  }> = [];

  for (const card of cards) {
    if (!card.categories.length) {
      noCategory.push({
        id: card.id,
        merchant: card.merchant.name,
        title: card.title,
      });

      continue;
    }

    const primary =
      card.categories.find((item) => item.primary) ??
      card.categories[0];

    const slug = primary.category.slug;

    const current = stats.get(slug) ?? {
      name: primary.category.name,
      cards: 0,
      primary: 0,
      examples: [],
    };

    current.cards++;

    if (primary.primary) {
      current.primary++;
    }

    if (current.examples.length < 5) {
      current.examples.push(
        `${card.merchant.name} — ${card.title}`,
      );
    }

    stats.set(slug, current);
  }

  const result = [...stats.entries()]
    .map(([slug, value]) => ({
      slug,
      name: value.name,
      cardsWithoutOccasion: value.cards,
      primaryRelations: value.primary,
      examples: value.examples.join(" | "),
    }))
    .sort(
      (a, b) =>
        b.cardsWithoutOccasion - a.cardsWithoutOccasion ||
        a.slug.localeCompare(b.slug),
    );

  console.log("");
  console.log("=== CARDS WITHOUT OCCASION BY PRIMARY CATEGORY ===");
  console.table(result);

  console.log("");
  console.log(`ACTIVE CARDS WITHOUT OCCASION: ${cards.length}`);
  console.log(`PRIMARY CATEGORIES REPRESENTED: ${result.length}`);
  console.log(`CARDS WITHOUT CATEGORY: ${noCategory.length}`);

  if (noCategory.length) {
    console.log("");
    console.log("=== NO CATEGORY ===");
    console.table(noCategory.slice(0, 30));
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
