type GaWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  dorokartesGa?: { initialized: Set<string>; guarded: Set<string> };
} & Record<string, unknown>;

export function isPublicAnalyticsPath(pathname: string) {
  return pathname === "/" || /^\/(?:browse|brands|gift-cards|categories|occasions|regions|register-store)(?:\/|$)/.test(pathname);
}

export function isProductionAnalyticsHost() {
  return typeof window !== "undefined" && ["dorokartes.gr", "www.dorokartes.gr"].includes(window.location.hostname.toLowerCase());
}

export function prepareGoogleAnalytics(measurementId: string) {
  if (!isProductionAnalyticsHost() || !/^G-[A-Z0-9]+$/.test(measurementId)) return;
  const target = window as unknown as GaWindow;
  const state = target.dorokartesGa ||= { initialized: new Set(), guarded: new Set() };
  const disableKey = `ga-disable-${measurementId}`;
  const updateDisabled = (url = target.location.href) => {
    target[disableKey] = !isPublicAnalyticsPath(new URL(url, target.location.href).pathname);
  };

  if (!state.guarded.has(measurementId)) {
    // Set the opt-out flag before GA's history listener can observe an admin URL.
    // Keep this document-level guard active even when the script component is hidden.
    for (const method of ["pushState", "replaceState"] as const) {
      const original = target.history[method];
      target.history[method] = function (...args: Parameters<History[typeof method]>) {
        const previous = target[disableKey];
        updateDisabled(args[2] == null ? target.location.href : String(args[2]));
        try { return original.apply(this, args); }
        catch (error) { target[disableKey] = previous; throw error; }
      };
    }
    target.addEventListener("popstate", () => updateDisabled(), true);
    state.guarded.add(measurementId);
  }

  updateDisabled();
  if (target[disableKey]) return;
  if (!state.initialized.has(measurementId)) {
    target.dataLayer ||= [];
    // eslint-disable-next-line prefer-rest-params -- Preserve Google's documented gtag command format.
    target.gtag ||= function () { target.dataLayer!.push(arguments); };
    target.gtag("js", new Date());
    // Use GA's automatic page views, including Enhanced Measurement history events.
    // Do not also send manual page_view events from route effects.
    target.gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    state.initialized.add(measurementId);
  }
  target.dispatchEvent(new Event("dorokartes:analytics-ready"));
}
