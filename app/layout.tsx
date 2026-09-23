import type { Metadata } from "next";
import "./globals.css";
import "./public.css";
import "./public-v1-3.css";
import "./public-v1-4.css";
import "./public-v1-6.css";
import "./public-v1-7.css";
import "./public-v1-8.css";
import "./public-v1-9.css";
import "./public-v2-0.css";
import "./public-v2-2.css";
import "./public-v2-7-premium.css";
import "./public-v3-6-hero.css";
import "./public-v3-7-mobile.css";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

const configuredGaMeasurementId =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

const productionGaMeasurementId =
  process.env.VERCEL_ENV === "production" &&
  /^G-[A-Z0-9]+$/.test(configuredGaMeasurementId)
    ? configuredGaMeasurementId
    : null;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://dorokartes.gr",
  ),

  title: {
    default: "Dorokartes.gr | Όλες οι δωροκάρτες της Ελλάδας σε ένα μέρος",
    template: "%s | Dorokartes.gr",
  },

  description:
    "Ανακάλυψε δωροκάρτες από brands και καταστήματα στην Ελλάδα. Σύγκρινε επιλογές και συνέχισε στο επίσημο site του εμπόρου.",

  applicationName: "Dorokartes.gr",

  alternates: {
    canonical: "/",
  },

  robots: {
    index: true,
    follow: true,
  },

  openGraph: {
    type: "website",
    locale: "el_GR",
    url: "/",
    siteName: "Dorokartes.gr",
    title: "Dorokartes.gr | Όλες οι δωροκάρτες της Ελλάδας σε ένα μέρος",
    description:
      "Ανακάλυψε δωροκάρτες από brands και καταστήματα στην Ελλάδα και συνέχισε στο επίσημο site του εμπόρου.",
  },

  twitter: {
    card: "summary_large_image",
    title: "Dorokartes.gr | Όλες οι δωροκάρτες της Ελλάδας σε ένα μέρος",
    description:
      "Ανακάλυψε δωροκάρτες από brands και καταστήματα στην Ελλάδα και συνέχισε στο επίσημο site του εμπόρου.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el">
      <body>
        {children}
        {productionGaMeasurementId ? (
          <GoogleAnalytics measurementId={productionGaMeasurementId} />
        ) : null}
      </body>
    </html>
  );
}
