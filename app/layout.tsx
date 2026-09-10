import type {Metadata} from "next";import "./globals.css";
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



export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_APP_URL||"https://dorokartes.gr"),title:{default:"Dorokartes.gr | Όλες οι δωροκάρτες σε ένα μέρος",template:"%s | Dorokartes.gr"},description:"Ανακάλυψε δωροκάρτες από brands και καταστήματα στην Ελλάδα και συνέχισε στο επίσημο site του εμπόρου.",robots:{index:true,follow:true}};export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="el"><body>{children}</body></html>}
