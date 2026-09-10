import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import NearMeButton from "@/components/public/NearMeButton";
import RegionLocationCard from "@/components/public/RegionLocationCard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Δωροκάρτες ανά περιοχή",
  description: "Βρες εμπόρους με δωροκάρτες ανά πόλη και περιοχή, μέσα από επαληθευμένα φυσικά σημεία σε όλη την Ελλάδα.",
  alternates: { canonical: "/regions" },
  openGraph: {
    title: "Δωροκάρτες ανά περιοχή",
    description: "Βρες εμπόρους με δωροκάρτες ανά πόλη και περιοχή, μέσα από επαληθευμένα φυσικά σημεία σε όλη την Ελλάδα.",
    url: "/regions",
  },
};

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR");
}

function validCoordinate(value: string | undefined, min: number, max: number) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function plausibleGreekLocationCoordinates(latitude: unknown, longitude: unknown) {
  const lat = validCoordinate(latitude == null ? undefined : String(latitude), 34, 42.5);
  const lng = validCoordinate(longitude == null ? undefined : String(longitude), 18, 30);
  return lat != null && lng != null ? { lat, lng } : null;
}

function distanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; q?: string; lat?: string; lng?: string }>;
}) {
  const params = await searchParams;
  const userLat = validCoordinate(params.lat, -90, 90);
  const userLng = validCoordinate(params.lng, -180, 180);
  const hasUserLocation = userLat != null && userLng != null;
  const allLocations = await prisma.merchantLocation.findMany({
    where: {
      active: true,
      verificationStatus: "VERIFIED",
      merchant: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    },
    orderBy: [{ administrativeArea: "asc" }, { city: "asc" }, { merchant: { name: "asc" } }],
    select: {
      id: true,
      label: true,
      addressLine: true,
      postalCode: true,
      city: true,
      area: true,
      administrativeArea: true,
      sourceUrl: true,
      latitude: true,
      longitude: true,
      merchant: {
        select: {
          name: true,
          slug: true,
          logoUrl: true,
          _count: {
            select: { giftCards: { where: { status: "ACTIVE" } } },
          },
          giftCards: {
            where: { status: "ACTIVE" },
            orderBy: [{ featured: "desc" }, { title: "asc" }],
            take: 1,
            select: {
              id: true,
              title: true,
              slug: true,
              categories: {
                where: { primary: true },
                take: 1,
                select: { category: { select: { name: true } } },
              },
            },
          },
        },
      },
      giftCardCapabilities: {
        where: {
          available: true,
          verificationStatus: "VERIFIED",
          giftCard: { status: "ACTIVE" },
        },
        select: {
          giftCardId: true,
          capability: true,
          giftCard: {
            select: {
              id: true,
              title: true,
              slug: true,
              categories: {
                where: { primary: true },
                take: 1,
                select: { category: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const cityCounts = [...allLocations.reduce((map, location) => {
    map.set(location.city, (map.get(location.city) || 0) + 1);
    return map;
  }, new Map<string, number>())]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "el"));
  const regionCount = new Set(allLocations.map((location) => location.administrativeArea).filter(Boolean)).size;
  const merchantCount = new Set(allLocations.map((location) => location.merchant.name)).size;
  const selectedCity = params.city && cityCounts.some((entry) => entry.city === params.city) ? params.city : "";
  const query = params.q?.trim() || "";
  const normalizedQuery = normalizedSearch(query);
  const visibleLocations = allLocations
    .map((location) => {
      const coordinates = plausibleGreekLocationCoordinates(location.latitude, location.longitude);
      return {
        ...location,
        distanceKm: hasUserLocation && coordinates
          ? distanceKm(userLat, userLng, coordinates.lat, coordinates.lng)
          : null,
      };
    })
    .filter((location) => {
      if (selectedCity && location.city !== selectedCity) return false;
      if (!normalizedQuery) return true;
      return normalizedSearch([
        location.merchant.name,
        location.label,
        location.addressLine,
        location.postalCode,
        location.city,
        location.area,
      ].filter(Boolean).join(" ")).includes(normalizedQuery);
    })
    .sort((a, b) => hasUserLocation ? (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) : 0);
  const regionsHref = (city = "") => {
    const next = new URLSearchParams();
    if (city) next.set("city", city);
    if (query) next.set("q", query);
    if (hasUserLocation) {
      next.set("lat", String(userLat));
      next.set("lng", String(userLng));
    }
    const value = next.toString();
    return value ? `/regions?${value}` : "/regions";
  };

  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk26-regions-page">
        <div className="dk20-shell">
          <section className="dk28-regions-hero">
            <div className="dk28-regions-copy">
              <span>ΕΠΑΛΗΘΕΥΜΕΝΑ ΦΥΣΙΚΑ ΣΗΜΕΙΑ</span>
              <h1>Βρες δωροκάρτες εκεί που βρίσκεσαι.</h1>
              <p>
                Ανακάλυψε εμπόρους με πραγματική, τεκμηριωμένη διεύθυνση. Η αγορά ή εξαργύρωση
                μέσα στο κατάστημα εμφανίζεται μόνο όταν έχει επιβεβαιωθεί ξεχωριστά.
              </p>
              <form className="dk28-region-search" action="/regions">
                <label htmlFor="region-query">Αναζήτησε πόλη, περιοχή ή κατάστημα</label>
                <div>
                  <input id="region-query" name="q" defaultValue={query} placeholder="π.χ. Περιστέρι ή spa" />
                  {selectedCity ? <input type="hidden" name="city" value={selectedCity} /> : null}
                  {hasUserLocation ? <input type="hidden" name="lat" value={String(userLat)} /> : null}
                  {hasUserLocation ? <input type="hidden" name="lng" value={String(userLng)} /> : null}
                  <button type="submit">Αναζήτηση</button>
                </div>
                <NearMeButton />
              </form>
            </div>
            <aside className="dk28-coverage-card" aria-label="Κάλυψη επαληθευμένων περιοχών">
              <span><i aria-hidden="true" /> ΖΩΝΤΑΝΑ ΣΤΟΙΧΕΙΑ ΣΗΜΕΙΩΝ</span>
              <strong>{allLocations.length}</strong>
              <p>επαληθευμένα φυσικά σημεία από επίσημες πηγές</p>
              <div>
                <b>{cityCounts.length}<small>πόλεις</small></b>
                <b>{regionCount}<small>περιφέρειες</small></b>
                <b>{merchantCount}<small>έμποροι</small></b>
              </div>
            </aside>
          </section>

          <section className="dk28-city-directory" aria-labelledby="city-directory-title">
            <div className="dk28-section-heading">
              <div>
                <span>ΕΞΕΡΕΥΝΗΣΗ ΑΝΑ ΠΟΛΗ</span>
                <h2 id="city-directory-title">Δημοφιλείς περιοχές</h2>
              </div>
              <p>Κάθε αριθμός αντιστοιχεί σε ενεργά, επαληθευμένα φυσικά σημεία.</p>
            </div>
            <div className="dk28-city-pills">
              <Link
                prefetch={false}
                className={!selectedCity ? "active" : ""}
                aria-current={!selectedCity ? "page" : undefined}
                href={regionsHref()}
              >
                Όλες <span>{allLocations.length}</span>
              </Link>
              {cityCounts.map((entry) => {
                const active = selectedCity === entry.city;
                return (
                  <Link
                    prefetch={false}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    href={regionsHref(entry.city)}
                    key={entry.city}
                  >
                    {entry.city} <span>{entry.count}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="dk28-location-results" aria-labelledby="location-results-title">
            <div className="dk28-section-heading">
              <div>
                <span>{hasUserLocation ? "ΤΑΞΙΝΟΜΗΣΗ ΜΕ ΒΑΣΗ ΤΗΝ ΑΠΟΣΤΑΣΗ" : selectedCity ? `ΠΕΡΙΟΧΗ · ${selectedCity}` : "ΠΡΑΓΜΑΤΙΚΕΣ ΔΙΕΥΘΥΝΣΕΙΣ"}</span>
                <h2 id="location-results-title">{visibleLocations.length} φυσικά σημεία</h2>
              </div>
              {(selectedCity || query || hasUserLocation) ? <Link href="/regions">Καθαρισμός φίλτρων</Link> : null}
            </div>
            {visibleLocations.length ? (
              <div className="dk28-location-grid">
                {visibleLocations.map((location) => <RegionLocationCard key={location.id} location={location} distanceKm={location.distanceKm} />)}
              </div>
            ) : (
              <div className="dk28-region-empty">
                <b>Δεν βρέθηκε επαληθευμένο φυσικό σημείο με αυτά τα φίλτρα.</b>
                <p>Η κάλυψη μεγαλώνει σταδιακά καθώς επιβεβαιώνουμε νέες επίσημες διευθύνσεις.</p>
                <Link href="/regions">Δες όλες τις περιοχές</Link>
              </div>
            )}
          </section>

          <aside className="dk28-integrity-note">
            <span aria-hidden="true">i</span>
            <p><b>Τι σημαίνει «επαληθευμένο σημείο»;</b> Η διεύθυνση προέρχεται από επίσημη πηγή του εμπόρου. Δεν σημαίνει αυτόματα ότι η δωροκάρτα αγοράζεται ή εξαργυρώνεται εκεί· αυτή η πληροφορία ελέγχεται και εμφανίζεται ξεχωριστά.</p>
          </aside>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
