import Script from "next/script";

type GoogleAnalyticsProps = {
  measurementId: string;
};

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const serializedMeasurementId = JSON.stringify(measurementId);

  return (
    <>
      <Script id="google-analytics-bootstrap" strategy="afterInteractive">
        {`
          (function () {
            var measurementId = ${serializedMeasurementId};
            var hostname = window.location.hostname.toLowerCase();
            var isProductionHost = hostname === "dorokartes.gr" || hostname === "www.dorokartes.gr";

            if (!isProductionHost) {
              window["ga-disable-" + measurementId] = true;
              return;
            }

            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag("js", new Date());
            gtag("config", measurementId, {
              allow_google_signals: false,
              allow_ad_personalization_signals: false
            });
          })();
        `}
      </Script>
      <Script
        id="google-analytics-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
