import { useLocation } from "react-router-dom";
import {
  BRAND_NAME,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  absoluteUrl,
  canonicalUrl,
  isPrivatePath,
} from "../lib/site";

export {
  breadcrumbJsonLd,
  faqPageJsonLd,
  graph,
  jobPostingJsonLd,
  organizationJsonLd,
  personJsonLd,
  professionalServiceJsonLd,
  serviceItemListJsonLd,
  serviceJsonLd,
  websiteJsonLd,
} from "../lib/structured-data";

/**
 * Per-page document head for public and private routes.
 *
 * React 19 hoists `<title>`, `<meta>`, and `<link>` into `<head>` in the browser
 * and during build-time prerender. JSON-LD stays in the component tree, which
 * is valid for crawlers. The production build snapshots public routes to static
 * HTML so clients that do not run JavaScript still see the copy.
 *
 * Public page:
 *   <Seo title="探索服務｜FREELI" description="…" path="/services" jsonLd={graph(organizationJsonLd(), websiteJsonLd())} />
 *
 * Private page (dashboard, chat, contract, payment):
 *   <Seo title="工作台｜FREELI" description="…" path="/dashboard" noindex />
 *   Also add the path prefix to PRIVATE_PATH_PREFIXES in src/lib/site.ts.
 *
 * Talent profile: personJsonLd({ name, jobTitle, description, url }).
 * Public project: jobPostingJsonLd({ title, description, datePosted, url }).
 * Do not emit either for contracts, messages, or payments.
 */
export type SeoProps = {
  title: string;
  description?: string;
  /** Path beginning with `/`. Query strings are removed from the canonical URL. */
  path?: string;
  image?: string;
  imageAlt?: string;
  noindex?: boolean;
  ogType?: string;
  /** Same-origin or absolute URL of the LCP image, usually the hero poster. */
  preloadImage?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};

export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image,
  imageAlt,
  noindex = false,
  ogType = "website",
  preloadImage,
  jsonLd,
}: SeoProps) {
  const canonical = path ? canonicalUrl(path) : undefined;
  const robots = noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large";
  const ogImage = absoluteUrl(image) || DEFAULT_OG_IMAGE;
  const blocks = jsonLd == null ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:locale" content="zh_TW" />
      <meta property="og:site_name" content={BRAND_NAME} />
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:image" content={ogImage} />
      {imageAlt ? <meta property="og:image:alt" content={imageAlt} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {preloadImage ? <link rel="preload" as="image" href={preloadImage} fetchPriority="high" /> : null}
      {blocks.map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, "\\u003c") }}
        />
      ))}
    </>
  );
}

/** Safety net: any URL under a private prefix is noindex, even before its page adds `<Seo noindex>`. */
export function PrivateRouteHint() {
  const { pathname } = useLocation();
  if (!isPrivatePath(pathname)) return null;
  return <meta name="robots" content="noindex, nofollow" />;
}
