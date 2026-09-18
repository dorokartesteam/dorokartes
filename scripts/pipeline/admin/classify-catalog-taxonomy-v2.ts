import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";

const VERSION = "catalog-taxonomy-v2";
const REPORT_DIR = path.join(process.cwd(), "reports");
const EVIDENCE_JSON = path.join(REPORT_DIR, "taxonomy-evidence-v2.json");
const PLAN_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v2-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "catalog-taxonomy-v2-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v2-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v2-post-audit.json");
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((argument) => argument.startsWith("--plan-id="))?.split("=")[1];

const CATEGORY_DEFINITIONS = [
  { name: "Μόδα", slug: "fashion", description: "Ρούχα, παπούτσια, τσάντες και fashion brands.", icon: "shirt", sortOrder: 10 },
  { name: "Ομορφιά", slug: "beauty", description: "Καλλυντικά, skincare, αρώματα, μαλλιά και υπηρεσίες ομορφιάς.", icon: "sparkles", sortOrder: 20 },
  { name: "Τεχνολογία", slug: "technology", description: "Ηλεκτρονικά, υπολογιστές, κινητά, gadgets και τεχνολογικός εξοπλισμός.", icon: "laptop", sortOrder: 30 },
  { name: "Gaming", slug: "gaming", description: "Video games, επιτραπέζια, συλλεκτικά και gaming περιεχόμενο.", icon: "gamepad-2", sortOrder: 40 },
  { name: "Streaming & Digital", slug: "streaming-digital", description: "Streaming υπηρεσίες, digital credits και online subscriptions.", icon: "play", sortOrder: 50 },
  { name: "Σπίτι & Διακόσμηση", slug: "home", description: "Έπιπλα, φωτισμός, διακόσμηση, κήπος, εργαλεία και οικιακός εξοπλισμός.", icon: "house", sortOrder: 60 },
  { name: "Αθλητισμός", slug: "sports", description: "Αθλητικά είδη, fitness, outdoor και θαλάσσια σπορ.", icon: "dumbbell", sortOrder: 70 },
  { name: "Παιδί & Μωρό", slug: "kids-baby", description: "Παιδικά και βρεφικά είδη, παιχνίδια και προϊόντα νέων γονέων.", icon: "baby", sortOrder: 80 },
  { name: "Βιβλία", slug: "books", description: "Βιβλία, βιβλιοπωλεία και εκδόσεις.", icon: "book-open", sortOrder: 90 },
  { name: "Τέχνη & Χειροτεχνία", slug: "arts-crafts", description: "Εικαστικά, χειροτεχνία, υλικά δημιουργίας, πλέξιμο και handmade αντικείμενα.", icon: "palette", sortOrder: 95 },
  { name: "Μουσική & Όργανα", slug: "music", description: "Μουσικά όργανα, ήχος, DJ και μουσικός εξοπλισμός.", icon: "music", sortOrder: 98 },
  { name: "Φαγητό & Ποτό", slug: "food-delivery", description: "Τρόφιμα, ποτά, κρασί, delicatessen, supermarkets και delivery.", icon: "utensils", sortOrder: 100 },
  { name: "Εστιατόρια", slug: "restaurants", description: "Εστιατόρια, καφέ, bars και γαστρονομικές εμπειρίες.", icon: "chef-hat", sortOrder: 110 },
  { name: "Ταξίδια", slug: "travel", description: "Αεροπορικές, ταξιδιωτικές υπηρεσίες, μεταφορές και ταξιδιωτικά δώρα.", icon: "plane", sortOrder: 120 },
  { name: "Ξενοδοχεία", slug: "hotels", description: "Διαμονές, resorts, villas και hotel gift vouchers.", icon: "hotel", sortOrder: 130 },
  { name: "Εμπειρίες", slug: "experiences", description: "Δραστηριότητες, πολιτισμός, events, excursions και μοναδικές εμπειρίες.", icon: "ticket", sortOrder: 140 },
  { name: "Εκπαίδευση & Μαθήματα", slug: "education", description: "Μαθήματα, σεμινάρια, σχολές και εκπαιδευτικές υπηρεσίες.", icon: "graduation-cap", sortOrder: 145 },
  { name: "Spa & Wellness", slug: "spa-wellness", description: "Spa, massage, yoga, wellness και υπηρεσίες χαλάρωσης.", icon: "flower-2", sortOrder: 150 },
  { name: "Κοσμήματα & Ρολόγια", slug: "jewelry-watches", description: "Κοσμήματα, ρολόγια, πολύτιμοι λίθοι και αξεσουάρ.", icon: "gem", sortOrder: 160 },
  { name: "Φαρμακείο & Περιποίηση", slug: "pharmacy", description: "Φαρμακεία, dermocosmetics, συμπληρώματα και προϊόντα προσωπικής φροντίδας.", icon: "heart-pulse", sortOrder: 170 },
  { name: "Υγεία & Ιατρικές Υπηρεσίες", slug: "health-medical", description: "Κλινικές, διαγνωστικές, οδοντιατρικές και άλλες υπηρεσίες υγείας.", icon: "stethoscope", sortOrder: 175 },
  { name: "Κατοικίδια", slug: "pets", description: "Pet shops, κτηνιατρικές υπηρεσίες, τροφές και φροντίδα κατοικιδίων.", icon: "paw-print", sortOrder: 178 },
  { name: "Αυτοκίνητο & Μοτοσυκλέτα", slug: "automotive", description: "Αυτοκίνητο, μοτοσυκλέτα, ανταλλακτικά, εξοπλισμός και υπηρεσίες φροντίδας.", icon: "car-front", sortOrder: 180 },
  { name: "Καπνικά & Άτμισμα", slug: "tobacco-vaping", description: "Πούρα, καπνικά είδη, προϊόντα νικοτίνης και εξοπλισμός ατμίσματος.", icon: "cigarette", sortOrder: 185 },
  { name: "Πολυκαταστήματα", slug: "department-stores", description: "Μεγάλα πολυκαταστήματα και multi-category retailers.", icon: "store", sortOrder: 190 },
  { name: "Marketplaces", slug: "marketplaces", description: "Online marketplaces, deal platforms και multi-merchant καταστήματα.", icon: "shopping-bag", sortOrder: 200 },
  { name: "Δώρα & Concept Stores", slug: "gifts-concept-stores", description: "Gift shops, concept stores και επιλεγμένα αντικείμενα δώρου.", icon: "gift", sortOrder: 205 },
  { name: "Εταιρικά Δώρα", slug: "corporate-gifts", description: "Gift cards και vouchers για επιχειρήσεις και προσωπικό.", icon: "briefcase-business", sortOrder: 210 },
] as const;

type CategorySlug = (typeof CATEGORY_DEFINITIONS)[number]["slug"];
type EvidencePage = {
  ok: boolean;
  title: string | null;
  description: string | null;
  headings: string[];
  navigation: string[];
  excerpt: string | null;
  finalUrl: string | null;
};
type EvidenceRow = {
  giftCardId: string;
  merchantName: string;
  giftCardTitle: string;
  shortDescription: string | null;
  officialUrl: string | null;
  websiteUrl: string | null;
  officialEvidence: EvidencePage | null;
  websiteEvidence: EvidencePage | null;
};

type Rule = {
  category: CategorySlug;
  label: string;
  pattern: RegExp;
  weight: number;
};

const RULES: Rule[] = [
  { category: "pets", label: "pet-industry", pattern: /\b(pet ?shop|pet world|pet food|grooming|groomer|κτηνιατρ|κατοικιδ|σκυλ|γατ(?:α|ες|ων)|τροφες ζωων)\b/i, weight: 126 },
  { category: "automotive", label: "automotive", pattern: /\b(auto ?motive|car care|car wash|motorcycle|motorsport|moto |motorparts|ανταλλακτικ|αυτοκινητ|μοτοσυκλετ|κρανη|ελαστικα)\b/i, weight: 124 },
  { category: "health-medical", label: "medical-service", pattern: /\b(medical|clinic|hospital|dental|dentist|diagnostic|mammograph|φυσικοθεραπ|ιατρικ|κλινικ|νοσοκομ|οδοντιατρ|μαστογραφ)\b/i, weight: 124 },
  { category: "music", label: "music-retail", pattern: /\b(musical instruments?|music store|drums?|guitars?|pianos?|dj equipment|ηχητικ|μουσικ(?:α|ων)? οργαν|κιθαρε?ς|τυμπαν|πιαν)\b/i, weight: 122 },
  { category: "arts-crafts", label: "arts-crafts", pattern: /\b(art supplies|craft supplies|arts? & crafts?|painting supplies|handmade textiles|yarns?|knitting|sewing|ειδη ζωγραφικ|εικαστικ|χειροτεχν|αγιογραφ|πλεκτικ|νηματα|ραπτικ)\b/i, weight: 121 },
  { category: "education", label: "education", pattern: /\b(education(?:al)?|language courses?|online courses?|seminars?|lessons?|school|μαθηματα|σεμιναρι|εκπαιδευ|σχολη|φροντιστηρ)\b/i, weight: 120 },
  { category: "jewelry-watches", label: "jewelry", pattern: /\b(jewellery|jewelry|jeweller|watches|goldsmith|gems?|κοσμημ|κοσμηματοπωλ|ρολογια|χρυσαφ)\b/i, weight: 119 },
  { category: "kids-baby", label: "kids-baby", pattern: /\b(kids? fashion|baby shop|baby products?|maternity|children'?s clothing|παιδικ(?:α|ων)? ρουχ|βρεφικ|νεογενν|εγκυους|μαμα και παιδι)\b/i, weight: 118 },
  { category: "spa-wellness", label: "spa-wellness", pattern: /\b(spa|massage|wellness|hammam|holistic|yoga|pilates|relaxation|μασαζ|ευεξια|χαλαρωσ|ρεφλεξολογ)\b/i, weight: 117 },
  { category: "pharmacy", label: "pharmacy", pattern: /\b(pharmacy|parapharmacy|dermocosmetics?|supplements?|φαρμακει|συμπληρωματ|παραφαρμακ)\b/i, weight: 116 },
  { category: "beauty", label: "beauty", pattern: /\b(beauty|cosmetics?|skincare|skin care|makeup|perfume|parfum|hair salon|nail salon|laser hair removal|καλλυντικ|αισθητικ|αρωματ|κομμωτηρ|περιποιηση προσωπου|μανικιουρ)\b/i, weight: 114 },
  { category: "gaming", label: "gaming", pattern: /\b(video games?|gaming|board games?|collectibles?|dungeons? & dragons?|playstation|xbox|nintendo|επιτραπεζι|συλλεκτικ|παιχνιδια ρολων)\b/i, weight: 113 },
  { category: "sports", label: "sports-outdoor", pattern: /\b(sports? gear|sporting goods|outdoor equipment|outdoor gear|fitness|hiking|camping|surf|freediving|spearfishing|diving|ski|athletic|αθλητικ|ορειβασ|πεζοπορι|καταδυ|γυμναστηρ)\b/i, weight: 112 },
  { category: "fashion", label: "fashion", pattern: /\b(fashion|clothing|apparel|footwear|shoes?|sneakers?|swimwear|beachwear|lingerie|menswear|womenswear|leather bags?|ρουχα|ενδυση|υποδηματ|παπουτσια|μαγιο|τσαντες|εσωρουχ)\b/i, weight: 110 },
  { category: "technology", label: "technology", pattern: /\b(technology|electronics?|computers?|laptops?|smartphones?|mobile phones?|gadgets?|tech store|ηλεκτρονικ|υπολογιστ|κινητα|τεχνολογι)\b/i, weight: 109 },
  { category: "books", label: "books", pattern: /\b(bookstore|book shop|books?|publishing|βιβλιοπωλει|βιβλια|εκδοσεις)\b/i, weight: 108 },
  { category: "home", label: "home-living", pattern: /\b(home decor|homeware|furniture|lighting|bed linen|kitchenware|bathroom|garden center|plants delivered|tools store|candles|διακοσμησ|επιπλα|φωτιστικ|λευκα ειδη|σεντονια|κουρτινες|ειδη σπιτιου|ειδη υγιεινης|εργαλεια|κηπου|φυτα|κερια)\b/i, weight: 107 },
  { category: "restaurants", label: "restaurant", pattern: /\b(restaurants?|roof garden|taverna|bistro|cafe|coffee shop|brunch|dining|εστιατορι|ταβερν|καφετερι|γευμα|δειπνο)\b/i, weight: 106 },
  { category: "hotels", label: "hotel", pattern: /\b(hotel|resort|accommodation|luxury suites?|guesthouse|διαμονη|ξενοδοχει|ξενωνας)\b/i, weight: 105 },
  { category: "travel", label: "travel", pattern: /\b(travel agency|travel services?|airline|flights?|cruises?|tours? operator|car rental|ταξιδιωτικ|αεροπορικ|εκδρομες|ενοικιαση αυτοκινητ)\b/i, weight: 104 },
  { category: "food-delivery", label: "food-drink", pattern: /\b(supermarket|grocery|delicatessen|food products?|wine shop|winery|spirits|coffee beans|olive oil|organic foods?|τροφιμα|ποτα|κρασια|οινοποι|παντοπωλει|ελαιολαδο|ζαχαροπλαστ|αρτοποι)\b/i, weight: 103 },
  { category: "experiences", label: "experience", pattern: /\b(experiences?|escape room|activities|adventure|events?|theatre|cinema|museum|gallery|workshops?|δραστηριοτ|εμπειρι|θεατρο|σινεμα|μουσει|εκδηλωσ)\b/i, weight: 102 },
  { category: "marketplaces", label: "marketplace", pattern: /\b(marketplace|deal platform|daily deals?|coupons?|κουπονια|προσφορες εως|multi merchant)\b/i, weight: 101 },
  { category: "department-stores", label: "department-store", pattern: /\b(department store|multi-category retailer|πολυκαταστημα)\b/i, weight: 100 },
  { category: "gifts-concept-stores", label: "gift-concept", pattern: /\b(gift shop|concept store|gifts and crafts|unique gifts|souvenirs?|ειδη δωρων|καταστημα δωρων|πρωτοτυπα δωρα)\b/i, weight: 96 },
  { category: "corporate-gifts", label: "corporate", pattern: /\b(corporate gifts?|business gifts?|employee rewards?|εταιρικα δωρα|επιχειρηματικα δωρα)\b/i, weight: 125 },
  { category: "pets", label: "pet-industry-el", pattern: /(κατοικιδ|pet shop|κτηνιατρ|τροφες (για )?(σκυλ|γατ)|κομμωτηριο σκυλων)/i, weight: 126 },
  { category: "automotive", label: "automotive-el", pattern: /(αυτοκινητ|μοτοσυκλετ|ανταλλακτικα (αυτοκινητου|μοτοσυκλετας)|εξοπλισμος (αναβατη|συνεργειου)|car wash|φροντιδα αυτοκινητου|καυσιμα)/i, weight: 124 },
  { category: "health-medical", label: "medical-service-el", pattern: /(ιατρικ(α|ος|η|ες)|ιατροτεχνολογ|οδοντιατρ|ιδιωτικη κλινικη|νοσοκομει|διαγνωστικ|μαστογραφ)/i, weight: 124 },
  { category: "music", label: "music-retail-el", pattern: /(μουσικα οργανα|δισκοπωλει|εξοπλισμος dj|κρουστα|κιθαρες|πιανο|βινυλια)/i, weight: 122 },
  { category: "arts-crafts", label: "arts-crafts-el", pattern: /(ειδη ζωγραφικης|υλικα ζωγραφικης|εικαστικα υλικα|χειροτεχνιας|αγιογραφιας|decoupage|πλεξιμο|νηματα|ραπτικη τεχνη|κεραμικης|αγγειοπλαστικης)/i, weight: 121 },
  { category: "education", label: "education-el", pattern: /(εκπαιδευτικ(ος|η|α)|μαθηματα|σεμιναρια|σχολη|online learning|language school|σπουδες)/i, weight: 120 },
  { category: "jewelry-watches", label: "jewelry-el", pattern: /(κοσμηματα|κοσμηματοπωλει|ρολογια|χρυσειο|χειροποιητα κοσμηματα|silver jewelry)/i, weight: 119 },
  { category: "kids-baby", label: "kids-baby-el", pattern: /(παιδικα ρουχα|βρεφικα|ειδη βρεφ|βρεφαναπτυξ|ρουχα εγκυμοσυνης|προικα μωρου|παιχνιδια για παιδια|kids fashion|baby swimming)/i, weight: 118 },
  { category: "spa-wellness", label: "spa-wellness-el", pattern: /(μασαζ|ευεξια|θεραπειες σωματος|χαλαρωσης|hammam|wellness|massage)/i, weight: 117 },
  { category: "pharmacy", label: "pharmacy-el", pattern: /(φαρμακει|παραφαρμακ|συμπληρωματα διατροφης|dermocosmetic)/i, weight: 116 },
  { category: "beauty", label: "beauty-el", pattern: /(καλλυντικα|ομορφιας|περιποιηση(ς)? (προσωπου|δερματος|μαλλιων|νυχιων)|αρωματα|μακιγιαζ|ινστιτουτο αισθητικης|laser αποτριχωση|skincare)/i, weight: 114 },
  { category: "gaming", label: "gaming-el", pattern: /(video games|gaming|επιτραπεζια|συλλεκτικα|παιχνιδια ρολων|lego store)/i, weight: 113 },
  { category: "sports", label: "sports-outdoor-el", pattern: /(αθλητικα ειδη|αθλητικα παπουτσια|outdoor εξοπλισμ|εξοπλισμος (σκι|καταδυσης|ψαρεματος)|ορειβασια|πεζοπορια|αναρριχηση|surfboards|γυμναστηριο)/i, weight: 112 },
  { category: "fashion", label: "fashion-el", pattern: /(γυναικεια ρουχα|ανδρικα ρουχα|γυναικεια παπουτσια|ανδρικα παπουτσια|γυναικεια εσωρουχα|γυναικεια μοδα|ανδρικη ενδυση|μαγιο|δερματινα μπουφαν|τσαντες και αξεσουαρ|fashion boutique)/i, weight: 110 },
  { category: "technology", label: "technology-el", pattern: /(προιοντα τεχνολογιας|υπολογιστες|κινητα τηλεφωνα|ηλεκτρονικα ειδη|3d εκτυπ|smartphones|gadgets)/i, weight: 109 },
  { category: "books", label: "books-el", pattern: /(βιβλιοπωλει|εκδοσεις |παιδικα βιβλια|online bookshop)/i, weight: 108 },
  { category: "home", label: "home-living-el", pattern: /(ειδη σπιτιου|διακοσμητικα|επιπλα|φωτιστικα|λευκα ειδη|ειδη υγιεινης|εργαλεια|κηπος|κηπου|φυτα|γλαστρες|αρωματικα χωρου|χειροποιητα κερια)/i, weight: 107 },
  { category: "restaurants", label: "restaurant-el", pattern: /(εστιατοριο|ταβερνα|wine bar|beer bar|roof garden|καφε και brunch|γευμα η δειπνο)/i, weight: 106 },
  { category: "hotels", label: "hotel-el", pattern: /(ξενοδοχειο|διαμονη|luxury (spa )?hotel|beach hotel|resort|suites)/i, weight: 105 },
  { category: "travel", label: "travel-el", pattern: /(ταξιδιωτικο γραφειο|ταξιδιωτικες υπηρεσιες|αεροπορικη|travel agency|car rental)/i, weight: 104 },
  { category: "food-delivery", label: "food-drink-el", pattern: /(τροφιμα|ξηροι καρποι|σοκολατ|καφες|κρασια|καβα|ελαιολαδο|delicatessen|supermarket|μπυρας)/i, weight: 103 },
  { category: "experiences", label: "experience-el", pattern: /(εμπειριες|δραστηριοτητες|walking tours|outdoor adventures|ξεναγησ|εκδρομες|θεατρο|μουσειο|art gallery)/i, weight: 102 },
  { category: "marketplaces", label: "marketplace-el", pattern: /(marketplace|πλατφορμα προσφορων|deals με κουπονια|multi-merchant)/i, weight: 101 },
  { category: "department-stores", label: "department-store-el", pattern: /(πολυκαταστημα|multi-category retailer)/i, weight: 100 },
  { category: "gifts-concept-stores", label: "gift-concept-el", pattern: /(concept store|ειδη δωρου|πρωτοτυπα δωρα|gift shop|προσωποποιημενα δωρα|τουριστικα ειδη)/i, weight: 99 },
];

// Exact-domain decisions are added only after an operator has reviewed the
// harvested official metadata. They outrank heuristic text matches and keep
// ambiguous brand names from becoming false positives.
const EXACT_DOMAIN_CATEGORIES: Record<string, CategorySlug> = {
  "1art.gr": "home",
  "access-shop.gr": "fashion",
  "adagio.gr": "music",
  "agigma.gr": "spa-wellness",
  "ammashop.gr": "fashion",
  "arfie.gr": "kids-baby",
  "art-center.com.gr": "arts-crafts",
  "artcolour.gr": "arts-crafts",
  "atelie.com.gr": "books",
  "atenea.gr": "beauty",
  "badayestudio.gr": "fashion",
  "badila.gr": "fashion",
  "barbopoulos.gr": "fashion",
  "barequip.gr": "home",
  "bmwpap.gr": "automotive",
  "blackswan-lbs.gr": "beauty",
  "bloeur.gr": "fashion",
  "bylia.gr": "kids-baby",
  "bymeraki.gr": "kids-baby",
  "cafemanteio.gr": "experiences",
  "cameoshatter.gr": "fashion",
  "carbon.gr": "automotive",
  "carlamco.gr": "automotive",
  "carrotstore.gr": "gifts-concept-stores",
  "cavallo.gr": "fashion",
  "celesteshop.gr": "kids-baby",
  "cestino.gr": "department-stores",
  "chicart.gr": "jewelry-watches",
  "christhellas.gr": "home",
  "cicado.gr": "fashion",
  "cigarsmoke.gr": "tobacco-vaping",
  "colordrop.gr": "gifts-concept-stores",
  "confetti-gifts.gr": "gifts-concept-stores",
  "cordella.gr": "marketplaces",
  "cre-t-e.gr": "arts-crafts",
  "creatorshop.gr": "gifts-concept-stores",
  "crystalswan.gr": "jewelry-watches",
  "diatautaathens.com": "gifts-concept-stores",
  "digas.gr": "health-medical",
  "didi.gr": "fashion",
  "dmktools.gr": "automotive",
  "driverstation.gr": "automotive",
  "e-mamouth.gr": "books",
  "e-stathatos.gr": "sports",
  "easlanidis.gr": "home",
  "ebru.gr": "fashion",
  "ekklisiastikakarditsa.gr": "gifts-concept-stores",
  "elegancy.gr": "beauty",
  "elephantstore.gr": "gifts-concept-stores",
  "erero.gr": "fashion",
  "ergaleiogatos.gr": "home",
  "esthai.gr": "jewelry-watches",
  "eurekathens.com": "experiences",
  "eyemazing.gr": "fashion",
  "fairytale.com.gr": "restaurants",
  "feelcar.gr": "automotive",
  "fisika.gr": "beauty",
  "floky.gr": "sports",
  "forward.gr": "sports",
  "forall.com.gr": "kids-baby",
  "gabi.gr": "kids-baby",
  "gbroofgarden.gr": "restaurants",
  "goldmall.gr": "marketplaces",
  "eshop.greenpeacegreece.org": "gifts-concept-stores",
  "harmanis.gr": "beauty",
  "herbstore.gr": "pharmacy",
  "happydonkey.gr": "gifts-concept-stores",
  "hlcpro.gr": "beauty",
  "hotelshops.gr": "fashion",
  "hugshop.gr": "kids-baby",
  "idil.gr": "fashion",
  "imanoglou.gr": "jewelry-watches",
  "inandela.gr": "fashion",
  "ipatios.gr": "fashion",
  "irisproject.gr": "experiences",
  "jdsports.gr": "sports",
  "joykidsboutique.gr": "kids-baby",
  "justbrazilstore.gr": "fashion",
  "kaelego.gr": "home",
  "kakiasoptics.gr": "fashion",
  "kalinaconceptstore.gr": "gifts-concept-stores",
  "kantarzoglou.gr": "home",
  "katsudo.gr": "sports",
  "keriland.gr": "arts-crafts",
  "kidsgarden.gr": "kids-baby",
  "kois-optics.gr": "fashion",
  "koumoulia.gr": "arts-crafts",
  "kounelis.com.gr": "home",
  "kounio.gr": "department-stores",
  "krokodila.gr": "jewelry-watches",
  "lalita.gr": "spa-wellness",
  "lego.storegreece.gr": "kids-baby",
  "lauraashleyshop.gr": "home",
  "lazoptics.gr": "fashion",
  "leatherstudio.gr": "fashion",
  "lentiamo.gr": "fashion",
  "leparfum.com.gr": "beauty",
  "liakopoulos-store.gr": "fashion",
  "lidl-hellas.gr": "food-delivery",
  "lonsdale.gr": "sports",
  "lookshop.gr": "fashion",
  "love-it.gr": "home",
  "luvnroll.com": "experiences",
  "lurehouse.gr": "sports",
  "madeofglass.gr": "corporate-gifts",
  "maisonnette.gr": "home",
  "maiarea.gr": "fashion",
  "manicurious.gr": "beauty",
  "marandmar.gr": "kids-baby",
  "marinospor.gr": "fashion",
  "mamagalia.gr": "kids-baby",
  "materiaprima.gr": "food-delivery",
  "marketfix.gr": "marketplaces",
  "massaha.gr": "spa-wellness",
  "matiartgallery.com": "arts-crafts",
  "meandjoe.com": "fashion",
  "medi-shop.gr": "health-medical",
  "melissinos-sandals.gr": "fashion",
  "melloncollection.gr": "fashion",
  "mentzos.gr": "jewelry-watches",
  "mgsound.gr": "experiences",
  "mixandmatch.gr": "fashion",
  "misa.gr": "beauty",
  "minotavros.gr": "home",
  "moelian.gr": "beauty",
  "momandme.gr": "kids-baby",
  "morethanthis.gr": "gifts-concept-stores",
  "motoholics.gr": "automotive",
  "moustakisfc.gr": "home",
  "msba-events.gr": "kids-baby",
  "muye.gr": "jewelry-watches",
  "mycolours.gr": "experiences",
  "mylifelikes.gr": "gifts-concept-stores",
  "mylittleland.gr": "kids-baby",
  "naira.gr": "jewelry-watches",
  "najma.gr": "jewelry-watches",
  "nakas.gr": "music",
  "nakasconcept.gr": "home",
  "nakita.gr": "fashion",
  "naturalhealth.gr": "pharmacy",
  "northsantorini.com": "hotels",
  "online.mideast.gr": "travel",
  "olia.com.gr": "fashion",
  "omg.gr": "fashion",
  "oreasoncs.gr": "gifts-concept-stores",
  "oser.gr": "fashion",
  "pargaoro.gr": "jewelry-watches",
  "perdikis.gr": "books",
  "pezzetta.gr": "home",
  "playroot.gr": "kids-baby",
  "plegmashop.gr": "home",
  "poupee.gr": "kids-baby",
  "profitstore.gr": "department-stores",
  "projectsoma.gr": "fashion",
  "powerenergy.gr": "technology",
  "ptbox.gr": "sports",
  "purebubs.gr": "beauty",
  "purityvision.gr": "beauty",
  "rhythmichouse.gr": "sports",
  "romeo.gr": "restaurants",
  "sanopwleio.gr": "home",
  "saltymoon.gr": "jewelry-watches",
  "sbokos.gr": "home",
  "sekoia.gr": "fashion",
  "serkos.gr": "jewelry-watches",
  "sfsonline.gr": "fashion",
  "shine4ever.gr": "gifts-concept-stores",
  "shop-guide.gr": "fashion",
  "shopdali.gr": "kids-baby",
  "simclub.gr": "experiences",
  "smart-tap.gr": "technology",
  "snus-bar.gr": "tobacco-vaping",
  "soandjos.gr": "home",
  "solivagant.gr": "jewelry-watches",
  "sonice.gr": "beauty",
  "stickit.gr": "home",
  "sticky.gr": "home",
  "storegreece.gr": "kids-baby",
  "storybook.gr": "books",
  "strata-shop.gr": "fashion",
  "suenobags.gr": "fashion",
  "sunflirt.gr": "fashion",
  "sunsandclouds.gr": "kids-baby",
  "sunrisemykonos.com": "hotels",
  "swissvax.gr": "automotive",
  "t-support.gr": "technology",
  "talesofales.gr": "food-delivery",
  "tempus.gr": "jewelry-watches",
  "theknittingclub.gr": "arts-crafts",
  "thelproject.gr": "education",
  "theloftchalkida.gr": "fashion",
  "themagicbox.gr": "gifts-concept-stores",
  "thewonderroom.gr": "kids-baby",
  "thiamia.gr": "kids-baby",
  "tinycocoon.gr": "kids-baby",
  "timesstore.gr": "fashion",
  "tokopeli.gr": "kids-baby",
  "trailofmind.gr": "experiences",
  "traisto.gr": "arts-crafts",
  "treasurebox.gr": "jewelry-watches",
  "trouvaille.gr": "jewelry-watches",
  "turritella.gr": "jewelry-watches",
  "tziouti-alexandra.gr": "jewelry-watches",
  "tuasolea.gr": "fashion",
  "uba.gr": "fashion",
  "undergroundshop.gr": "fashion",
  "vantaggio.gr": "fashion",
  "valsamakis.gr": "fashion",
  "vapelux.gr": "tobacco-vaping",
  "vinoteca.gr": "food-delivery",
  "vipart.gr": "home",
  "vitaspis.gr": "pharmacy",
  "vizadinigonia.gr": "sports",
  "wedday.gr": "fashion",
  "xmode.gr": "technology",
  "ymonanatripsis.gr": "spa-wellness",
  "zador.gr": "fashion",
  "zoniou.gr": "beauty",
  "fifthelement.gr": "sports",
  "karfitsomenosgatos.gr": "kids-baby",
  "lovegeneration.gr": "fashion",
  "maamonpapa.gr": "kids-baby",
  "malleconcept.gr": "home",
  "neraidochora.gr": "gifts-concept-stores",
  "twoandahalf.gr": "fashion",
};

// These domains need an explicit catalog/identity decision before taxonomy can
// be applied. Some are publishers or voucher-printing services rather than
// consumer gift-card programmes; others have insufficient official evidence.
const REVIEW_ONLY_DOMAINS = new Set([
  "blue-print.gr",
  "cardlink.gr",
  "liberal.gr",
  "naftemporiki.gr",
  "printhouse.gr",
]);

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function domainFrom(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function immutableReportPath(filePath: string, planId: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${planId.slice(0, 16)}${parsed.ext}`);
}

function pageText(page: EvidencePage | null, includeExcerpt: boolean) {
  if (!page) return "";
  return normalizeText([
    page.title,
    page.description,
    ...page.headings.slice(0, 2),
    includeExcerpt ? page.excerpt : null,
  ].filter(Boolean).join(" "));
}

function classify(row: EvidenceRow) {
  const identityText = normalizeText([row.merchantName, row.giftCardTitle, row.shortDescription].filter(Boolean).join(" "));
  const officialText = pageText(row.officialEvidence, false);
  const websiteText = pageText(row.websiteEvidence, false);
  const excerptText = normalizeText([row.officialEvidence?.excerpt, row.websiteEvidence?.excerpt].filter(Boolean).join(" "));
  const scored = new Map<CategorySlug, { score: number; evidence: string[] }>();

  const merchantDomain = domainFrom(row.websiteUrl || row.officialUrl);
  const exactCategory = EXACT_DOMAIN_CATEGORIES[merchantDomain];
  if (exactCategory) {
    scored.set(exactCategory, {
      score: 150,
      evidence: [`operator-reviewed-official-metadata:${merchantDomain}`],
    });
  }

  for (const rule of RULES) {
    const evidence: string[] = [];
    let score = 0;
    if (rule.pattern.test(identityText)) {
      score = Math.max(score, rule.weight + 8);
      evidence.push(`identity:${rule.label}`);
    }
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(officialText)) {
      score = Math.max(score, rule.weight + 5);
      evidence.push(`official-page:${rule.label}`);
    }
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(websiteText)) {
      score = Math.max(score, rule.weight);
      evidence.push(`merchant-page:${rule.label}`);
    }
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(excerptText)) {
      score = Math.max(score, rule.weight - 40);
      evidence.push(`page-excerpt:${rule.label}`);
    }
    if (!score) continue;
    const current = scored.get(rule.category) || { score: 0, evidence: [] };
    current.score = Math.max(current.score, score) + (current.score ? 3 : 0);
    current.evidence.push(...evidence);
    scored.set(rule.category, current);
  }

  return [...scored.entries()]
    .map(([categorySlug, value]) => ({ categorySlug, score: value.score, evidence: [...new Set(value.evidence)] }))
    .sort((a, b) => b.score - a.score || a.categorySlug.localeCompare(b.categorySlug));
}

async function currentTargets() {
  return prisma.giftCard.findMany({
    where: { status: "ACTIVE", categories: { none: {} } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      officialUrl: true,
      shortDescription: true,
      merchant: { select: { id: true, name: true, websiteUrl: true } },
      categories: { select: { categoryId: true } },
    },
  });
}

async function fingerprint() {
  const cards = await currentTargets();
  return stableHash(cards.map((card) => ({
    id: card.id,
    title: card.title,
    officialUrl: card.officialUrl,
    shortDescription: card.shortDescription,
    merchantId: card.merchant.id,
    merchantName: card.merchant.name,
    websiteUrl: card.merchant.websiteUrl,
    categoryIds: card.categories.map((category) => category.categoryId).sort(),
  })));
}

async function buildPlan() {
  if (!fs.existsSync(EVIDENCE_JSON)) throw new Error(`Missing evidence report: ${EVIDENCE_JSON}`);
  const evidenceReport = JSON.parse(fs.readFileSync(EVIDENCE_JSON, "utf8")) as { rows: EvidenceRow[] };
  const current = await currentTargets();
  const currentIds = new Set(current.map((card) => card.id));
  const evidenceRows = evidenceReport.rows.filter((row) => currentIds.has(row.giftCardId));
  if (evidenceRows.length !== current.length) throw new Error("Evidence report is stale or incomplete. Run taxonomy evidence v2 again.");

  const actions = [];
  const reviews = [];
  for (const row of evidenceRows) {
    const candidates = classify(row);
    const top = candidates[0];
    const second = candidates[1];
    const merchantDomain = domainFrom(row.websiteUrl || row.officialUrl);
    const reviewOnly = REVIEW_ONLY_DOMAINS.has(merchantDomain);
    const safe = Boolean(!reviewOnly && top && top.score >= 100 && top.score - (second?.score || 0) >= 18);
    const common = {
      giftCardId: row.giftCardId,
      merchantName: row.merchantName,
      giftCardTitle: row.giftCardTitle,
      officialUrl: row.officialUrl,
      websiteUrl: row.websiteUrl,
      candidates: candidates.slice(0, 5),
    };
    if (safe && top) {
      actions.push({
        ...common,
        categorySlug: top.categorySlug,
        score: top.score,
        evidence: top.evidence,
        actionId: stableHash([row.giftCardId, top.categorySlug, top.evidence]),
      });
    } else {
      reviews.push({
        ...common,
        reason: reviewOnly
          ? "IDENTITY_OR_PROGRAM_REVIEW_REQUIRED"
          : candidates.length
            ? "AMBIGUOUS_OFFICIAL_EVIDENCE"
            : "NO_OFFICIAL_CATEGORY_EVIDENCE",
      });
    }
  }

  const planWithoutId = {
    version: VERSION,
    mode: "PREVIEW" as const,
    generatedAt: new Date().toISOString(),
    targetFingerprint: await fingerprint(),
    targetCount: current.length,
    summary: { safe: actions.length, review: reviews.length },
    categoryDefinitions: CATEGORY_DEFINITIONS,
    actions,
    reviews,
  };
  return { ...planWithoutId, planId: stableHash(planWithoutId) };
}

function readPlan() {
  if (!PLAN_ID_ARG) throw new Error("Missing --plan-id=<id>.");
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  if (plan.version !== VERSION) throw new Error(`Unsupported plan version: ${plan.version}`);
  if (plan.planId !== PLAN_ID_ARG) throw new Error("Plan ID does not match the saved preview.");
  return plan;
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  const rows = [
    ["status", "giftCardId", "merchantName", "giftCardTitle", "categorySlug", "score", "reason", "evidence", "candidates", "officialUrl", "websiteUrl"],
    ...plan.actions.map((action) => ["SAFE", action.giftCardId, action.merchantName, action.giftCardTitle, action.categorySlug, action.score, "", action.evidence, action.candidates.map((candidate) => `${candidate.categorySlug}:${candidate.score}`), action.officialUrl, action.websiteUrl]),
    ...plan.reviews.map((review) => ["REVIEW", review.giftCardId, review.merchantName, review.giftCardTitle, "", "", review.reason, "", review.candidates.map((candidate) => `${candidate.categorySlug}:${candidate.score}`), review.officialUrl, review.websiteUrl]),
  ];
  fs.writeFileSync(PLAN_CSV, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  fs.copyFileSync(PLAN_JSON, immutableReportPath(PLAN_JSON, plan.planId));
  fs.copyFileSync(PLAN_CSV, immutableReportPath(PLAN_CSV, plan.planId));
  console.log("Dorokartes Catalog Taxonomy v2 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log(`Safe: ${plan.summary.safe}`);
  console.log(`Review: ${plan.summary.review}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function apply() {
  const plan = readPlan();
  if (await fingerprint() !== plan.targetFingerprint) throw new Error("Catalog/category state changed after preview. Generate and inspect a new plan.");
  const usedSlugs = [...new Set(plan.actions.map((action: { categorySlug: CategorySlug }) => action.categorySlug))];
  const definitions = CATEGORY_DEFINITIONS.filter((category) => usedSlugs.includes(category.slug));
  await prisma.$transaction(async (tx) => {
    for (const category of definitions) {
      await tx.category.upsert({
        where: { slug: category.slug },
        update: {},
        create: category,
      });
    }
    const categories = await tx.category.findMany({ where: { slug: { in: usedSlugs }, active: true }, select: { id: true, slug: true } });
    const ids = new Map(categories.map((category) => [category.slug, category.id]));
    if (ids.size !== usedSlugs.length) throw new Error("One or more planned categories are missing or inactive.");
    await tx.giftCardCategory.createMany({
      data: plan.actions.map((action: { giftCardId: string; categorySlug: CategorySlug }) => ({
        giftCardId: action.giftCardId,
        categoryId: ids.get(action.categorySlug)!,
        primary: true,
      })),
    });
  }, { maxWait: 15_000, timeout: 60_000 });
  const report = { version: VERSION, mode: "APPLY", planId: plan.planId, appliedAt: new Date().toISOString(), applied: plan.actions.length };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(APPLY_JSON, immutableReportPath(APPLY_JSON, stableHash(report)));
  console.log("Dorokartes Catalog Taxonomy v2 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${plan.actions.length}`);
}

async function postAudit() {
  const plan = readPlan();
  if (!fs.existsSync(APPLY_JSON)) throw new Error(`Missing successful apply report: ${APPLY_JSON}`);
  const applyReport = JSON.parse(fs.readFileSync(APPLY_JSON, "utf8"));
  if (applyReport.planId !== plan.planId || applyReport.applied !== plan.actions.length) {
    throw new Error("Successful apply report does not match the requested preview plan.");
  }
  const rows = await prisma.giftCardCategory.findMany({
    where: { giftCardId: { in: plan.actions.map((action: { giftCardId: string }) => action.giftCardId) } },
    select: { giftCardId: true, primary: true, category: { select: { slug: true } } },
  });
  const failed = plan.actions.filter((action: { giftCardId: string; categorySlug: string }) => !rows.some((row) => row.giftCardId === action.giftCardId && row.category.slug === action.categorySlug && row.primary));
  const report = { version: VERSION, mode: "POST_AUDIT", planId: plan.planId, auditedAt: new Date().toISOString(), checked: plan.actions.length, passed: plan.actions.length - failed.length, failed: failed.map((action: { actionId: string }) => action.actionId) };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(POST_AUDIT_JSON, immutableReportPath(POST_AUDIT_JSON, stableHash(report)));
  console.log("Dorokartes Catalog Taxonomy v2 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  try {
    if (APPLY) await apply();
    else if (POST_AUDIT) await postAudit();
    else await preview();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
