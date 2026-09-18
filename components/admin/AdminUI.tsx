import Link from "next/link";
import { ReactNode } from "react";

export function Metric({ label, value, detail, tone = "default" }: { label: string; value: ReactNode; detail?: string; tone?: "default" | "good" | "warn" | "bad" | "purple" }) {
  return <div className={`dk-metric ${tone}`}><div className="dk-metriclabel">{label}</div><div className="dk-metricvalue">{value}</div>{detail && <div className="dk-metricdetail">{detail}</div>}</div>;
}

export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dk-panel ${className}`}><div className="dk-panelhead"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function Status({ value }: { value?: string | null }) {
  const v = value || "UNKNOWN";
  const key = v.toLowerCase().replaceAll("_", "-");
  return <span className={`dk-status ${key}`}>{v.replaceAll("_", " ")}</span>;
}

export function Empty({ children = "Δεν υπάρχουν δεδομένα." }: { children?: ReactNode }) {
  return <div className="dk-empty">{children}</div>;
}

export function PageIntro({ title, text, actions }: { title: string; text: string; actions?: ReactNode }) {
  return <div className="dk-pageintro"><div><h2>{title}</h2><p>{text}</p></div>{actions && <div className="dk-pageactions">{actions}</div>}</div>;
}

export function ButtonLink({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return <Link className={`dk-btn ${primary ? "primary" : ""}`} href={href}>{children}</Link>;
}

export function MiniBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return <div className="dk-minibar"><span style={{ width: `${pct}%` }} /></div>;
}
