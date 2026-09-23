import type {Metadata} from "next";
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
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

const configuredGaMeasurementId =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";

const productionGaMeasurementId =
  process.env.VERCEL_ENV === "production" &&
  /^G-[A-Z0-9]+$/.test(configuredGaMeasurementId)
    ? configuredGaMeasurementId
    : null;

export const metadata:Metadata={
  metadataBase:new URL(
    process.env.NEXT_PUBLIC_APP_URL||"https://dorokartes.gr"
  ),
  title:{
    default:"Dorokartes.gr | ΞΞ»ΞµΟ‚ ΞΏΞΉ Ξ΄Ο‰ΟΞΏΞΊΞ¬ΟΟ„ΞµΟ‚ ΟƒΞµ Ξ­Ξ½Ξ± ΞΌΞ­ΟΞΏΟ‚",
    template:"%s | Dorokartes.gr"
  },
  description:"Ξ‘Ξ½Ξ±ΞΊΞ¬Ξ»Ο…ΟΞµ Ξ΄Ο‰ΟΞΏΞΊΞ¬ΟΟ„ΞµΟ‚ Ξ±Ο€Ο brands ΞΊΞ±ΞΉ ΞΊΞ±Ο„Ξ±ΟƒΟ„Ξ®ΞΌΞ±Ο„Ξ± ΟƒΟ„Ξ·Ξ½ Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ± ΞΊΞ±ΞΉ ΟƒΟ…Ξ½Ξ­Ο‡ΞΉΟƒΞµ ΟƒΟ„ΞΏ ΞµΟ€Ξ―ΟƒΞ·ΞΌΞΏ site Ο„ΞΏΟ… ΞµΞΌΟ€ΟΟΞΏΟ….",
  robots:{index:true,follow:true}
};

export default function RootLayout({
  children
}:{
  children:React.ReactNode
}){
  return (
    <html lang="el">
      <body>
        {children}
        {productionGaMeasurementId
          ? <GoogleAnalytics measurementId={productionGaMeasurementId}/>
          : null}
      </body>
    </html>
  );
}


