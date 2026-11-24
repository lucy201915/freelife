/** Stock portraits used only for the original featured talent names. Everyone else gets initials. */
export const FEATURED_TALENT_PHOTOS: Record<string, string> = {
  吳沛慈: "asset:t1.jpg",
  林可恩: "asset:t2.jpg",
  陳子謙: "asset:t3.jpg",
  張書維: "asset:t4.jpg",
};

export function featuredTalentPhoto(name: string): string {
  return FEATURED_TALENT_PHOTOS[name] || "";
}
