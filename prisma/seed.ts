import "dotenv/config";
import { PrismaClient, SourceType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const categories = [
  { name: "Μόδα", slug: "fashion", description: "Δωροκάρτες για ρούχα, παπούτσια και fashion brands.", icon: "shirt", sortOrder: 10 },
  { name: "Ομορφιά", slug: "beauty", description: "Καλλυντικά, skincare, αρώματα και προϊόντα ομορφιάς.", icon: "sparkles", sortOrder: 20 },
  { name: "Τεχνολογία", slug: "technology", description: "Τεχνολογία, ηλεκτρονικά, gadgets και υπολογιστές.", icon: "laptop", sortOrder: 30 },
  { name: "Gaming", slug: "gaming", description: "Gaming gift cards, παιχνίδια και ψηφιακό περιεχόμενο.", icon: "gamepad-2", sortOrder: 40 },
  { name: "Streaming & Digital", slug: "streaming-digital", description: "Streaming υπηρεσίες, digital credits και online subscriptions.", icon: "play", sortOrder: 50 },
  { name: "Σπίτι & Διακόσμηση", slug: "home", description: "Έπιπλα, διακόσμηση, οικιακός εξοπλισμός και είδη σπιτιού.", icon: "house", sortOrder: 60 },
  { name: "Αθλητισμός", slug: "sports", description: "Αθλητικά είδη, παπούτσια, fitness και outdoor.", icon: "dumbbell", sortOrder: 70 },
  { name: "Παιδί & Μωρό", slug: "kids-baby", description: "Δωροκάρτες για παιδιά, βρέφη και νέους γονείς.", icon: "baby", sortOrder: 80 },
  { name: "Βιβλία", slug: "books", description: "Βιβλία, βιβλιοπωλεία και εκπαιδευτικά είδη.", icon: "book-open", sortOrder: 90 },
  { name: "Φαγητό & Delivery", slug: "food-delivery", description: "Delivery, food marketplaces και online παραγγελίες.", icon: "utensils", sortOrder: 100 },
  { name: "Εστιατόρια", slug: "restaurants", description: "Εστιατόρια, καφέ και γαστρονομικές εμπειρίες.", icon: "chef-hat", sortOrder: 110 },
  { name: "Ταξίδια", slug: "travel", description: "Αεροπορικές, ταξιδιωτικές υπηρεσίες και ταξιδιωτικά δώρα.", icon: "plane", sortOrder: 120 },
  { name: "Ξενοδοχεία", slug: "hotels", description: "Διαμονές, resorts και hotel gift vouchers.", icon: "hotel", sortOrder: 130 },
  { name: "Εμπειρίες", slug: "experiences", description: "Δραστηριότητες, excursions και μοναδικές εμπειρίες.", icon: "ticket", sortOrder: 140 },
  { name: "Spa & Wellness", slug: "spa-wellness", description: "Spa, massage, wellness και υπηρεσίες χαλάρωσης.", icon: "flower-2", sortOrder: 150 },
  { name: "Κοσμήματα & Ρολόγια", slug: "jewelry-watches", description: "Κοσμήματα, watches και accessories.", icon: "gem", sortOrder: 160 },
  { name: "Φαρμακείο & Περιποίηση", slug: "pharmacy", description: "Φαρμακεία, dermocosmetics και προϊόντα προσωπικής φροντίδας.", icon: "heart-pulse", sortOrder: 170 },
  { name: "Πολυκαταστήματα", slug: "department-stores", description: "Μεγάλα πολυκαταστήματα και multi-category retailers.", icon: "store", sortOrder: 180 },
  { name: "Marketplaces", slug: "marketplaces", description: "Online marketplaces και πολυκαταστήματα e-commerce.", icon: "shopping-bag", sortOrder: 190 },
  { name: "Εταιρικά Δώρα", slug: "corporate-gifts", description: "Gift cards και vouchers για επιχειρήσεις και προσωπικό.", icon: "briefcase-business", sortOrder: 200 },
];

const occasions = [
  { name: "Γενέθλια", slug: "birthday", icon: "cake", sortOrder: 10 },
  { name: "Ονομαστική Εορτή", slug: "name-day", icon: "gift", sortOrder: 20 },
  { name: "Γάμος", slug: "wedding", icon: "heart", sortOrder: 30 },
  { name: "Επέτειος", slug: "anniversary", icon: "heart-handshake", sortOrder: 40 },
  { name: "Νέο Μωρό", slug: "new-baby", icon: "baby", sortOrder: 50 },
  { name: "Βάφτιση", slug: "christening", icon: "sparkles", sortOrder: 60 },
  { name: "Αποφοίτηση", slug: "graduation", icon: "graduation-cap", sortOrder: 70 },
  { name: "Χριστούγεννα", slug: "christmas", icon: "tree-pine", sortOrder: 80 },
  { name: "Πάσχα", slug: "easter", icon: "egg", sortOrder: 90 },
  { name: "Valentine's Day", slug: "valentines", icon: "heart", sortOrder: 100 },
  { name: "Γιορτή της Μητέρας", slug: "mothers-day", icon: "flower", sortOrder: 110 },
  { name: "Γιορτή του Πατέρα", slug: "fathers-day", icon: "badge", sortOrder: 120 },
  { name: "Ευχαριστώ", slug: "thank-you", icon: "hand-heart", sortOrder: 130 },
  { name: "Συνταξιοδότηση", slug: "retirement", icon: "party-popper", sortOrder: 140 },
  { name: "Για Εκείνη", slug: "for-her", icon: "venus", sortOrder: 150 },
  { name: "Για Εκείνον", slug: "for-him", icon: "mars", sortOrder: 160 },
  { name: "Για Παιδιά", slug: "for-kids", icon: "teddy-bear", sortOrder: 170 },
  { name: "Εταιρικό Δώρο", slug: "corporate", icon: "briefcase-business", sortOrder: 180 },
  { name: "Χωρίς Αφορμή", slug: "just-because", icon: "smile", sortOrder: 190 },
];

const importSources = [
  { name: "BestPrice", sourceType: SourceType.AGGREGATOR, baseUrl: "https://www.bestprice.gr" },
  { name: "Official Websites", sourceType: SourceType.OFFICIAL, baseUrl: null },
  { name: "Google Discovery", sourceType: SourceType.SEARCH_ENGINE, baseUrl: "https://www.google.com" },
  { name: "Wolt", sourceType: SourceType.MARKETPLACE, baseUrl: "https://wolt.com" },
  { name: "Baladeur", sourceType: SourceType.MARKETPLACE, baseUrl: "https://www.baladeur.gr" },
  { name: "Manual Research", sourceType: SourceType.MANUAL, baseUrl: null },
];

async function main() {
  console.log("Starting Dorokartes seed...");

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  console.log(`Seeded ${categories.length} categories.`);

  for (const occasion of occasions) {
    await prisma.occasion.upsert({
      where: { slug: occasion.slug },
      update: occasion,
      create: occasion,
    });
  }
  console.log(`Seeded ${occasions.length} occasions.`);

  for (const source of importSources) {
    await prisma.importSource.upsert({
      where: { name: source.name },
      update: source,
      create: source,
    });
  }
  console.log(`Seeded ${importSources.length} import sources.`);

  console.log("Dorokartes seed completed.");
}

main()
  .catch((error) => {
    console.error("Dorokartes seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
