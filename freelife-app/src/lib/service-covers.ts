import { featuredTalentPhoto } from "./talent-photos";

export type ServiceCover = { src: string; position: string };

/**
 * Catalog covers stay 16:10 at every viewport, so one object-position
 * keeps the same face crop on desktop and on a phone.
 * Positions are tuned on that ratio: lower percentages keep forehead and eyes.
 */
const PRESETS: Record<string, ServiceCover> = {
  "brand-community-audit": { src: "/images/t1.jpg", position: "center 20%" },
  "startup-brand-identity": { src: "/images/t2.jpg", position: "center 34%" },
  "b2b-outreach-list": { src: "/images/cta-biz.jpg", position: "center center" },
  "onepage-brand-site": { src: "/images/t3.jpg", position: "center 22%" },
  "press-release-media": { src: "/images/t4.jpg", position: "center 20%" },
};

/** Tight stock headshots. They crop eyes in a 16:10 frame and don't match the seller. */
const STOCK_HEADSHOTS = new Set(["/images/s1.jpg", "/images/s2.jpg", "/images/s3.jpg"]);

const WIDE_SCENES = new Set([
  "/images/hero.jpg",
  "/images/cta-biz.jpg",
  "/images/cta-talent.jpg",
]);

const TALENT_POSITION: Record<string, string> = {
  吳沛慈: "center 20%",
  林可恩: "center 34%",
  陳子謙: "center 22%",
  張書維: "center 20%",
};

function localPath(src: string): string {
  if (!src) return "";
  if (src.startsWith("asset:")) return `/images/${src.slice("asset:".length)}`;
  try {
    const url = new URL(src, "https://freeli.local");
    return url.pathname;
  } catch {
    return src;
  }
}

function resolveSrc(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("asset:")) return `/images/${raw.slice("asset:".length)}`;
  return raw;
}

type CoverInput = { id: string; slug: string; talent_name: string; images?: string[] };

/** Unique catalog covers. Known mismatched stock portraits are replaced with the seller's own photo or a local scene. */
export function assignServiceCovers(services: CoverInput[]): Map<string, ServiceCover> {
  const counts = new Map<string, number>();
  for (const service of services) {
    const raw = resolveSrc(service.images?.[0]);
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }

  const taken = new Set<string>();
  const map = new Map<string, ServiceCover>();

  const claim = (id: string, cover: ServiceCover) => {
    if (cover.src) taken.add(cover.src);
    map.set(id, cover);
  };

  for (const service of services) {
    const raw = resolveSrc(service.images?.[0]);
    const path = localPath(raw);
    const duplicated = Boolean(raw) && (counts.get(raw) || 0) > 1;
    const stock = STOCK_HEADSHOTS.has(path) || path === "/images/hero.jpg";
    const preset = PRESETS[service.slug];
    if (preset && (stock || duplicated || !raw) && !taken.has(preset.src)) {
      claim(service.id, preset);
      continue;
    }
    if (raw && !stock && !duplicated && !taken.has(raw)) {
      claim(service.id, {
        src: raw,
        position: WIDE_SCENES.has(path) ? "center center" : "center 18%",
      });
      continue;
    }
    const own = resolveSrc(featuredTalentPhoto(service.talent_name));
    if (own && !taken.has(own)) {
      claim(service.id, { src: own, position: TALENT_POSITION[service.talent_name] || "center 18%" });
      continue;
    }
    if (preset && !taken.has(preset.src)) {
      claim(service.id, preset);
      continue;
    }
    claim(service.id, { src: "", position: "center center" });
  }

  return map;
}
