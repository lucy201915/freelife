import type { ServicePage } from "./supabase";
import { SERVICE_CATEGORIES } from "./public-copy";
import {
  BRAND_NAME,
  BRAND_WORDMARK,
  DEFAULT_DESCRIPTION,
  SITE_ORIGIN,
  absoluteUrl,
  summarize,
} from "./site";

const ORG_ID = `${SITE_ORIGIN}/#organization`;
const SITE_ID = `${SITE_ORIGIN}/#website`;

const TIER_NAME: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

export function graph(...nodes: (Record<string, unknown> | null | undefined | false)[]) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node): node is Record<string, unknown> => !!node),
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: BRAND_NAME,
    alternateName: BRAND_WORDMARK,
    url: `${SITE_ORIGIN}/`,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_ORIGIN}/favicon.svg`,
    },
    description: DEFAULT_DESCRIPTION,
    areaServed: { "@type": "Country", name: "Taiwan" },
    address: { "@type": "PostalAddress", addressCountry: "TW" },
    knowsLanguage: ["zh-Hant-TW"],
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: BRAND_NAME,
    alternateName: BRAND_WORDMARK,
    url: `${SITE_ORIGIN}/`,
    inLanguage: "zh-Hant-TW",
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_ORIGIN}/services?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function professionalServiceJsonLd(): Record<string, unknown> {
  return {
    "@type": "ProfessionalService",
    "@id": `${SITE_ORIGIN}/#professional-service`,
    name: BRAND_NAME,
    url: `${SITE_ORIGIN}/services`,
    image: `${SITE_ORIGIN}/images/hero.jpg`,
    description: "以透明定價的標準化服務，連結台灣企業與經過認證的資深專業人才。",
    areaServed: { "@type": "Country", name: "Taiwan" },
    provider: { "@id": ORG_ID },
    serviceType: SERVICE_CATEGORIES.map((c) => c.name),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path.startsWith("http") ? item.path : `${SITE_ORIGIN}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}

export function faqPageJsonLd(faqs: { question: string; answer: string }[]): Record<string, unknown> | null {
  const rows = faqs.filter((f) => f.question.trim() && f.answer.trim());
  if (!rows.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: rows.map((f) => ({
      "@type": "Question",
      name: f.question.trim(),
      acceptedAnswer: { "@type": "Answer", text: f.answer.trim() },
    })),
  };
}

export function serviceItemListJsonLd(services: { slug: string; title: string }[]): Record<string, unknown> | null {
  if (!services.length) return null;
  return {
    "@type": "ItemList",
    name: "Freeli 服務",
    itemListElement: services.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: service.title,
      url: `${SITE_ORIGIN}/services/${service.slug}`,
    })),
  };
}

export function personJsonLd(input: {
  name: string;
  jobTitle?: string;
  description?: string;
  location?: string;
  knowsAbout?: string[];
  url?: string;
}): Record<string, unknown> {
  const about = (input.knowsAbout || []).map((s) => s.trim()).filter(Boolean);
  return {
    "@type": "Person",
    name: input.name,
    ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
    ...(input.description ? { description: summarize(input.description, 400) } : {}),
    ...(input.location ? { homeLocation: { "@type": "Place", name: input.location } } : {}),
    ...(about.length ? { knowsAbout: about } : {}),
    ...(input.url ? { url: input.url } : {}),
  };
}

/** For a future public project / open-demand page. Do not use for private contracts. */
export function jobPostingJsonLd(input: {
  title: string;
  description: string;
  datePosted: string;
  url: string;
  location?: string;
  validThrough?: string;
  hiringName?: string;
}): Record<string, unknown> {
  return {
    "@type": "JobPosting",
    title: input.title,
    description: summarize(input.description, 800),
    datePosted: input.datePosted,
    url: input.url,
    hiringOrganization: {
      "@type": "Organization",
      name: input.hiringName || BRAND_NAME,
      sameAs: `${SITE_ORIGIN}/`,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: "TW",
        addressLocality: input.location || "台灣",
      },
    },
    employmentType: "CONTRACTOR",
    ...(input.validThrough ? { validThrough: input.validThrough } : {}),
  };
}

export function serviceJsonLd(page: ServicePage): { service: Record<string, unknown>; person: Record<string, unknown> } {
  const url = `${SITE_ORIGIN}/services/${page.service.slug}`;
  const personId = `${url}#provider`;
  const skills = Array.isArray(page.talent.skills) ? page.talent.skills.map(String) : [];
  const person = personJsonLd({
    name: page.talent.name,
    jobTitle: page.talent.headline || page.service.category,
    description: page.talent.bio || page.talent.headline,
    location: page.talent.location,
    knowsAbout: skills,
  });
  person["@id"] = personId;

  const prices = page.packages.map((p) => Number(p.price)).filter((n) => Number.isFinite(n));
  const images = (page.service.images || []).map((src) => absoluteUrl(src)).filter((src): src is string => !!src);
  const service: Record<string, unknown> = {
    "@type": "Service",
    "@id": `${url}#service`,
    name: page.service.title,
    description: summarize(page.service.description || page.service.title, 500),
    url,
    serviceType: page.service.category,
    areaServed: { "@type": "Country", name: "Taiwan" },
    provider: { "@id": personId },
    brand: { "@id": ORG_ID },
    ...(images.length ? { image: images } : {}),
  };

  if (prices.length) {
    service.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "TWD",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: page.packages.length,
      availability: page.service.availability ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      offers: page.packages.map((pkg) => ({
        "@type": "Offer",
        name: TIER_NAME[pkg.tier] || pkg.tier,
        price: Number(pkg.price),
        priceCurrency: "TWD",
        url,
        availability: page.service.availability ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        description: `${pkg.delivery_days} 天交付，修訂 ${pkg.revisions} 次`,
      })),
    };
  }

  if (page.stats?.review_count > 0) {
    service.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(page.stats.avg_rating),
      reviewCount: Number(page.stats.review_count),
      bestRating: 5,
      worstRating: 1,
    };
  }

  return { service, person };
}
