import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = "catalog-taxonomy-v1" as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
const PLAN_ID_ARG = process.argv.find((value) => value.startsWith("--plan-id="))?.slice(10);
const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v1-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "catalog-taxonomy-v1-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v1-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "catalog-taxonomy-v1-post-audit.json");

if (APPLY && POST_AUDIT) throw new Error("Choose either --apply or --post-audit.");
if ((APPLY || POST_AUDIT) && !PLAN_ID_ARG) {
  throw new Error("--plan-id=<exact preview plan id> is required.");
}

type CategorySlug =
  | "fashion"
  | "beauty"
  | "technology"
  | "gaming"
  | "streaming-digital"
  | "home"
  | "sports"
  | "kids-baby"
  | "books"
  | "food-delivery"
  | "restaurants"
  | "travel"
  | "hotels"
  | "experiences"
  | "spa-wellness"
  | "jewelry-watches"
  | "pharmacy"
  | "department-stores"
  | "marketplaces"
  | "corporate-gifts";

type Evidence = {
  category: CategorySlug;
  source: string;
  weight: number;
};

type Snapshot = {
  id: string;
  title: string;
  slug: string;
  merchantName: string;
  websiteUrl: string | null;
  officialUrl: string | null;
  currentCategorySlugs: string[];
};

type Action = {
  actionId: string;
  giftCardId: string;
  giftCardTitle: string;
  giftCardSlug: string;
  merchantName: string;
  merchantDomain: string;
  categorySlug: CategorySlug;
  score: number;
  evidence: string[];
};

type Review = {
  giftCardId: string;
  giftCardTitle: string;
  merchantName: string;
  merchantDomain: string;
  reason: string;
  candidates: Array<{ categorySlug: CategorySlug; score: number; evidence: string[] }>;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  generatedAt: string;
  planId: string;
  targetFingerprint: string;
  activeCardCount: number;
  alreadyCategorizedCount: number;
  targetCount: number;
  summary: { safe: number; review: number };
  actions: Action[];
  reviews: Review[];
  snapshots: Snapshot[];
};

const CATEGORY_SLUGS = new Set<CategorySlug>([
  "fashion",
  "beauty",
  "technology",
  "gaming",
  "streaming-digital",
  "home",
  "sports",
  "kids-baby",
  "books",
  "food-delivery",
  "restaurants",
  "travel",
  "hotels",
  "experiences",
  "spa-wellness",
  "jewelry-watches",
  "pharmacy",
  "department-stores",
  "marketplaces",
  "corporate-gifts",
]);

const SOURCE_CATEGORY_MAP: Record<string, CategorySlug | null> = {
  fashion: "fashion",
  beauty: "beauty",
  technology: "technology",
  technology_gaming: null,
  gaming: "gaming",
  digital: "streaming-digital",
  music: null,
  home: "home",
  sports: "sports",
  sports_footwear: "sports",
  kids: "kids-baby",
  kids_books: "kids-baby",
  books: "books",
  food: "food-delivery",
  "food-delivery": "food-delivery",
  food_restaurants: "restaurants",
  restaurants: "restaurants",
  travel: "travel",
  travel_airlines: "travel",
  hotels: "hotels",
  entertainment: "experiences",
  experiences: "experiences",
  experiences_wellness: null,
  jewelry: "jewelry-watches",
  jewelry_accessories: "jewelry-watches",
  pharmacy: "pharmacy",
  retail: "department-stores",
  marketplaces_services: "marketplaces",
  corporate_gifts: "corporate-gifts",
};

const KEYWORD_RULES: Array<{ category: CategorySlug; pattern: RegExp }> = [
  { category: "pharmacy", pattern: /\b(pharmacy|pharm|farmakeio|φαρμακ|apothec)\w*/i },
  { category: "jewelry-watches", pattern: /(jewel\w*|jewellery|kosmim\w*|(?:^|\s)κοσμημα\w*|\bρολο\w*|\bwatches?\b)/i },
  { category: "kids-baby", pattern: /\b(baby|babies|kids?|children|child|bebe|βρεφ\w*|παιδ\w*|toys?)\b/i },
  { category: "books", pattern: /\b(books?|bookstore|bookshop|βιβλι\w*)\b/i },
  { category: "hotels", pattern: /\b(hotels?|resorts?|hostels?|suites?|villas?|apartments?|hospitality)\b/i },
  { category: "travel", pattern: /\b(travel|tours?|flights?|airlines?|airways|ferry|cruise|train|ταξιδ\w*)\b/i },
  { category: "spa-wellness", pattern: /\b(spa|massage|wellness|medispa|relaxation|θεραπει\w*)\b/i },
  { category: "restaurants", pattern: /\b(restaurants?|tavern\w*|osteria|bistro|brunch|grill|ταβερν\w*|εστιατορ\w*)\b/i },
  { category: "food-delivery", pattern: /\b(food|foods|bakery|cake|cakes|patisserie|deli|wine|wines|grocery|supermarket|chocolate|sweet\w*|τροφ\w*)\b/i },
  { category: "sports", pattern: /\b(sports?|sporty|athlet\w*|fitness|gyms?|running|tennis|cycling|bikes?|outdoor)\b/i },
  { category: "gaming", pattern: /\b(gaming|gamer|games?|playstation|xbox|nintendo|steam)\b/i },
  { category: "technology", pattern: /\b(technology|tech|electronics?|electro|computers?|mobile|smartphone|gadgets?)\b/i },
  { category: "home", pattern: /\b(home|homes|furniture|decor\w*|linen|kitchen|mattress|garden|interior)\b/i },
  { category: "beauty", pattern: /\b(beauty|cosmetics?|makeup|perfume|fragrance|skincare|hair|nails?|salon)\b/i },
  { category: "fashion", pattern: /\b(fashion|clothing|clothes|apparel|wear|shoes?|footwear|bags?|boutique|lingerie)\b/i },
  { category: "streaming-digital", pattern: /\b(streaming|spotify|netflix|subscription)\b/i },
  { category: "experiences", pattern: /\b(experiences?|adventure|escape room|picnic|cinema|theatre|tickets?|activities)\b/i },
  { category: "department-stores", pattern: /\b(department store|multistore|πολυκαταστημα)\b/i },
  { category: "marketplaces", pattern: /\b(marketplace|marketplaces)\b/i },
  { category: "corporate-gifts", pattern: /\b(corporate|business gifts?|εταιρικ\w*)\b/i },
];

// Operator-reviewed, exact-domain assignments. These deliberately outrank old
// discovery-query labels, which are useful hints but contain known false
// positives. Keeping the scope at the registrable-domain level makes every
// decision explicit, reviewable and reproducible in the generated plan.
const CURATED_DOMAIN_CATEGORIES: Record<string, CategorySlug> = {
  "moonboon.gr": "kids-baby",
  "movelab.gr": "sports",
  "museumofillusions.gr": "experiences",
  "myconianambassador.gr": "hotels",
  "myconiankyma.gr": "hotels",
  "mymarket.gr": "food-delivery",
  "myredraven.com": "fashion",
  "neraw.gr": "home",
  "obiotique.com": "pharmacy",
  "offroadcrete.gr": "experiences",
  "oikosterzis.gr": "home",
  "optikaliolios.gr": "fashion",
  "paidikaianaptixi.gr": "kids-baby",
  "palazzodiscarpe.gr": "fashion",
  "papastavroushops.gr": "sports",
  "parentingcourses.gr": "experiences",
  "pdltrendz.gr": "fashion",
  "physioathens.gr": "spa-wellness",
  "piccolo-orso.gr": "kids-baby",
  "pointe.gr": "fashion",
  "prepareforgreece.com": "experiences",
  "pret-a-beaute.gr": "beauty",
  "public.gr": "department-stores",
  "revitalash.gr": "beauty",
  "rideonline.gr": "sports",
  "safestep.gr": "fashion",
  "santi.gr": "spa-wellness",
  "sexodonia.gr": "fashion",
  "signature.gr": "travel",
  "simplygreen.gr": "sports",
  "skinpositive.gr": "beauty",
  "skinreal.gr": "beauty",
  "skinu.gr": "beauty",
  "skynn.gr": "beauty",
  "slalomshop.gr": "sports",
  "sneaker10.gr": "fashion",
  "sounou.gr": "kids-baby",
  "sportboutique.gr": "sports",
  "stefanoumarine.net": "sports",
  "superstrom.gr": "home",
  "symmetria.gr": "spa-wellness",
  "tacticalstore.gr": "sports",
  "tailormadeknitwear.com.gr": "fashion",
  "tartare.gr": "restaurants",
  "tattooathens.gr": "experiences",
  "tea-pot.gr": "food-delivery",
  "teleioplayroom.gr": "kids-baby",
  "tempiholidays.gr": "travel",
  "tennisgarden.gr": "sports",
  "thejacketmaker.gr": "fashion",
  "thejerkins.com.gr": "fashion",
  "themeetmarket.gr": "marketplaces",
  "thermaesylla.gr": "spa-wellness",
  "tinytoes.gr": "kids-baby",
  "toms.gr": "fashion",
  "track-speed.gr": "experiences",
  "trekking.gr": "experiences",
  "trollbeads.gr": "jewelry-watches",
  "tudorhall.gr": "restaurants",
  "unlimited-adrenaline.gr": "experiences",
  "urban-nomad.gr": "fashion",
  "vca.gr": "sports",
  "verandadelvino.gr": "restaurants",
  "vinoultura.gr": "food-delivery",
  "vinylartclothing.gr": "fashion",
  "virtual-room.com": "experiences",
  "wallpaperstore.gr": "home",
  "waragod.gr": "sports",
  "wokshop.gr": "home",
  "woodyline.gr": "home",
  "worldofvision.gr": "fashion",
  "xeiroplathi.gr": "experiences",
  "xxlove.gr": "fashion",
  "yourscent.gr": "beauty",
  "zuccherino.gr": "food-delivery",
  "zuraris.gr": "fashion",
  "abajourmonamour.gr": "home",
  "afroditesbeaute.gr": "beauty",
  "aggouris.gr": "fashion",
  "alhammam.gr": "spa-wellness",
  "alouette.gr": "kids-baby",
  "amourianosoptics.gr": "fashion",
  "angelsflowers.gr": "home",
  "anthemionflowers.com": "home",
  "antonella.gr": "fashion",
  "anubis.gr": "books",
  "army-market.gr": "sports",
  "asianforall.gr": "food-delivery",
  "athanasiakaritsa.gr": "beauty",
  "atticadps.gr": "department-stores",
  "audiocontrol.gr": "technology",
  "baseandtop.gr": "beauty",
  "batterypark.gr": "technology",
  "bbq.gr": "home",
  "bilero.gr": "fashion",
  "blackroll.gr": "sports",
  "botano.gr": "food-delivery",
  "box-box.gr": "fashion",
  "calza.gr": "fashion",
  "calzomania.gr": "fashion",
  "camperisimo.gr": "sports",
  "caravin.gr": "food-delivery",
  "carousel.gr": "kids-baby",
  "cavakalomenidis.gr": "food-delivery",
  "chania-culture.gr": "experiences",
  "cilek.gr": "kids-baby",
  "clachic.gr": "fashion",
  "climber.gr": "sports",
  "converse.gr": "fashion",
  "cookworld.gr": "home",
  "coolclub.gr": "kids-baby",
  "coronadifiori.gr": "home",
  "cretegolfclub.com": "sports",
  "cretelocaladventures.com": "experiences",
  "crudeshop.gr": "sports",
  "crusters.gr": "food-delivery",
  "culturalsociety.gr": "experiences",
  "cyclestore.gr": "sports",
  "dalisleather.gr": "fashion",
  "dermargylab.gr": "beauty",
  "deximi.gr": "fashion",
  "digishark.gr": "technology",
  "dioptra.gr": "books",
  "district75.gr": "sports",
  "divingstore.gr": "sports",
  "djmania.gr": "technology",
  "dronehouse.gr": "technology",
  "dwrokartes.gr": "marketplaces",
  "e-gatos.gr": "kids-baby",
  "e-snacks.gr": "food-delivery",
  "e-socks.gr": "fashion",
  "ecoliving.gr": "home",
  "ehunter.gr": "sports",
  "ekdoseis-papasotiriou.gr": "books",
  "elbebeboutique.gr": "kids-baby",
  "elementalpilates.gr": "sports",
  "elforsam.gr": "fashion",
  "enzzo.gr": "fashion",
  "epidermislaser.gr": "beauty",
  "epipla24.gr": "home",
  "epiploaivazoglou.gr": "home",
  "epiplocasa.gr": "home",
  "esiot.gr": "fashion",
  "espressoshop.gr": "home",
  "estheta.gr": "fashion",
  "eubiotica.gr": "food-delivery",
  "extremepro.gr": "sports",
  "face-it.gr": "beauty",
  "familychef.gr": "food-delivery",
  "felicia-concept.gr": "fashion",
  "femmefatale.gr": "beauty",
  "fivepm.gr": "fashion",
  "fmsstores.gr": "fashion",
  "giftpro.co.uk": "restaurants",
  "gifts4all.com.gr": "marketplaces",
  "gotshirts.gr": "fashion",
  "goulandris.gr": "experiences",
  "greenartstore.gr": "home",
  "greenmall.gr": "marketplaces",
  "habitatgreece.gr": "home",
  "haralas.gr": "fashion",
  "headplus.gr": "beauty",
  "hehe-messyplay.gr": "experiences",
  "hellenicorchids.gr": "home",
  "heraklionimprov.gr": "experiences",
  "hobbylobby-yarns.gr": "home",
  "hobbywood.gr": "home",
  "homii.gr": "home",
  "hondoscenter.com": "department-stores",
  "hoper.gr": "travel",
  "idealofsweden.gr": "technology",
  "idolosalon.gr": "beauty",
  "ikiru.gr": "home",
  "absolutemassageandspa.gr": "spa-wellness",
  "365pharmacy.gr": "pharmacy",
  "5star-travel.gr": "travel",
  "adventurejunkies.gr": "experiences",
  "aegeanair.com": "travel",
  "agathou.gr": "spa-wellness",
  "alldaypharmacy.gr": "pharmacy",
  "aldoshoes.gr": "fashion",
  "alteregofashion.gr": "fashion",
  "ame30.gr": "fashion",
  "animusmassage.gr": "spa-wellness",
  "anastasiasstore.gr": "fashion",
  "annamariamazaraki.gr": "jewelry-watches",
  "antonellakids.gr": "kids-baby",
  "anviacandles.gr": "home",
  "apparelstores.gr": "fashion",
  "archaeotours.gr": "experiences",
  "armoniawellness.gr": "spa-wellness",
  "astrongameclub.gr": "gaming",
  "athensgreen.gr": "hotels",
  "athensmassagecenter.gr": "spa-wellness",
  "athenssportsmassage.gr": "spa-wellness",
  "athinatzika.gr": "spa-wellness",
  "atmospherespa.gr": "spa-wellness",
  "avgerinospharmacy.gr": "pharmacy",
  "babydream.gr": "kids-baby",
  "babybean.gr": "kids-baby",
  "babybluecollections.gr": "kids-baby",
  "babyvalia.gr": "kids-baby",
  "balootoys.gr": "kids-baby",
  "bambinokids.gr": "kids-baby",
  "beababy.gr": "kids-baby",
  "beautyclinic.gr": "beauty",
  "beautyandnails.gr": "beauty",
  "beautybliss.gr": "beauty",
  "beautycityspa.gr": "spa-wellness",
  "beautylink.gr": "beauty",
  "beautypeak.gr": "beauty",
  "beautyprincess.gr": "beauty",
  "beautyworldbydg.gr": "beauty",
  "bebestars.gr": "kids-baby",
  "bekids.gr": "kids-baby",
  "benessere.gr": "spa-wellness",
  "bestpharmacy.gr": "pharmacy",
  "bimboshoes.gr": "fashion",
  "blinefashion.gr": "fashion",
  "bloomingbaby.gr": "kids-baby",
  "bodywise.gr": "sports",
  "borsanuova.gr": "fashion",
  "brigitteboutique.gr": "fashion",
  "buzzsneakers.gr": "fashion",
  "bwoman.gr": "fashion",
  "candlejuice.gr": "home",
  "candles-essences.gr": "home",
  "cakeshop.gr": "food-delivery",
  "camper.com": "fashion",
  "caraveltravel.gr": "travel",
  "carouselshoes.gr": "fashion",
  "cavadelvino.gr": "food-delivery",
  "centroboutique.gr": "fashion",
  "champselysees.gr": "spa-wellness",
  "cherrybox.gr": "beauty",
  "completetravel.gr": "travel",
  "coffeelovers.gr": "food-delivery",
  "cougarsport.gr": "sports",
  "decolight.gr": "home",
  "decomagia.gr": "home",
  "deltarestaurant.gr": "restaurants",
  "dariayoga.gr": "spa-wellness",
  "desenio.gr": "home",
  "despykboutique.gr": "fashion",
  "diastours.gr": "travel",
  "didocosmetics.gr": "beauty",
  "dionysioumedispa.com": "spa-wellness",
  "doctorfish.gr": "spa-wellness",
  "dreamypicnics.gr": "experiences",
  "dromeasbikes.gr": "sports",
  "eboxing.gr": "sports",
  "efantasy.gr": "gaming",
  "efarmakeio.gr": "pharmacy",
  "electrocrete.gr": "technology",
  "eightboutiquegym.gr": "sports",
  "elbeauty.gr": "beauty",
  "elenabeautyhall.gr": "beauty",
  "ellievfashion.gr": "fashion",
  "emmahome.gr": "home",
  "enploeditions.gr": "books",
  "epiploset.gr": "home",
  "eroscandles.gr": "home",
  "eshop.gr": "technology",
  "eunoiacandle.gr": "home",
  "fatalbeautylab.gr": "beauty",
  "feelmadness.gr": "sports",
  "floraplant.gr": "home",
  "formyskin.gr": "beauty",
  "francesca.gr": "jewelry-watches",
  "freerider.gr": "sports",
  "freudoriental.gr": "restaurants",
  "funkymonkeyshoes.gr": "fashion",
  "germanos.gr": "technology",
  "gofishome.gr": "home",
  "grandpharmacy.gr": "pharmacy",
  "gruppobizzaro.gr": "fashion",
  "gymbeam.gr": "sports",
  "hammam.gr": "spa-wellness",
  "healthypetspharmacy.gr": "pharmacy",
  "hebekidshome.gr": "kids-baby",
  "hellenictrain.gr": "travel",
  "hellobabyshop.gr": "kids-baby",
  "hellokids.gr": "kids-baby",
  "himalayatravel.gr": "travel",
  "hintsdeco.com": "home",
  "holokolo.gr": "sports",
  "homemarkt.gr": "home",
  "honeykids.gr": "kids-baby",
  "hshome.gr": "home",
  "ikea.gr": "home",
  "insidehome.gr": "home",
  "instyleshop.gr": "fashion",
  "inspirenails.gr": "beauty",
  "invoidspa.gr": "spa-wellness",
  "iridaspa.gr": "spa-wellness",
  "iasispa.gr": "spa-wellness",
  "iosifidishome.gr": "home",
  "janeiredale.gr": "beauty",
  "jthomedesign.gr": "home",
  "jukebooks.gr": "books",
  "juniorkids.gr": "kids-baby",
  "k-skin.gr": "beauty",
  "kanellopoulos.gr": "department-stores",
  "karam-crete.gr": "spa-wellness",
  "karam.gr": "spa-wellness",
  "katoflitavern.gr": "restaurants",
  "kiddoworld.gr": "kids-baby",
  "kidscom.gr": "kids-baby",
  "kidsfashion.gr": "kids-baby",
  "kikocosmetics.gr": "beauty",
  "kikoo.gr": "kids-baby",
  "kitabu.gr": "books",
  "koukidabookstore.gr": "books",
  "kouskoufashionproject.gr": "fashion",
  "kovemykonos.gr": "hotels",
  "krikisbeauty.gr": "beauty",
  "kulina.gr": "home",
  "lamillou.gr": "kids-baby",
  "lav-perfumes.gr": "beauty",
  "lemontreekids.gr": "kids-baby",
  "lovefashionpoint.gr": "fashion",
  "lovelykids.gr": "kids-baby",
  "lumina.gr": "beauty",
  "luxurycandles.gr": "home",
  "luxurylivingspa.gr": "spa-wellness",
  "magnoliabeauty.gr": "beauty",
  "makenzy.gr": "fashion",
  "maniashome.gr": "home",
  "marilynboutique.gr": "fashion",
  "massage-crete.com": "spa-wellness",
  "massagejoy.gr": "spa-wellness",
  "mavrogiannistravel.gr": "travel",
  "medithea-eshop.gr": "beauty",
  "megafitness.gr": "sports",
  "melispa.gr": "spa-wellness",
  "mentortravel.gr": "travel",
  "metaixmio.gr": "books",
  "mfbeautysalon.gr": "beauty",
  "mfdayspa.gr": "spa-wellness",
  "michanossport.gr": "sports",
  "molliashoes.gr": "fashion",
  "morfibeauty.gr": "beauty",
  "mouyer.gr": "kids-baby",
  "msystems.gr": "technology",
  "mustmenfashion.gr": "fashion",
  "mybabylinen.gr": "kids-baby",
  "mybeautybox.gr": "beauty",
  "myconian-naia.gr": "hotels",
  "myconianimperial.gr": "hotels",
  "myconianutopia.gr": "hotels",
  "myprotein.gr": "sports",
  "naninails.gr": "beauty",
  "nativis.gr": "beauty",
  "newaypharmacy.gr": "pharmacy",
  "nextsystems.gr": "technology",
  "newmom.gr": "kids-baby",
  "niyamas-yoga.com": "spa-wellness",
  "notino.gr": "beauty",
  "notos.gr": "department-stores",
  "omhomestudio.com": "spa-wellness",
  "olive-era.gr": "food-delivery",
  "osteriamamma.gr": "restaurants",
  "outdoorshop.gr": "sports",
  "outdoorway.gr": "sports",
  "paidikasymeon.gr": "kids-baby",
  "pamemassage.gr": "spa-wellness",
  "paokfc.gr": "sports",
  "parnassoshiking.gr": "experiences",
  "parousiafashion.gr": "fashion",
  "patistascosmetics.gr": "beauty",
  "pelopslandtravel.gr": "travel",
  "pharmnet.gr": "pharmacy",
  "philsgranola.gr": "food-delivery",
  "philatravel.gr": "travel",
  "phoskitchenware.gr": "home",
  "physiowellnessathens.com": "spa-wellness",
  "physis-fitnessclub.gr": "sports",
  "piedini.gr": "fashion",
  "plantoys.gr": "kids-baby",
  "plaisio.gr": "technology",
  "polis-hammam.gr": "spa-wellness",
  "politikos-shop.gr": "fashion",
  "pnn-nightwear.gr": "fashion",
  "powerpharm.gr": "pharmacy",
  "pregnancy-gifts.gr": "kids-baby",
  "prenatal.gr": "kids-baby",
  "projectshops.gr": "fashion",
  "propercretanguide.gr": "experiences",
  "proswimwear.gr": "sports",
  "psichogios.gr": "books",
  "psomiadishome.gr": "home",
  "radiodaysfashion.gr": "fashion",
  "regalinas.gr": "fashion",
  "rococo.gr": "fashion",
  "romina-hairstyle.gr": "beauty",
  "rundome.gr": "sports",
  "royalhair.gr": "beauty",
  "sacjeans.gr": "fashion",
  "sakkoulasbooks.gr": "books",
  "salondemassage.gr": "spa-wellness",
  "sandalista.gr": "fashion",
  "semiology.gr": "fashion",
  "sephora.gr": "beauty",
  "shoebox.gr": "fashion",
  "shoelover.gr": "fashion",
  "skakistikokentro.com": "gaming",
  "skincareplus.gr": "beauty",
  "skyexpress.gr": "travel",
  "slamdunk.gr": "sports",
  "somatherapy.gr": "spa-wellness",
  "spanails-delmaresole.gr": "beauty",
  "spaprive.gr": "spa-wellness",
  "spaspanio.gr": "spa-wellness",
  "sportcafe.gr": "sports",
  "sportys.gr": "sports",
  "spitispa.gr": "spa-wellness",
  "stellaisland.gr": "hotels",
  "studiocalma.gr": "home",
  "sweetnspicy.gr": "food-delivery",
  "techframe.gr": "technology",
  "tenplushair.gr": "beauty",
  "thebodyshop.gr": "beauty",
  "theplants.gr": "home",
  "thescentlab.gr": "beauty",
  "thewinezoo.gr": "food-delivery",
  "thermespa.gr": "spa-wellness",
  "thinkfit.gr": "sports",
  "threadboutique.gr": "fashion",
  "toysfirst.gr": "kids-baby",
  "topgreekwines.gr": "food-delivery",
  "travelagency.gr": "travel",
  "trapped.gr": "experiences",
  "tsakirismallas.gr": "fashion",
  "tsiantakishome.gr": "home",
  "ullapopken.gr": "fashion",
  "unisport.gr": "sports",
  "vassilenas.gr": "restaurants",
  "vasilitakidswear.gr": "kids-baby",
  "vavoulistours.gr": "travel",
  "villailias.gr": "hotels",
  "vivliopoleiopataki.gr": "books",
  "websupplies.gr": "technology",
  "wolt.com": "food-delivery",
  "wildsouls.gr": "food-delivery",
  "wine24shop.gr": "food-delivery",
  "ydrospa.gr": "spa-wellness",
  "younails.gr": "beauty",
  "yourbabystore.gr": "kids-baby",
  "yourmassage.gr": "spa-wellness",
  "zairacollection.gr": "home",
  "zakroshoes.gr": "fashion",
  "zerogravity.gr": "sports",
  "zumbashop.gr": "sports",
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .trim();
}

function domainFrom(value?: string | null) {
  if (!value) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
    return (getDomain(host) || host).replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else current += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      values.push(current);
      current = "";
    } else current += character;
  }
  values.push(current);
  return values;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

function resolveSourceCategory(rawCategory: string, cardText: string): CategorySlug | null {
  const normalized = rawCategory.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = SOURCE_CATEGORY_MAP[normalized];
  if (direct) return direct;
  if (normalized === "technology_gaming") {
    return /gaming|gamer|games?|playstation|xbox|nintendo|steam/i.test(cardText)
      ? "gaming"
      : "technology";
  }
  if (normalized === "experiences_wellness") {
    return /spa|massage|wellness|therapy|θεραπει/i.test(cardText)
      ? "spa-wellness"
      : "experiences";
  }
  return CATEGORY_SLUGS.has(normalized as CategorySlug) ? (normalized as CategorySlug) : null;
}

function inferQueryCategory(query: string): CategorySlug | null {
  const value = normalizeText(query);
  const matches = KEYWORD_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.category);
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : null;
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function immutableReportPath(filePath: string, planId: string) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${planId.slice(0, 16)}${parsed.ext}`);
}

async function buildPlan(): Promise<Plan> {
  const [cards, scans, categories] = await Promise.all([
    prisma.giftCard.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        shortDescription: true,
        officialUrl: true,
        merchant: { select: { name: true, websiteUrl: true } },
        categories: { select: { category: { select: { slug: true } } } },
      },
    }),
    prisma.merchantDiscoveryScan.findMany({
      where: { category: { not: null } },
      select: { merchantDomain: true, category: true },
    }),
    prisma.category.findMany({ where: { active: true }, select: { slug: true } }),
  ]);

  const available = new Set(categories.map((category) => category.slug));
  for (const slug of CATEGORY_SLUGS) {
    if (!available.has(slug)) throw new Error(`Required active category is missing: ${slug}`);
  }

  const sourceByDomain = new Map<string, Array<{ rawCategory: string; source: string; weight: number }>>();
  const addSource = (domain: string, rawCategory: string, source: string, weight: number) => {
    if (!domain || !rawCategory) return;
    const list = sourceByDomain.get(domain) || [];
    const sourceGroup = source.split("|")[0];
    if (!list.some((item) => item.rawCategory === rawCategory && item.source.split("|")[0] === sourceGroup)) {
      list.push({ rawCategory, source, weight });
      sourceByDomain.set(domain, list);
    }
  };

  for (const scan of scans) {
    addSource(domainFrom(scan.merchantDomain), scan.category || "", "merchant-discovery-scan", 100);
  }

  const discoveryRoot = path.join(process.cwd(), "data", "discovery");
  const evidenceFiles = listFiles(discoveryRoot).filter((filePath) => {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    return (
      normalized.endsWith("merchant-universe.csv") ||
      (normalized.endsWith(".csv") && /(^|[-/])(auto[-_]?safe|safe|second-pass-safe|greek-safe|high-safe)/.test(normalized))
    );
  });

  for (const filePath of evidenceFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    for (const row of parseCsv(fs.readFileSync(filePath, "utf8"))) {
      const domain = domainFrom(
        row.domain || row.merchantDomain || row.website_url || row.websiteUrl || row.possible_official_url || row.possibleOfficialUrl,
      );
      if (!domain) continue;
      const explicitCategory = row.category?.trim();
      // The historical merchant-universe/category CSVs are useful supporting
      // evidence, but not authoritative enough to classify a card by themselves.
      if (explicitCategory) addSource(domain, explicitCategory, `historical-category|${relative}`, 78);
      const queryCategory = inferQueryCategory(row.query || "");
      if (queryCategory) addSource(domain, queryCategory, `historical-query|${relative}`, 72);
    }
  }

  const snapshots: Snapshot[] = cards.map((card) => ({
    id: card.id,
    title: card.title,
    slug: card.slug,
    merchantName: card.merchant.name,
    websiteUrl: card.merchant.websiteUrl,
    officialUrl: card.officialUrl,
    currentCategorySlugs: card.categories.map((item) => item.category.slug).sort(),
  }));
  const targets = cards.filter((card) => card.categories.length === 0);
  const actions: Action[] = [];
  const reviews: Review[] = [];

  for (const card of targets) {
    const merchantDomain = domainFrom(card.merchant.websiteUrl || card.officialUrl);
    const cardText = normalizeText(
      [card.merchant.name, card.title, card.shortDescription, merchantDomain].filter(Boolean).join(" "),
    );
    const evidence: Evidence[] = [];

    const curatedCategory = CURATED_DOMAIN_CATEGORIES[merchantDomain];
    if (curatedCategory) {
      evidence.push({
        category: curatedCategory,
        source: `operator-curated-exact-domain:${merchantDomain}`,
        weight: 125,
      });
    }

    for (const source of sourceByDomain.get(merchantDomain) || []) {
      const category = resolveSourceCategory(source.rawCategory, cardText);
      if (category) evidence.push({ category, source: `${source.source}:${source.rawCategory}`, weight: source.weight });
    }

    const keywordMatches = KEYWORD_RULES.filter((rule) => rule.pattern.test(cardText));
    if (keywordMatches.length === 1) {
      evidence.push({
        category: keywordMatches[0].category,
        source: `unambiguous-merchant-keyword:${keywordMatches[0].category}`,
        weight: 84,
      });
    }

    const grouped = new Map<CategorySlug, { score: number; evidence: string[] }>();
    for (const item of evidence) {
      const current = grouped.get(item.category) || { score: 0, evidence: [] };
      if (!current.evidence.includes(item.source)) current.evidence.push(item.source);
      current.score = Math.max(current.score, item.weight);
      grouped.set(item.category, current);
    }
    for (const value of grouped.values()) value.score += Math.min(18, Math.max(0, value.evidence.length - 1) * 6);

    const candidates = [...grouped.entries()]
      .map(([categorySlug, value]) => ({ categorySlug, ...value }))
      .sort((a, b) => b.score - a.score || a.categorySlug.localeCompare(b.categorySlug));
    const top = candidates[0];
    const second = candidates[1];
    const safe = Boolean(top && top.score >= 84 && top.score - (second?.score || 0) >= 25);

    if (safe && top) {
      actions.push({
        actionId: stableHash([card.id, top.categorySlug, top.evidence]),
        giftCardId: card.id,
        giftCardTitle: card.title,
        giftCardSlug: card.slug,
        merchantName: card.merchant.name,
        merchantDomain,
        categorySlug: top.categorySlug,
        score: top.score,
        evidence: top.evidence,
      });
    } else {
      reviews.push({
        giftCardId: card.id,
        giftCardTitle: card.title,
        merchantName: card.merchant.name,
        merchantDomain,
        reason: candidates.length ? "AMBIGUOUS_CATEGORY_EVIDENCE" : "NO_CATEGORY_EVIDENCE",
        candidates,
      });
    }
  }

  const targetFingerprint = stableHash(snapshots);
  const planWithoutId = {
    version: VERSION,
    mode: "PREVIEW" as const,
    generatedAt: new Date().toISOString(),
    targetFingerprint,
    activeCardCount: cards.length,
    alreadyCategorizedCount: cards.length - targets.length,
    targetCount: targets.length,
    summary: { safe: actions.length, review: reviews.length },
    actions,
    reviews,
    snapshots,
  };
  return { ...planWithoutId, planId: stableHash(planWithoutId) };
}

function readPlan() {
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Missing preview plan: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")) as Plan;
  if (plan.version !== VERSION) throw new Error(`Unsupported plan version: ${plan.version}`);
  if (plan.planId !== PLAN_ID_ARG) throw new Error("Plan ID does not match the saved preview.");
  return plan;
}

async function currentFingerprint() {
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      merchant: { select: { name: true, websiteUrl: true } },
      categories: { select: { category: { select: { slug: true } } } },
    },
  });
  return stableHash(
    cards.map((card) => ({
      id: card.id,
      title: card.title,
      slug: card.slug,
      merchantName: card.merchant.name,
      websiteUrl: card.merchant.websiteUrl,
      officialUrl: card.officialUrl,
      currentCategorySlugs: card.categories.map((item) => item.category.slug).sort(),
    })),
  );
}

async function preview() {
  const plan = await buildPlan();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  const rows = [
    ["status", "giftCardId", "merchantName", "giftCardTitle", "merchantDomain", "categorySlug", "score", "reason", "evidence"],
    ...plan.actions.map((action) => [
      "SAFE",
      action.giftCardId,
      action.merchantName,
      action.giftCardTitle,
      action.merchantDomain,
      action.categorySlug,
      action.score,
      "",
      action.evidence,
    ]),
    ...plan.reviews.map((review) => [
      "REVIEW",
      review.giftCardId,
      review.merchantName,
      review.giftCardTitle,
      review.merchantDomain,
      review.candidates.map((candidate) => `${candidate.categorySlug}:${candidate.score}`),
      "",
      review.reason,
      review.candidates.flatMap((candidate) => candidate.evidence),
    ]),
  ];
  fs.writeFileSync(PLAN_CSV, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
  fs.copyFileSync(PLAN_JSON, immutableReportPath(PLAN_JSON, plan.planId));
  fs.copyFileSync(PLAN_CSV, immutableReportPath(PLAN_CSV, plan.planId));

  console.log("Dorokartes Catalog Taxonomy v1 — PREVIEW");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Active cards: ${plan.activeCardCount}`);
  console.log(`Already categorized: ${plan.alreadyCategorizedCount}`);
  console.log(`Targets without category: ${plan.targetCount}`);
  console.log(`Safe: ${plan.summary.safe}`);
  console.log(`Review: ${plan.summary.review}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log(`CSV: ${PLAN_CSV}`);
  console.log("PREVIEW ONLY — no database rows changed.");
}

async function apply() {
  const plan = readPlan();
  const fingerprint = await currentFingerprint();
  if (fingerprint !== plan.targetFingerprint) {
    throw new Error("Catalog/category state changed after preview. Generate and inspect a new plan.");
  }
  const categoryRows = await prisma.category.findMany({
    where: { slug: { in: [...new Set(plan.actions.map((action) => action.categorySlug))] }, active: true },
    select: { id: true, slug: true },
  });
  const categoryIds = new Map(categoryRows.map((category) => [category.slug, category.id]));
  if (categoryIds.size !== new Set(plan.actions.map((action) => action.categorySlug)).size) {
    throw new Error("One or more planned categories are missing or inactive.");
  }

  await prisma.$transaction([
    prisma.giftCardCategory.createMany({
      data: plan.actions.map((action) => ({
        giftCardId: action.giftCardId,
        categoryId: categoryIds.get(action.categorySlug)!,
        primary: true,
      })),
    }),
  ]);
  const report = { version: VERSION, mode: "APPLY", planId: plan.planId, appliedAt: new Date().toISOString(), applied: plan.actions.length };
  fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(APPLY_JSON, immutableReportPath(APPLY_JSON, plan.planId));
  console.log("Dorokartes Catalog Taxonomy v1 — APPLY");
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Applied: ${plan.actions.length}`);
  console.log(`Report: ${APPLY_JSON}`);
}

async function postAudit() {
  const plan = readPlan();
  const rows = await prisma.giftCardCategory.findMany({
    where: { giftCardId: { in: plan.actions.map((action) => action.giftCardId) } },
    select: { giftCardId: true, primary: true, category: { select: { slug: true } } },
  });
  const passed = plan.actions.filter((action) =>
    rows.some(
      (row) => row.giftCardId === action.giftCardId && row.category.slug === action.categorySlug && row.primary,
    ),
  );
  const failed = plan.actions.filter((action) => !passed.includes(action));
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    planId: plan.planId,
    auditedAt: new Date().toISOString(),
    checked: plan.actions.length,
    passed: passed.length,
    failed: failed.map((action) => action.actionId),
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.copyFileSync(POST_AUDIT_JSON, immutableReportPath(POST_AUDIT_JSON, plan.planId));
  console.log("Dorokartes Catalog Taxonomy v1 — POST-AUDIT");
  console.log(`Checked: ${report.checked}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed.length}`);
  console.log(`Report: ${POST_AUDIT_JSON}`);
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
