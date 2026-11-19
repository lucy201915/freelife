import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isBrowser = typeof window !== "undefined";

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: isBrowser,
          autoRefreshToken: isBrowser,
          detectSessionInUrl: isBrowser,
        },
      })
    : null;

export function getSb(): SupabaseClient | null {
  return supabase;
}

/**
 * TODO: Wire Taiwan payment (ECPay / NewebPay) later.
 * This must call a Supabase Edge Function that holds HashKey/HashIV server-side.
 * Never put payment secrets, HashKey, HashIV, or merchant credentials in the frontend,
 * and do not add a payment SDK here.
 */
export async function startPayment(_requestId?: string): Promise<{ ok: false; reason: "not_enabled" }> {
  return { ok: false, reason: "not_enabled" };
}

export function publicMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  if (!url) return path;
  return `${url}/storage/v1/object/public/service-media/${path}`;
}

export type FlProfile = {
  id: string;
  name: string;
  username: string;
  role: "business" | "talent";
  company: string;
};

export type PublicService = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  images: string[];
  availability: boolean;
  talent_id: string;
  talent_name: string;
  talent_headline: string;
  talent_location: string;
  basic_price: number | null;
  avg_rating: number;
  review_count: number;
};

export type ServicePackage = {
  id: string;
  tier: "basic" | "standard" | "premium";
  price: number;
  delivery_days: number;
  revisions: number;
  features: string[];
};

export type ServicePage = {
  service: {
    id: string;
    slug: string;
    title: string;
    category: string;
    description: string;
    images: string[];
    availability: boolean;
    status: string;
  };
  talent: {
    id: string;
    name: string;
    username: string;
    headline: string;
    location: string;
    languages: string;
    bio: string;
    skills: string[] | unknown;
    linkedin_url?: string;
  };
  packages: ServicePackage[];
  faqs: { id: string; question: string; answer: string; sort: number }[];
  portfolios: { id: string; title: string; summary: string; image_path: string | null; sort: number }[];
  reviews: { id: string; rating: number; comment: string; reviewer_name: string; created_at: string }[];
  stats: { avg_rating: number; review_count: number };
  related: { slug: string; title: string; category: string; talent_name: string; basic_price: number | null }[];
};

export type PublicTalent = {
  id: string;
  name: string;
  username: string;
  headline: string;
  location: string;
  languages: string;
  bio: string;
  skills: unknown;
  project_min: number | null;
  project_max: number | null;
  hourly_min: number | null;
  hourly_max: number | null;
};

/** Public talent cards: read profiles + talent_profiles directly.
 *  Anon SELECT on projects/invites is now granted, so the existing
 *  profiles marketplace policy no longer 42501 for anonymous readers.
 */
export async function listPublicTalents(): Promise<PublicTalent[]> {
  if (!supabase) throw new Error("尚未連上資料庫");
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("user_id, headline, location, languages, bio, hourly_min, hourly_max, project_min, project_max, skills, onboarded, profiles(id, name, username, role)")
    .eq("onboarded", true);
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    const mapped = rows
      .map((row: Record<string, unknown>) => {
        const profile = (row.profiles || {}) as Record<string, unknown>;
        if (!profile?.name) return null;
        return {
          id: String(profile.id || row.user_id || ""),
          name: String(profile.name),
          username: String(profile.username || ""),
          headline: String(row.headline || ""),
          location: String(row.location || ""),
          languages: String(row.languages || ""),
          bio: String(row.bio || ""),
          skills: row.skills,
          project_min: row.project_min == null ? null : Number(row.project_min),
          project_max: row.project_max == null ? null : Number(row.project_max),
          hourly_min: row.hourly_min == null ? null : Number(row.hourly_min),
          hourly_max: row.hourly_max == null ? null : Number(row.hourly_max),
        } as PublicTalent;
      })
      .filter((r): r is PublicTalent => !!r);
    if (mapped.length) return mapped;
  } else {
    console.warn("[Freeli] talent_profiles embed failed, trying list_public_talents RPC", error);
  }
  const rpc = await supabase.rpc("list_public_talents");
  if (rpc.error) throw error || rpc.error;
  return (rpc.data || []) as PublicTalent[];
}

export async function listPublicServices(query = "", category = "") {
  if (!supabase) throw new Error("尚未連上資料庫");
  const { data, error } = await supabase.rpc("list_public_services", {
    p_query: query || "",
    p_category: category || "",
  });
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    avg_rating: Number(row.avg_rating || 0),
    review_count: Number(row.review_count || 0),
    basic_price: row.basic_price == null ? null : Number(row.basic_price),
  })) as PublicService[];
}

export async function getPublicServicePage(slug: string): Promise<ServicePage | null> {
  if (!supabase) throw new Error("尚未連上資料庫");
  const { data, error } = await supabase.rpc("get_public_service_page", { p_slug: slug });
  if (error) throw error;
  if (!data) return null;
  const page = data as ServicePage;
  if (!page.service) return null;
  page.packages = (page.packages || []).map((p) => ({
    ...p,
    features: Array.isArray(p.features) ? p.features.map(String) : [],
  }));
  page.service.images = Array.isArray(page.service.images) ? page.service.images.map(String) : [];
  page.stats = {
    avg_rating: Number(page.stats?.avg_rating || 0),
    review_count: Number(page.stats?.review_count || 0),
  };
  return page;
}

export function rpcMessage(err: unknown): string {
  const e = err as { message?: string; code?: string };
  const msg = String(e?.message || "操作失敗，請再試一次");
  const map: Record<string, string> = {
    not_authenticated: "請先登入",
    only_business_can_order: "僅限企業雇主帳號建立合作訂單",
    only_business_can_contact: "僅限企業雇主帳號聯絡人才",
    invalid_tier: "請選擇有效的方案等級",
    service_not_found: "找不到此服務",
    service_unavailable: "此服務目前未開放接案",
    cannot_order_own_service: "不能對自己的服務下單",
    package_not_found: "找不到對應方案",
    order_not_found: "找不到訂單",
    invalid_status_transition: "此狀態無法這樣變更",
    only_talent_can_deliver: "僅限接案人才交付成果",
    only_buyer_can_review: "僅限完成訂單的企業雇主評價",
    order_not_completed: "訂單完成後才能評價",
    review_already_exists: "這筆訂單已經留下評價",
    cannot_contact_self: "不能聯絡自己",
    invalid_invite_kind: "邀請類型不正確",
    invalid_rating: "評分需為 1 到 5 星",
  };
  for (const [k, v] of Object.entries(map)) {
    if (msg.includes(k)) return v;
  }
  return msg;
}
