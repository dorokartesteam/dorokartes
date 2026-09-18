"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  isProductionAnalyticsHost,
  isPublicAnalyticsPath,
  prepareGoogleAnalytics,
} from "@/lib/public/google-analytics";

type GoogleAnalyticsProps = {
  measurementId: string;
};

const subscribe = () => () => {};
const serverSnapshot = () => false;

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const productionHost = useSyncExternalStore(
    subscribe,
    isProductionAnalyticsHost,
    serverSnapshot,
  );

  useEffect(() => {
    prepareGoogleAnalytics(measurementId);
  }, [measurementId, pathname]);

  if (!productionHost || !isPublicAnalyticsPath(pathname)) {
    return null;
  }

  return (
    <Script
      id="google-analytics-loader"
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  );
}
