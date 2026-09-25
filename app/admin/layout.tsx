import "@/app/admin/admin.css";
import "@/app/admin/cms-extra.css";
import "@/app/admin/brand-extra.css";
import "@/app/admin/readiness.css";
import "@/app/admin/launch.css";
import "@/app/admin/remediation.css";
import "@/app/admin/media.css";
import "@/app/admin/admin-scale.css";
import "@/app/admin/admin-final.css";
import AdminShell from "@/components/admin/AdminShell";
import { Geist } from "next/font/google";
import "@/app/admin/v4-1-extra.css";
import "@/app/admin/v4-2-verification.css";
import "@/app/admin/v4-3-premium-readability.css";
import "@/app/admin/v4-4-detail-workspace.css";
import "@/app/admin/v4-5-merchant-management.css";
import "@/app/admin/v4-6-revenue.css";
import "@/app/admin/v4-7-activation.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-admin",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={geist.variable}><AdminShell>{children}</AdminShell></div>;
}
