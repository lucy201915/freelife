import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { GA_MEASUREMENT_ID } from "./site";

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "event" | "config" | "js" | "set", ...args: unknown[]) => void;
  }
}

/**
 * Last path we already sent. This lives on the module, not in a ref, so
 * React StrictMode's extra effect run in development does not send a second
 * page_view. A later visit to the same path still counts, because the path
 * in between replaces this value.
 */
let lastPagePath = "";

function canTrack(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function trackEvent(name: string, params?: EventParams) {
  if (!canTrack()) return;
  window.gtag!("event", name, { ...params, send_to: GA_MEASUREMENT_ID });
}

export function trackPageView(pagePath: string) {
  if (lastPagePath === pagePath) return;
  lastPagePath = pagePath;
  if (!canTrack()) return;
  window.gtag!("event", "page_view", {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
    send_to: GA_MEASUREMENT_ID,
  });
}

/** One page_view for the first load and for each later pathname or query change. */
export function usePageViews() {
  const location = useLocation();
  const pagePath = `${location.pathname}${location.search}`;
  useEffect(() => {
    trackPageView(pagePath);
  }, [pagePath]);
}
