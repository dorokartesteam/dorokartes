import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import GiftCardCard from "@/components/public/GiftCardCard";
import { prisma } from "@/lib/prisma";
import { publicCardSelect } from "@/lib/public/data";

export const dynamic = "force-dynamic";

const fallbackBaseUrl = "https://dorokartes.gr";
const pagePath = "/kaliteres-dorokartes";

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackBaseUrl;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const metadata: Metadata = {
  title: "Καλύτερες Δωροκάρτες στην Ελλάδα | Dorokartes.gr",
  description: "Ανακάλυψε δωροκάρτες στην Ελλάδα για τεχνολογία, μόδα, beauty, ταξίδια, παιδιά, spa και εμπειρίες. Σύγκρινε επιλογές και βρες αυτή που ταιριάζει στην περίσταση.",
  alternates: { canonical: pagePath },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Καλύτερες Δωροκάρτες στην Ελλάδα | Dorokartes.gr",
    description: "Οδηγός ανακάλυψης δωροκαρτών στην Ελλάδα ανά κατηγορία, περίσταση και παραλήπτη.",
    url: pagePath,
    type: "website",
    locale: "el_GR",
  },
};

const categoryLinks = [
  ["/categories/technology", "Τεχνολογία", "Για κινητά, υπολογιστές, gaming, gadgets και ηλεκτρονικές συσκευές."],
  ["/categories/fashion", "Μόδα", "Για ρούχα, παπούτσια και αξεσουάρ χωρίς να χρειάζεται να διαλέξεις συγκεκριμένο μέγεθος."],
  ["/categories/beauty", "Beauty & περιποίηση", "Για καλλυντικά, αρώματα, skincare και προϊόντα προσωπικής φροντίδας."],
  ["/categories/spa-wellness", "Spa & wellness", "Για massage, θεραπείες, χαλάρωση και εμπειρίες ευεξίας."],
  ["/categories/travel", "Ταξίδια", "Για αεροπορικές, ξενοδοχεία και ταξιδιωτικές εμπειρίες."],
  ["/categories/kids-baby", "Παιδιά & μωρό", "Για παιχνίδια, παιδικά είδη, βρεφικά προϊόντα και νέους γονείς."],
  ["/categories/food-delivery", "Φαγητό & delivery", "Μια εύκολη επιλογή για φαγητό, delivery και καθημερινές απολαύσεις."],
  ["/categories/experiences", "Εμπειρίες", "Για δραστηριότητες, εκδρομές, μαθήματα και δώρα που δεν είναι απλώς αντικείμενα."],
] as const;

const occasionLinks = [
  ["/occasions/birthday", "Γενέθλια"],
  ["/browse?occasion=for-her", "Για γυναίκα"],
  ["/browse?occasion=for-him", "Για άντρα"],
  ["/occasions/for-kids", "Για παιδιά"],
  ["/occasions/new-baby", "Για νέο μωρό"],
] as const;

const faq = [
  ["Ποια είναι η καλύτερη δωροκάρτα;", "Δεν υπάρχει μία καλύτερη δωροκάρτα για όλους. Η σωστή επιλογή εξαρτάται από τα ενδιαφέροντα του παραλήπτη, την περίσταση και το πόσο ελεύθερη επιλογή θέλεις να του δώσεις."],
  ["Πού μπορώ να αγοράσω δωροκάρτα;", "Η αγορά πραγματοποιείται από το αντίστοιχο brand ή επιχείρηση. Το Dorokartes.gr είναι πλατφόρμα ανακάλυψης και σε κατευθύνει στην επίσημη πηγή για τις τρέχουσες πληροφορίες αγοράς."],
  ["Υπάρχουν δωροκάρτες που αγοράζονται online;", "Ναι, αρκετές επιχειρήσεις διαθέτουν online ή ηλεκτρονικές δωροκάρτες. Η διαθεσιμότητα, η αποστολή και οι όροι διαφέρουν ανά brand και πρέπει να επιβεβαιώνονται από την επίσημη πηγή."],
  ["Οι δωροκάρτες λήγουν;", "Οι όροι διάρκειας δεν είναι ίδιοι για όλες τις δωροκάρτες. Πριν από την αγορά πρέπει να ελέγχεται η διάρκεια ισχύος και οι όροι του εκδότη."],
  ["Μπορεί μια δωροκάρτα να χρησιμοποιηθεί online;", "Εξαρτάται από τη συγκεκριμένη δωροκάρτα. Ορισμένες χρησιμοποιούνται online, άλλες σε φυσικά καταστήματα και κάποιες υποστηρίζουν περισσότερους από έναν τρόπους εξαργύρωσης."],
  ["Είναι το Dorokartes.gr κατάστημα;", "Όχι. Το Dorokartes.gr είναι πλατφόρμα ανακάλυψης δωροκαρτών και δεν πραγματοποιεί την πώληση των καρτών."],
] as const;

async function getPageData() {
  const [cards, totalVerified] = await Promise.all([
    prisma.giftCard.findMany({
      where: { status: "ACTIVE", verificationStatus: "VERIFIED" },
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: 12,
      select: publicCardSelect,
    }),
    prisma.giftCard.count({ where: { status: "ACTIVE", verificationStatus: "VERIFIED" } }),
  ]);
  return { cards, totalVerified };
}

export default async function BestGiftCardsPage() {
  const { cards, totalVerified } = await getPageData();
  const baseUrl = getBaseUrl();
  const pageUrl = `${baseUrl}${pagePath}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${pageUrl}#page`, name: "Καλύτερες δωροκάρτες στην Ελλάδα", description: "Οδηγός ανακάλυψης δωροκαρτών στην Ελλάδα ανά κατηγορία, περίσταση και παραλήπτη.", url: pageUrl, inLanguage: "el-GR", mainEntity: { "@id": `${pageUrl}#gift-cards` } },
      { "@type": "ItemList", "@id": `${pageUrl}#gift-cards`, name: "Επιλεγμένες verified δωροκάρτες", numberOfItems: cards.length, itemListElement: cards.map((card, index) => ({ "@type": "ListItem", position: index + 1, name: `${card.merchant?.name || "Gift Card"} — ${card.title}`, url: `${baseUrl}/gift-cards/${encodeURIComponent(card.slug)}` })) },
      { "@type": "FAQPage", "@id": `${pageUrl}#faq`, mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      { "@type": "BreadcrumbList", "@id": `${pageUrl}#breadcrumbs`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Αρχική", item: `${baseUrl}/` },
        { "@type": "ListItem", position: 2, name: "Καλύτερες δωροκάρτες", item: pageUrl },
      ] },
    ],
  };

  return (
    <div className="dk14-site">
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <main>
        <section className="dk14-shell" style={{ paddingTop: "56px", paddingBottom: "28px" }}>
          <p style={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "10px" }}>Οδηγός επιλογής</p>
          <h1 style={{ maxWidth: "900px", margin: 0 }}>Οι καλύτερες δωροκάρτες στην Ελλάδα</h1>
          <p style={{ maxWidth: "850px", marginTop: "18px", fontSize: "1.08rem", lineHeight: 1.8 }}>Ψάχνεις δωροκάρτα αλλά δεν ξέρεις ποια να διαλέξεις; Στο Dorokartes.gr μπορείς να ανακαλύψεις verified δωροκάρτες από διαφορετικά brands και κατηγορίες, συγκεντρωμένες σε ένα μέρος.</p>
          <p style={{ maxWidth: "850px", lineHeight: 1.8 }}>Δεν υπάρχει μία αντικειμενικά καλύτερη δωροκάρτα για όλους. Η κατάλληλη επιλογή εξαρτάται από τον παραλήπτη, την περίσταση και το είδος δώρου που θέλεις να κάνεις. Το Dorokartes.gr δεν πουλά δωροκάρτες· σε βοηθά να τις ανακαλύψεις και να συνεχίσεις στην επίσημη σελίδα του αντίστοιχου brand.</p>
          <div className="dk-public-filter-row" style={{ marginTop: "20px" }}>
            <Link href="/browse">Όλες οι δωροκάρτες</Link><Link href="/categories">Κατηγορίες</Link><Link href="/occasions">Περιστάσεις</Link><Link href="/regions">Περιοχές</Link>
          </div>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "12px", paddingBottom: "46px" }}>
          <div className="dk25-taxonomy-results"><div><span>ΕΠΙΛΕΓΜΕΝΕΣ VERIFIED ΕΠΙΛΟΓΕΣ</span><h2>{totalVerified.toLocaleString("el-GR")} verified δωροκάρτες στο Dorokartes.gr</h2></div><Link href="/browse">Όλος ο κατάλογος <b>→</b></Link></div>
          <div className="dk-public-card-grid dk-public-browse-grid">{cards.map((card) => <GiftCardCard key={card.id} card={card} />)}</div>
          <p style={{ marginTop: "16px", lineHeight: 1.7 }}>Οι παραπάνω επιλογές δεν αποτελούν αντικειμενική κατάταξη ή αξιολόγηση brands. Προβάλλονται verified καταχωρίσεις από τον κατάλογο του Dorokartes.gr.</p>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "24px", paddingBottom: "48px" }}>
          <h2>Διάλεξε δωροκάρτα ανά κατηγορία</h2>
          <p style={{ maxWidth: "820px", lineHeight: 1.8 }}>Αν δεν ξέρεις από πού να ξεκινήσεις, σκέψου πρώτα τα ενδιαφέροντα του παραλήπτη. Η κατηγορία είναι συνήθως πιο χρήσιμη αφετηρία από ένα συγκεκριμένο brand.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginTop: "22px" }}>
            {categoryLinks.map(([href,title,text]) => <article key={href} style={{ border: "1px solid rgba(127,127,127,.22)", borderRadius: "18px", padding: "20px" }}><h3 style={{ marginTop: 0 }}>{title}</h3><p style={{ lineHeight: 1.7 }}>{text}</p><Link href={href}>Δες επιλογές →</Link></article>)}
          </div>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "24px", paddingBottom: "48px" }}>
          <h2>Δωροκάρτες ανά περίσταση</h2><p style={{ maxWidth: "820px", lineHeight: 1.8 }}>Μπορείς επίσης να ξεκινήσεις από την περίσταση ή το άτομο για το οποίο ψάχνεις δώρο.</p>
          <nav className="dk-public-filter-row" aria-label="Δωροκάρτες ανά περίσταση" style={{ marginTop: "18px" }}>{occasionLinks.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "24px", paddingBottom: "48px" }}>
          <h2>Online και ηλεκτρονικές δωροκάρτες</h2>
          <p style={{ maxWidth: "850px", lineHeight: 1.8 }}>Ορισμένες δωροκάρτες μπορούν να αγοραστούν ηλεκτρονικά ή να αποσταλούν ψηφιακά. Οι όροι όμως διαφέρουν από brand σε brand. Πριν από οποιαδήποτε αγορά, έλεγξε στην επίσημη ιστοσελίδα του εκδότη αν η δωροκάρτα αγοράζεται online, πώς αποστέλλεται, πού εξαργυρώνεται, ποια ποσά είναι διαθέσιμα και αν υπάρχει ημερομηνία λήξης.</p>
          <Link href="/browse">Ανακάλυψε δωροκάρτες →</Link>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "24px", paddingBottom: "48px" }}>
          <h2>Γιατί Dorokartes.gr</h2>
          <p style={{ maxWidth: "850px", lineHeight: 1.8 }}>Αντί να ψάχνεις ξεχωριστά σε δεκάδες websites, το Dorokartes.gr συγκεντρώνει δωροκάρτες από διαφορετικές κατηγορίες και brands ώστε να μπορείς να ανακαλύψεις πιο εύκολα τις διαθέσιμες επιλογές.</p>
          <p style={{ maxWidth: "850px", lineHeight: 1.8 }}>Οι verified καταχωρίσεις βασίζονται σε τεκμηρίωση που έχει ελεγχθεί από το Dorokartes.gr. Η τελική αγορά και οι ισχύοντες όροι καθορίζονται πάντα από το brand ή την επιχείρηση που εκδίδει τη δωροκάρτα.</p>
        </section>

        <section className="dk14-shell" style={{ paddingTop: "24px", paddingBottom: "64px" }}>
          <h2>Συχνές ερωτήσεις</h2>
          <div style={{ display: "grid", gap: "14px", marginTop: "20px" }}>{faq.map(([question,answer]) => <details key={question} style={{ border: "1px solid rgba(127,127,127,.22)", borderRadius: "14px", padding: "16px 18px" }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>{question}</summary><p style={{ lineHeight: 1.75, marginBottom: 0 }}>{answer}</p></details>)}</div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
