import { prisma } from "@/lib/prisma";
const db = prisma as any;

export async function getMediaCenterData() {
  const [cards, mediaCount] = await Promise.all([
    db.giftCard.findMany({
      take: 2000,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        verificationStatus: true,
        merchant: { select: { name: true } },
        mediaAssets: {
          take: 8,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            url: true,
            altText: true,
            createdAt: true,
          },
        },
      },
    }),
    db.mediaAsset.count(),
  ]);

  const rows = cards.map((card: any) => ({
    ...card,
    mediaCount: card.mediaAssets?.length ?? 0,
    hasMedia: (card.mediaAssets?.length ?? 0) > 0,
    hasAlt: (card.mediaAssets ?? []).some((m: any) => !!m.altText),
  }));

  return {
    rows,
    mediaCount,
    cardsWithMedia: rows.filter((x: any) => x.hasMedia).length,
    cardsMissingMedia: rows.filter((x: any) => !x.hasMedia).length,
    cardsMissingAlt: rows.filter((x: any) => x.hasMedia && !x.hasAlt).length,
  };
}
