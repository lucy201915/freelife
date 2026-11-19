/** Public site constants. Change SITE_ORIGIN when a custom domain replaces the Vercel URL. */

export const SITE_ORIGIN = "https://freelife-tau.vercel.app";

/** Google Tag Manager container. Must match the snippet in index.html. */
export const GTM_CONTAINER_ID = "GTM-T9JVGVNS";

/** GA4 measurement ID. Page views are sent manually because this is an SPA. */
export const GA_MEASUREMENT_ID = "G-LLK3HD2FQ8";

/** Prose brand name. */
export const BRAND_NAME = "Freeli";

/** Uppercase wordmark used in the logo, titles, and 「FREELI 匯聚…」 copy. */
export const BRAND_WORDMARK = "FREELI";

export const DEFAULT_DESCRIPTION =
  "FREELI 匯聚經過認證的資深專業人才，以透明定價的標準化服務，陪伴台灣中小企業與新創彈性取得行銷、設計、業務與營運的專業力。";

export const SERVICES_DESCRIPTION =
  "瀏覽 Freeli 的標準化服務：行銷、設計、業務、網站、營運與文案。每個方案明列交付物、工作天數與固定價格。";

export const FAQ_DESCRIPTION =
  "了解 Freeli 如何媒合企業與認證專業人才、服務如何定價，以及款項如何由平台代管至驗收完成。";

export const HERO_POSTER = "/images/hero.jpg";
export const HERO_ALT = "一位專業人才在明亮的居家空間用筆電遠端工作";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}${HERO_POSTER}`;

/**
 * Authenticated product areas. These stay out of the sitemap, are marked
 * noindex, and are disallowed in robots.txt. Add a prefix here when a new
 * private route ships (chat, contract, payment, orders). Do not add public
 * talent or project pages.
 */
export const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/chat",
  "/message",
  "/inbox",
  "/contract",
  "/agreement",
  "/payment",
  "/checkout",
  "/billing",
  "/order",
  "/account",
  "/settings",
  "/auth",
  "/login",
  "/signup",
  "/me",
] as const;

/** Named AI crawlers the owner wants allowed on public pages. `User-agent: *` already allows the rest. */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Diffbot",
] as const;

export function isPrivatePath(pathname: string): boolean {
  const bare = pathname.split("?")[0].split("#")[0];
  const normalized = (bare.length > 1 ? bare.replace(/\/+$/, "") : bare || "/").toLowerCase();
  return PRIVATE_PATH_PREFIXES.some((prefix) => {
    const plural = `${prefix}s`;
    return normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized === plural || normalized.startsWith(`${plural}/`);
  });
}

export function canonicalUrl(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  if (!clean || clean === "/") return `${SITE_ORIGIN}/`;
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  return `${SITE_ORIGIN}${withSlash.replace(/\/+$/, "")}`;
}

export function absoluteUrl(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("https://") || src.startsWith("http://")) return src;
  if (src.startsWith("asset:")) return `${SITE_ORIGIN}/images/${src.slice("asset:".length)}`;
  if (src.startsWith("/")) return `${SITE_ORIGIN}${src}`;
  return undefined;
}

export function summarize(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function catalogPath(category?: string): string {
  if (!category || category === "全部") return "/services";
  return `/services?category=${encodeURIComponent(category)}`;
}
