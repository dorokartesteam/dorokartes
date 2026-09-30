import { prisma } from "@/lib/prisma";

const REGION_ALIASES: Record<string, string> = {
  "ΓΑΛΑΤΣΙ": "Γαλάτσι",
  "Aigaleo": "Αιγάλεω",
  "Dafni": "Δάφνη",
  "Lamia": "Λαμία",
  "Metamorfosi": "Μεταμόρφωση",
  "Porto Cheli": "Πόρτο Χέλι",
  "PORTOHELI": "Πόρτο Χέλι",
  "Π. Φάληρο": "Παλαιό Φάληρο",
  "Gouves": "Γούβες",
  "Afrato": "Αφράτο",
};

export function canonicalRegionLabel(value?: string | null) {
  const v = (value || "").trim();
  if (!v) return null;
  return REGION_ALIASES[v] || v;
}

export function regionSlug(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[^a-z0-9\u0370-\u03ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function regionLabelFromLocation(location: {
  area?: string | null;
  city?: string | null;
  administrativeArea?: string | null;
}) {
  const raw =
    (location.area || "").trim() ||
    (location.city || "").trim() ||
    (location.administrativeArea || "").trim();

  return raw ? canonicalRegionLabel(raw) : null;
}

export async function getRegionOptions() {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      merchant: {
        locations: {
          some: {
            active: true,
            verificationStatus: "VERIFIED",
          },
        },
      },
    },
    select: {
      id: true,
      merchant: {
        select: {
          locations: {
            where: {
              active: true,
              verificationStatus: "VERIFIED",
            },
            select: {
              area: true,
              city: true,
              administrativeArea: true,
            },
          },
        },
      },
    },
  });

  const bySlug = new Map<string, { label: string; cardIds: Set<string> }>();

  for (const card of cards) {
    for (const location of card.merchant.locations) {
      const label = regionLabelFromLocation(location);
      if (!label) continue;

      const slug = regionSlug(label);
      if (!bySlug.has(slug)) {
        bySlug.set(slug, { label, cardIds: new Set<string>() });
      }
      bySlug.get(slug)!.cardIds.add(card.id);
    }
  }

  return [...bySlug.entries()]
    .map(([slug, x]) => ({
      slug,
      label: x.label,
      count: x.cardIds.size,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "el"));
}

export async function getGiftCardIdsForRegion(slug: string) {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      merchant: {
        locations: {
          some: {
            active: true,
            verificationStatus: "VERIFIED",
          },
        },
      },
    },
    select: {
      id: true,
      merchant: {
        select: {
          locations: {
            where: {
              active: true,
              verificationStatus: "VERIFIED",
            },
            select: {
              area: true,
              city: true,
              administrativeArea: true,
            },
          },
        },
      },
    },
  });

  return cards
    .filter((card) =>
      card.merchant.locations.some((location) => {
        const label = regionLabelFromLocation(location);
        return label ? regionSlug(label) === slug : false;
      })
    )
    .map((card) => card.id);
}

export async function getRegionCardCount(slug: string) {
  return (await getGiftCardIdsForRegion(slug)).length;
}
