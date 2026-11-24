import { useState, useRef, useMemo, useEffect, type ChangeEvent, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Seo, graph, organizationJsonLd, professionalServiceJsonLd, websiteJsonLd } from "../components/Seo";
import { useBootstrap } from "../lib/bootstrap";
import { BRAND_WORDMARK, DEFAULT_DESCRIPTION, HERO_ALT, catalogPath, summarize } from "../lib/site";
import { C, fmt, grid, wrap, type IconName } from "../lib/theme";
import { listPublicTalents, listPublicServices, type PublicService, type PublicTalent } from "../lib/supabase";
import { FEATURED_TALENT_PHOTOS } from "../lib/talent-photos";
import { trackEvent } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { Icon, Leaf, Photo, Stars, initialsOf, SecHead, Pill } from "../components/ui";


const HERO_VIDEO = "/media/hero-green-web.mp4";
const HERO_POSTER = "/media/hero-green-poster.jpg";

const HERO_CSS = `
.fl-hero { position: relative; isolation: isolate; overflow: hidden; background: #FAF6EE; }
.fl-hero-media {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; object-position: center;
  opacity: 0.5; pointer-events: none; z-index: 0;
}
.fl-hero-scrim {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(90deg, rgba(250,246,238,0.92) 0%, rgba(250,246,238,0.10) 100%);
}
.fl-hero-grid { position: relative; z-index: 2; }
.fl-hero-stage { display: flex; flex-direction: column; }
.fl-hero-find { margin-top: 28px; width: 100%; max-width: 540px; }
.fl-hero-search {
  background: #fff;
  box-shadow: 0 18px 44px rgba(31,58,45,.16);
}
.fl-hero-search-field { flex: 1 1 180px; min-width: 0; }
.fl-hero .fl-hero-search:focus-within {
  box-shadow: 0 0 0 3px rgba(166,25,46,.16), 0 18px 44px rgba(31,58,45,.16) !important;
}
.fl-search-btn {
  background: #A6192E;
  color: #fff;
  box-shadow: 0 8px 18px rgba(166,25,46,.28);
}
.fl-search-btn:hover {
  background: #8C1526 !important;
  box-shadow: 0 10px 22px rgba(166,25,46,.36) !important;
}
.fl-hero-chip {
  background: rgba(255,255,255,.75) !important;
  border-color: rgba(255,255,255,.9) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
@media (max-width: 520px) {
  .fl-hero-search { border-radius: 28px; }
  .fl-hero-search-field { flex: 1 1 100%; }
  .fl-hero .fl-search-btn { width: 100%; }
}
@media (min-width: 960px) {
  .fl-hero-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(440px, 540px);
    column-gap: 48px;
    align-items: start;
  }
  .fl-hero-badge { grid-column: 1; grid-row: 1; }
  .fl-hero-title { grid-column: 1; grid-row: 2; }
  .fl-hero-lead { grid-column: 1; grid-row: 3; }
  .fl-hero-find {
    grid-column: 2;
    grid-row: 2 / span 2;
    align-self: start;
    justify-self: end;
    width: 100%;
    max-width: 540px;
    margin-top: 0;
    padding-top: 34px;
  }
}
@media (max-width: 943px) {
  .fl-hero-scrim {
    background: linear-gradient(90deg, rgba(250,246,238,0.94) 0%, rgba(250,246,238,0.78) 42%, rgba(250,246,238,0.34) 100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fl-hero-video { display: none !important; }
}
`;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const FEATURED_TALENT_ORDER = ["吳沛慈", "林可恩", "陳子謙", "張書維"];

type LiveTalentRow = {
  name: string;
  title: string;
  years: number;
  type: string;
  skills: string[];
  rating: number;
  reviews: number;
  from: number;
  img: string;
  city: string;
  id?: string;
};

function mapLiveTalent(row: PublicTalent): LiveTalentRow {
  const skills = Array.isArray(row.skills) ? row.skills.map(String) : [];
  const from = Number(row.project_min) > 0 ? Number(row.project_min) : (Number(row.hourly_min) || 0);
  const name = String(row.name || "專業人才");
  return {
    id: String(row.id || ""),
    name,
    title: String(row.headline || "專業顧問"),
    years: 0,
    type: "專業人才",
    skills,
    rating: 0,
    reviews: 0,
    from,
    img: FEATURED_TALENT_PHOTOS[name] || "",
    city: String(row.location || ""),
  };
}

async function fetchLiveTalents(): Promise<LiveTalentRow[]> {
  const rows = await listPublicTalents();
  const usable = rows.filter((r) => r?.name);
  if (!usable.length) throw new Error("public talents empty");
  const rank = new Map(FEATURED_TALENT_ORDER.map((name, index) => [name, index]));
  const ordered = [...usable].sort((a, b) => {
    const ar = rank.has(String(a.name)) ? (rank.get(String(a.name)) as number) : FEATURED_TALENT_ORDER.length;
    const br = rank.has(String(b.name)) ? (rank.get(String(b.name)) as number) : FEATURED_TALENT_ORDER.length;
    if (ar !== br) return ar - br;
    return String(a.name).localeCompare(String(b.name), "zh-Hant");
  });
  return ordered.map((row) => mapLiveTalent(row));
}

type Cat = { name: string; desc: string; count: string; icon: IconName };
const CATS: Cat[] = [
  { name: "行銷公關", desc: "社群策略、媒體關係、活動企劃", count: "420+ 位人才", icon: "megaphone" },
  { name: "品牌設計", desc: "品牌識別、包裝、視覺系統", count: "380+ 位人才", icon: "pen" },
  { name: "B2B 業務開發", desc: "開發信、名單建置、通路談判", count: "260+ 位人才", icon: "handshake" },
  { name: "營運流程優化", desc: "SOP 建置、專案管理、效率診斷", count: "210+ 位人才", icon: "gear" },
  { name: "財務法務", desc: "合約健檢、記帳報稅、募資規劃", count: "150+ 位人才", icon: "scale" },
  { name: "網站與數位開發", desc: "形象網站、電商、App 原型", count: "340+ 位人才", icon: "code" },
  { name: "內容與文案", desc: "品牌故事、新聞稿、SEO 文章", count: "470+ 位人才", icon: "doc" },
  { name: "數據分析", desc: "GA4 追蹤、儀表板、市場研究", count: "190+ 位人才", icon: "chart" },
];

type TalentType = "數位遊牧" | "重返職場媽媽" | "資深自由工作者";
type Talent = { name: string; title: string; years: number; type: TalentType | "專業人才"; skills: string[]; rating: number; reviews: number; from: number; img: string; city: string; id?: string };
const TALENTS: Talent[] = [
  { name: "陳思妤", title: "品牌行銷與公關顧問", years: 12, type: "重返職場媽媽", skills: ["行銷公關", "社群策略"], rating: 4.9, reviews: 128, from: 3600, img: "asset:t1.jpg", city: "台北" },
  { name: "林哲宇", title: "全端工程師・網站架構", years: 8, type: "數位遊牧", skills: ["網站開發", "電商串接"], rating: 4.9, reviews: 86, from: 8000, img: "asset:t2.jpg", city: "清邁／台中" },
  { name: "王雅琳", title: "營運管理與流程顧問", years: 15, type: "資深自由工作者", skills: ["營運流程", "專案管理"], rating: 4.8, reviews: 104, from: 5000, img: "asset:t3.jpg", city: "新竹" },
  { name: "張凱婷", title: "品牌視覺設計師", years: 10, type: "數位遊牧", skills: ["品牌識別", "包裝設計"], rating: 5.0, reviews: 67, from: 6500, img: "asset:t4.jpg", city: "峇里島／台北" },
];

const STORIES = [
  { name: "黃建豪", role: "創辦人", company: "禾豐選物（電商・6 人團隊）", img: "asset:s1.jpg", metric: "+32%", metricLabel: "三個月線上營收成長", quote: "找到一位有 12 年品牌經驗的行銷顧問，兩週內就把社群策略和新品上市計畫整理好。報價清楚，完全不用來回議價。" },
  { name: "李佩珊", role: "營運長", company: "小日子烘焙（門市・18 人）", img: "asset:s2.jpg", metric: "-40%", metricLabel: "門市每日行政工時", quote: "顧問用 10 天幫我們建立訂單與排班 SOP，新人上手時間從一個月縮短到一週，是我們今年最值得的投資。" },
  { name: "吳采蓉", role: "重返職場媽媽・品牌顧問", company: "FREELI 認證人才", img: "asset:s3.jpg", metric: "NT$85K", metricLabel: "第一季接案收入", quote: "離開職場三年後，我以為要從頭開始。在這裡把過去的經驗包裝成服務，每週只花 15 小時，就接到穩定的企業客戶。" },
];

const FLOWS: Record<"biz" | "talent", { t: string; d: string }[]> = {
  biz: [
    { t: "搜尋服務或留下需求", d: "直接瀏覽標準化服務包，或用 30 秒描述需求，由顧問為你配對。" },
    { t: "比較人才與透明報價", d: "年資認證、交付物、天數與價格一目了然，評價皆來自真實訂單。" },
    { t: "安心付款、啟動合作", d: "款項由平台保管，雙方在專案工作區確認時程與交付內容。" },
    { t: "驗收交付、完成撥款", d: "確認成果後才撥款給人才，並留下評價，累積長期合作夥伴。" },
  ],
  talent: [
    { t: "建立專業檔案", d: "貼上履歷或 LinkedIn 經歷，AI 協助整理成三大實戰亮點。" },
    { t: "通過資歷認證", d: "平台審核年資與作品，取得認證徽章，提升企業信任感。" },
    { t: "上架標準化服務包", d: "自訂交付物、天數與固定報價，彈性決定每週可接案時數。" },
    { t: "接案交付、準時收款", d: "在任何城市都能遠端合作，驗收後款項自動撥入帳戶。" },
  ],
};

const WHY: { icon: IconName; t: string; d: string }[] = [
  { icon: "shield", t: "嚴選認證人才", d: "每位人才皆經年資、作品與推薦人三重審核，取得認證徽章才能上架。" },
  { icon: "tag", t: "透明定價", d: "服務包明列交付物、天數與固定價格，不必反覆詢價，預算一次掌握。" },
  { icon: "lock", t: "安心付款保障", d: "款項由平台代管，驗收完成才撥款；未如期交付可申請全額退款。" },
  { icon: "flex", t: "彈性合作模式", d: "單次諮詢、專案包到月費陪跑，依階段與預算自由組合。" },
];

export default function HomePage() {
  const boot = useBootstrap();
  const navigate = useNavigate();
  const bootServices = boot.services ?? null;
  const [q, setQ] = useState<string>("");
  const [cat, setCat] = useState<string>("全部");
  const [ttype, setTtype] = useState<"全部" | TalentType>("全部");
  const [flow, setFlow] = useState<"biz" | "talent">("biz");
  const [saved, setSaved] = useState<string[]>([]);
  const { sb, profile, setNotice, openAuth, handleSignOut, openRequest, setSavedTalentNames } = useAuth();
  const [menu, setMenu] = useState<boolean>(false);
  const [liveTalents, setLiveTalents] = useState<Talent[] | null>(null);
  const [liveServices, setLiveServices] = useState<PublicService[] | null>(bootServices);
  const [servicesState, setServicesState] = useState<"loading" | "ready" | "error">(bootServices ? "ready" : "loading");

  const servicesRef = useRef<HTMLDivElement>(null);
  const talentRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLDivElement>(null);
  const catsRef = useRef<HTMLDivElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const go = (r: { current: HTMLDivElement | null }): void => { setMenu(false); r.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const runSearch = (term: string): void => {
    const keyword = term.trim();
    setQ(keyword);
    if (!keyword) {
      navigate("/services");
      return;
    }
    navigate(`/services?q=${encodeURIComponent(keyword)}`);
  };

  const shown = useMemo<PublicService[]>(() => {
    const rows = (liveServices ?? []).filter((s) => s.slug);
    if (cat === "全部") return rows;
    return rows.filter((s) => s.category === cat);
  }, [liveServices, cat]);

  const talentSource: Talent[] = liveTalents && liveTalents.length ? liveTalents : TALENTS;
  const talents = talentSource.filter((t: Talent) => ttype === "全部" || t.type === ttype);

  useEffect(() => {
    const v = heroVideoRef.current;
    if (!v || reducedMotion) return;
    v.muted = true;
    v.play().catch(() => {});
  }, [reducedMotion]);

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchLiveTalents();
        if (!cancelled && rows.length) {
          setLiveTalents(rows as Talent[]);
          console.info("[FREELI] loaded live talents", rows.length);
        }
      } catch (err) {
        console.warn("[FREELI] live talents unavailable, using sample cards", err);
        if (!cancelled) setLiveTalents(null);
      }
    })();
    return () => { cancelled = true; };
  }, [sb, profile?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPublicServices();
        if (cancelled) return;
        setLiveServices(rows);
        setServicesState("ready");
      } catch (err) {
        console.warn("[FREELI] public services unavailable", err);
        if (!cancelled && bootServices == null) setServicesState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [bootServices]);

  useEffect(() => {
    if (!sb || !profile) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await sb.from("favorites").select("talent_id").eq("user_id", profile.id);
      if (cancelled) return;
      if (error) {
        console.warn("[FREELI] favorites load failed", error);
        return;
      }
      const ids = (data || []).map((r: any) => String(r.talent_id));
      const names = (liveTalents || []).filter((t) => t.id && ids.includes(t.id)).map((t) => t.name);
      setSaved(names); setSavedTalentNames(names);
    })();
    return () => { cancelled = true; };
  }, [sb, profile, liveTalents]);

  const toggleFavorite = async (t: Talent) => {
    const isSaved = saved.includes(t.name);
    if (!profile) {
      setNotice("請先登入後再收藏人才");
      openAuth("login");
      return;
    }
    if (!t.id || !sb) {
      setSaved(isSaved ? saved.filter((n: string) => n !== t.name) : [...saved, t.name]);
      return;
    }
    if (t.id === profile.id) {
      setNotice("不能收藏自己的檔案");
      return;
    }
    try {
      if (isSaved) {
        const { error } = await sb.from("favorites").delete().eq("user_id", profile.id).eq("talent_id", t.id);
        if (error) throw error;
        setSaved(saved.filter((n: string) => n !== t.name));
      } else {
        const { error } = await sb.from("favorites").insert({ user_id: profile.id, talent_id: t.id });
        if (error) throw error;
        setSaved([...saved, t.name]);
      }
    } catch (err: any) {
      setNotice(err?.message || "收藏更新失敗");
    }
  };

  const serviceTabs = ["全部", "行銷公關", "品牌設計", "B2B 業務開發", "網站與數位開發", "營運流程優化"];

  const btn = (kind: "primary" | "ghost" | "light", big = false): CSSProperties => ({
    border: kind === "ghost" ? `1.5px solid ${C.forest}` : "none",
    background: kind === "primary" ? C.forest : kind === "light" ? C.ivory : "transparent",
    color: kind === "primary" ? C.ivory : C.forest,
    borderRadius: 999,
    padding: big ? "15px 30px" : "10px 20px",
    fontSize: big ? 16 : 15,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    whiteSpace: "nowrap",
  });

  const card: CSSProperties = { background: C.white, border: `1px solid ${C.line}`, borderRadius: 22, overflow: "hidden" };
  const navLinkStyle: CSSProperties = { fontSize: 15, color: C.ink2, fontWeight: 500, textDecoration: "none" };
  const navItems: { label: string; href: string; on?: () => void }[] = [
    { label: "探索服務", href: "/services" },
    { label: "尋找人才", href: "/#talent", on: () => go(talentRef) },
    { label: "成為人才", href: "/#join", on: () => go(joinRef) },
    ...(profile ? [{ label: "工作台", href: "/dashboard" }] : []),
  ];
  const renderNavItem = (n: { label: string; href: string; on?: () => void }, mobile = false) => {
    const style: CSSProperties = mobile
      ? { padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink, textDecoration: "none" }
      : navLinkStyle;
    if (n.on) {
      return (
        <a key={n.label} href={n.href} className="fl-link" style={style} onClick={(e) => { e.preventDefault(); n.on?.(); }}>{n.label}</a>
      );
    }
    return (
      <Link key={n.label} to={n.href} className="fl-link" style={style} onClick={() => setMenu(false)}>{n.label}</Link>
    );
  };

  return (
    <div>
      <Seo
        title={`${BRAND_WORDMARK}｜專業不設限，工作有選擇`}
        description={DEFAULT_DESCRIPTION}
        path="/"
        image={HERO_POSTER}
        imageAlt={HERO_ALT}
        preloadImage={HERO_POSTER}
        jsonLd={graph(organizationJsonLd(), websiteJsonLd(), professionalServiceJsonLd())}
      />

      {/* 1. 導覽列 */}
      <header style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(250,246,238,.96)" }}>
        <nav aria-label="主要" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 76, flexWrap: "wrap" }}>
          <Link to="/" aria-label="Freeli 首頁" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Leaf />
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: ".14em", color: C.forest }}>FREELI</span>
          </Link>
          <div className="fl-navlinks" style={{ display: "flex", alignItems: "center", gap: 34 }}>
            {navItems.map((n) => renderNavItem(n))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {profile ? (
              <>
                <span className="fl-hide-sm" style={{ fontSize: 14, color: C.ink2, fontWeight: 500 }}>{profile.name}{profile.role === "business" ? "・企業" : "・人才"}</span>
                <button className="fl-btn fl-ghost" style={{ ...btn("ghost"), border: "none" }} onClick={() => { setMenu(false); void handleSignOut(); }}>登出</button>
              </>
            ) : (
              <>
                <button className="fl-btn fl-ghost fl-hide-sm" style={{ ...btn("ghost"), border: "none" }} onClick={() => openAuth("login")}>登入</button>
                <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => { trackEvent("sign_up_click"); openAuth("signup", "business"); }}>免費註冊</button>
              </>
            )}
            <button className="fl-btn fl-ghost fl-menu-btn" aria-label="選單" style={{ ...btn("ghost"), padding: 10, border: `1px solid ${C.line}` }} onClick={() => setMenu(!menu)}><Icon name="menu" /></button>
          </div>
        </nav>
        {menu ? (
          <div style={{ ...wrap, paddingBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {navItems.map((n) => renderNavItem(n, true))}
            {profile ? (
              <span className="fl-link" onClick={() => { setMenu(false); void handleSignOut(); }} style={{ padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink }}>登出（{profile.name}）</span>
            ) : (
              <span className="fl-link" onClick={() => openAuth("login")} style={{ padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink }}>登入</span>
            )}
          </div>
        ) : null}
      </header>
      <main>
      {/* 2. 主視覺 */}
      <div className="fl-hero">
        <style>{HERO_CSS}</style>
        {reducedMotion ? (
          <img className="fl-hero-media" src={HERO_POSTER} alt={HERO_ALT} />
        ) : (
          <video
            className="fl-hero-media fl-hero-video"
            ref={(node) => {
              heroVideoRef.current = node;
              if (node) node.muted = true;
            }}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={HERO_POSTER}
            aria-hidden="true"
          >
            <source src={HERO_VIDEO} type="video/mp4" />
          </video>
        )}
        <div className="fl-hero-scrim" aria-hidden="true" />
        <div className="fl-hero-grid fl-sec" style={{ ...wrap, paddingTop: 80, paddingBottom: 88 }}>
          <div className="fl-hero-stage">
            <div className="fl-hero-badge" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 14px 6px 8px", fontSize: 13, color: C.ink2, marginBottom: 24, maxWidth: "100%", width: "fit-content", justifySelf: "start" }}>
              <span style={{ background: C.goldLight, color: "#7A5F2E", borderRadius: 999, padding: "2px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>台灣在地</span>
              數位遊牧・資深自由工作者・重返職場媽媽
            </div>
            <h1 className="fl-h1 fl-hero-title" style={{ margin: 0, fontWeight: 800, color: C.ink }}>
              專業不設限，<br /><span style={{ color: C.forest2 }}>工作有選擇。</span>
            </h1>
            <p className="fl-hero-lead" style={{ margin: "22px 0 0", fontSize: 18, lineHeight: 1.8, color: C.ink2, maxWidth: 540 }}>
              FREELI 匯聚經過認證的資深專業人才，以透明定價的標準化服務，陪伴台灣中小企業與新創彈性取得行銷、設計、業務與營運的專業力。
            </p>
            <div className="fl-hero-find">
              <form role="search" className="fl-search fl-hero-search" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); trackEvent("search", { search_term: q.trim() }); runSearch(q); }} style={{ margin: 0, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div className="fl-hero-search-field" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", minWidth: 0 }}>
                  <Icon name="search" color={C.ink3} />
                  <label className="fl-sr" htmlFor="home-search">搜尋服務</label>
                  <input
                    id="home-search"
                    className="fl-input"
                    value={q}
                    placeholder="想找什麼專業？例如：品牌設計、開發信"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
                    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }}
                  />
                </div>
                <button type="submit" className="fl-btn fl-search-btn" style={{ border: "none", borderRadius: 999, padding: "13px 28px", fontSize: 16, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, whiteSpace: "nowrap", flex: "0 0 auto", color: "#fff" }}>搜尋服務</button>
              </form>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
                <span style={{ fontSize: 14, color: C.ink3, marginRight: 4 }}>熱門搜尋：</span>
                {["品牌設計", "開發信", "新聞稿", "形象網站", "SOP"].map((s: string) => (
                  <button key={s} className="fl-chip fl-hero-chip" onClick={() => runSearch(s)} style={{ border: `1px solid ${C.line}`, color: C.ink2, borderRadius: 999, padding: "6px 14px", fontSize: 13 }}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", marginTop: 44, paddingTop: 28, borderTop: `1px solid ${C.line}` }}>
            {[["3,200+", "認證專業人才"], ["1,500+", "合作企業"], ["98%", "準時交付率"], ["4.9", "平均合作評價"]].map((m: string[]) => (
              <div key={m[1]}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.forest }}>{m[0]}</div>
                <div style={{ fontSize: 14, color: C.ink3 }}>{m[1]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. 雙邊 CTA */}
      <div ref={joinRef} id="join" className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 40, scrollMarginTop: 24 }}>
        <div style={grid(440, 24)}>
          {[
            { k: "talent", tag: "我是專業人才", title: "把你的專業，變成可以被預約的服務", pts: ["AI 協助包裝履歷與服務包", "自訂價格與每週接案時數", "在任何城市都能穩定接案"], cta: "成為 FREELI 人才", img: "asset:cta-talent.jpg", alt: "一位自由工作者在咖啡館用筆電工作", dark: true },
            { k: "biz", tag: "我是企業雇主", title: "不必養一個部門，也能擁有資深專業", pts: ["10 年以上資歷人才嚴選認證", "固定報價、交付物清楚列明", "驗收後付款，未交付全額退款"], cta: "開始尋找人才", img: "asset:cta-biz.jpg", alt: "企業主與顧問在會議中討論合作", dark: false },
          ].map((c: { k: string; tag: string; title: string; pts: string[]; cta: string; img: string; alt: string; dark: boolean }) => (
            <div key={c.k} className="fl-card" style={{ ...card, background: c.dark ? C.forest : C.ivory2, border: c.dark ? "none" : `1px solid ${C.line}`, display: "flex", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", padding: 36, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ alignSelf: "flex-start", background: c.dark ? "rgba(201,213,188,.18)" : C.white, color: c.dark ? C.sageLight : C.forest, borderRadius: 999, padding: "5px 14px", fontSize: 14, fontWeight: 700 }}>{c.tag}</span>
                <h3 style={{ margin: "18px 0 16px", fontSize: 24, lineHeight: 1.4, color: c.dark ? C.ivory : C.ink }}>{c.title}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {c.pts.map((p: string) => (
                    <div key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, color: c.dark ? C.sageLight : C.ink2 }}>
                      <Icon name="check" size={20} color={c.dark ? C.sage : C.forest2} />{p}
                    </div>
                  ))}
                </div>
                <button className={c.dark ? "fl-btn fl-light" : "fl-btn fl-primary"} style={{ ...btn(c.dark ? "light" : "primary", true), alignSelf: "flex-start", marginTop: "auto" }} onClick={() => (c.dark ? openAuth("signup", "talent") : openRequest())}>
                  {c.cta} <Icon name="arrow" size={18} color={c.dark ? C.forest : C.ivory} />
                </button>
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, padding: 12 }}>
                <Photo src={c.img} alt={c.alt} height={330} radius={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 熱門分類 */}
      <div ref={catsRef} className="fl-sec" style={{ ...wrap, paddingTop: 72, paddingBottom: 72 }}>
        <SecHead eyebrow="熱門服務分類" title="從 0 到 1 最需要的專業，都在這裡" sub="點選分類，立即查看該領域的標準化服務與透明報價。" />
        <div style={grid(250, 18)}>
          {CATS.map((c: Cat) => (
            <div key={c.name} className="fl-tile" onClick={() => { setCat(c.name); go(servicesRef); }} style={{ background: C.ivory2, border: `1px solid ${C.line}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="fl-tile-ic" style={{ width: 48, height: 48, borderRadius: 14, background: C.sage, display: "grid", placeItems: "center", transition: "background .2s ease" }}>
                <Icon name={c.icon} color={C.ivory} size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>{c.name}</h3>
                <div style={{ fontSize: 14, color: C.ink2, marginTop: 4 }}>{c.desc}</div>
              </div>
              <div style={{ fontSize: 13, color: C.forest2, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{c.count} <Icon name="arrow" size={14} color={C.forest2} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 精選人才 */}
      <div ref={talentRef} id="talent" style={{ background: C.ivory2, scrollMarginTop: 24 }}>
        <div className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
          <SecHead
            eyebrow="精選專業人才"
            title="資歷經過認證，合作更有底氣"
            sub="每位人才的年資、作品與評價都公開透明，找到真正懂你產業的夥伴。"
            right={
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(["全部", "數位遊牧", "重返職場媽媽", "資深自由工作者"] as const).map((t: "全部" | TalentType) => (
                  <Pill key={t} active={ttype === t} onClick={() => setTtype(t)}>{t}</Pill>
                ))}
              </div>
            }
          />
          {talents.length ? (
          <div style={grid(250, 22)}>
            {talents.map((t: Talent) => {
              const isSaved = saved.includes(t.name);
              return (
                <div key={t.id || t.name} className="fl-card" style={card}>
                  <div style={{ position: "relative", padding: 10 }}>
                    <Photo src={t.img} alt={`${t.name}的專業形象照`} height={260} radius={16} initials={initialsOf(t.name)} />
                    <span style={{ position: "absolute", top: 22, left: 22, background: "rgba(255,253,249,.94)", color: C.forest, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{t.type}</span>
                    <button className="fl-btn" aria-label="收藏" onClick={() => toggleFavorite(t)} style={{ position: "absolute", top: 18, right: 18, width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,253,249,.94)", color: isSaved ? "#B4533C" : C.ink3, fontSize: 18, display: "grid", placeItems: "center" }}>{isSaved ? "♥" : "♡"}</button>
                  </div>
                  <div style={{ padding: "8px 22px 22px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 19, fontWeight: 700, color: C.ink }}>{t.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.sageMist, color: C.forest, borderRadius: 999, padding: "2px 10px 2px 6px", fontSize: 12, fontWeight: 700 }}>
                        <Icon name="shield" size={15} color={C.forest} />{t.years > 0 ? `認證 ${t.years} 年資歷` : "認證人才"}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, color: C.ink2, marginTop: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>📍 {t.city}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                      {t.skills.map((s: string) => <span key={s} style={{ fontSize: 12, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "3px 9px" }}>{s}</span>)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, gap: 8, flexWrap: "wrap" }}>
                      {t.rating > 0 ? <Stars value={t.rating} reviews={t.reviews} /> : <span style={{ fontSize: 13, color: C.ink3 }}>透明報價</span>}
                      <span style={{ fontSize: 13, color: C.ink3 }}>起價 <b style={{ fontSize: 17, color: C.forest }}>{fmt(t.from)}</b></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
            <div style={{ ...card, padding: 32, textAlign: "center", color: C.ink2 }}>
              這個類型目前沒有可顯示的人才。
              <button type="button" className="fl-link" style={{ border: "none", background: "transparent", color: C.forest2, fontWeight: 700 }} onClick={() => setTtype("全部")}>查看全部</button>
            </div>
          )}
        </div>
      </div>

      {/* 6. 熱門服務 */}
      <div ref={servicesRef} className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
        <SecHead eyebrow="熱門服務包" title="規格清楚、價格透明，一鍵預約" sub="每項服務都明列交付物、工作天數與固定價格，不必來回詢價。" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {serviceTabs.map((t: string) => <Pill key={t} active={cat === t} onClick={() => setCat(t)}>{t}</Pill>)}
        </div>
        {cat !== "全部" ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 15, color: C.ink2 }}>
            分類「<b style={{ color: C.forest }}>{cat}</b>」：{servicesState === "ready" ? `${shown.length} 項服務` : "載入中"}
            <button type="button" className="fl-link" style={{ border: "none", background: "transparent", color: C.forest2, fontWeight: 600 }} onClick={() => setCat("全部")}>顯示全部</button>
          </div>
        ) : null}
        {servicesState === "loading" ? (
          <div style={{ ...card, padding: 32, textAlign: "center", color: C.ink2 }}>正在載入服務…</div>
        ) : servicesState === "error" ? (
          <div style={{ ...card, padding: 32, textAlign: "center", color: "#B4533C" }}>服務暫時無法載入，請稍後再試。</div>
        ) : liveServices && liveServices.length === 0 ? (
          <div style={{ ...card, padding: 32, textAlign: "center", color: C.ink2 }}>
            目前沒有上架中的服務。<Link to="/services" style={{ color: C.forest2, fontWeight: 700 }}>前往服務市集</Link>
          </div>
        ) : shown.length > 0 ? (
          <div style={grid(330, 22)}>
            {shown.map((s: PublicService) => (
              <div key={s.id} className="fl-card" style={{ ...card, padding: 26, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.forest2, background: C.sageMist, borderRadius: 999, padding: "4px 12px" }}>{s.category}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink3 }}>{s.availability ? "可接案" : "暫停接案"}</span>
                </div>
                <h3 style={{ margin: "16px 0 6px", fontSize: 19, lineHeight: 1.45, color: C.ink }}>{s.title}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14, color: C.ink2 }}>
                  <span>由 <b style={{ color: C.ink, fontWeight: 600 }}>{s.talent_name}</b> 提供</span>
                  {s.review_count > 0 ? <Stars value={s.avg_rating} reviews={s.review_count} /> : <span style={{ fontSize: 13, color: C.ink3 }}>尚無評價</span>}
                </div>
                <div style={{ marginTop: 18, padding: 16, background: C.ivory, borderRadius: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink3 }}>服務簡介</div>
                  <div style={{ fontSize: 14, color: C.ink2, marginTop: 8, lineHeight: 1.7 }}>{summarize(s.description || "到方案頁查看交付內容、天數與固定價格。", 96)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: "auto", paddingTop: 20 }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.ink3 }}>{s.talent_location || "可遠端合作"}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: C.forest, lineHeight: 1.3 }}>
                      {s.basic_price != null ? <>{fmt(s.basic_price)}<span style={{ fontSize: 13, fontWeight: 500, color: C.ink3 }}> 起</span></> : <span style={{ fontSize: 18 }}>查看方案</span>}
                    </div>
                  </div>
                  <Link to={`/services/${s.slug}`} className="fl-btn fl-primary" style={{ ...btn("primary"), textDecoration: "none" }}>查看方案</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...card, padding: 32, textAlign: "center", color: C.ink2 }}>
            這個分類目前沒有上架中的服務。
            <button type="button" className="fl-link" style={{ border: "none", background: "transparent", color: C.forest2, fontWeight: 700 }} onClick={() => setCat("全部")}>查看全部服務</button>
          </div>
        )}
        <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 26px", borderRadius: 18, border: `1px dashed ${C.sage}`, background: C.white }}>
          <div style={{ fontSize: 16, color: C.ink }}><b>不確定該找哪位人才？</b><span style={{ color: C.ink2 }}>　留下需求，FREELI 顧問一個工作天內為你推薦 3 位人選。</span></div>
          <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => openRequest({ title: "顧問配對需求" })}>免費顧問配對</button>
        </div>
      </div>

      {/* 7. 為什麼選擇我們 */}
      <div style={{ background: C.forest, color: C.ivory }}>
        <div className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
          <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.sageLight, fontWeight: 600, marginBottom: 12 }}>為什麼選擇 FREELI</div>
          <h2 className="fl-h2" style={{ margin: "0 0 44px", color: C.ivory, fontWeight: 700, maxWidth: 640 }}>讓每一次合作，都安心、透明又有彈性</h2>
          <div style={grid(240, 20)}>
            {WHY.map((w: { icon: IconName; t: string; d: string }) => (
              <div key={w.t} style={{ background: "rgba(250,246,238,.06)", border: "1px solid rgba(201,213,188,.22)", borderRadius: 20, padding: 26 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: C.sageLight, display: "grid", placeItems: "center", marginBottom: 18 }}><Icon name={w.icon} size={26} color={C.forest} /></div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.ivory }}>{w.t}</h3>
                <div style={{ fontSize: 15, color: C.sageLight, marginTop: 8, lineHeight: 1.75 }}>{w.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 8. 成功故事 */}
      <div className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
        <SecHead eyebrow="合作成功故事" title="真實合作，帶來看得見的成果" />
        <div style={grid(320, 22)}>
          {STORIES.map((s: { name: string; role: string; company: string; img: string; metric: string; metricLabel: string; quote: string }) => (
            <div key={s.name} className="fl-card" style={{ ...card, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 38, fontWeight: 800, color: C.forest, lineHeight: 1 }}>{s.metric}</span>
                <span style={{ fontSize: 14, color: C.ink2 }}>{s.metricLabel}</span>
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.85, color: C.ink, flex: 1 }}>「{s.quote}」</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
                <div style={{ width: 56, flexShrink: 0 }}><Photo src={s.img} alt={`${s.name}的照片`} height={56} radius={999} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{s.name}・{s.role}</div>
                  <div style={{ fontSize: 13, color: C.ink3 }}>{s.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 9. 使用流程 */}
      <div style={{ background: C.ivory2 }}>
        <div className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
          <SecHead
            eyebrow="如何運作"
            title={flow === "biz" ? "四個步驟，找到對的專業夥伴" : "四個步驟，開始你的彈性事業"}
            right={
              <div style={{ display: "inline-flex", background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 5, gap: 4 }}>
                {([["biz", "我是企業雇主"], ["talent", "我是專業人才"]] as const).map((o: readonly ["biz" | "talent", string]) => (
                  <button key={o[0]} className="fl-btn" onClick={() => setFlow(o[0])} style={{ border: "none", borderRadius: 999, padding: "10px 20px", fontSize: 15, fontWeight: 600, background: flow === o[0] ? C.forest : "transparent", color: flow === o[0] ? C.ivory : C.ink2, minHeight: 44 }}>{o[1]}</button>
                ))}
              </div>
            }
          />
          <div style={grid(240, 20)}>
            {FLOWS[flow].map((st: { t: string; d: string }, i: number) => (
              <div key={st.t} style={{ position: "relative", background: C.white, border: `1px solid ${C.line}`, borderRadius: 20, padding: 26 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 999, background: i === 0 ? C.forest : C.sageMist, color: i === 0 ? C.ivory : C.forest, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17 }}>{i + 1}</span>
                  <span style={{ flex: 1, height: 1, background: C.line }} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink }}>{st.t}</h3>
                <div style={{ fontSize: 15, color: C.ink2, marginTop: 8, lineHeight: 1.75 }}>{st.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 10. 註冊 CTA */}
      <div className="fl-sec" style={{ ...wrap, paddingTop: 88, paddingBottom: 88 }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 32, background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forest2} 100%)`, padding: "clamp(36px, 6vw, 72px)", color: C.ivory }}>
          <div style={{ position: "absolute", right: -80, top: -80, width: 300, height: 300, borderRadius: 999, background: "rgba(156,175,136,.22)" }} />
          <div style={{ position: "absolute", right: 120, bottom: -120, width: 220, height: 220, borderRadius: 999, background: "rgba(184,151,90,.16)" }} />
          <div style={{ position: "relative", maxWidth: 680 }}>
            <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.sageLight, fontWeight: 600, marginBottom: 14 }}>現在就加入 FREELI</div>
            <h2 className="fl-h2" style={{ margin: 0, color: C.ivory, fontWeight: 800 }}>專業不設限，工作有選擇。</h2>
            <p style={{ margin: "16px 0 32px", fontSize: 17, lineHeight: 1.8, color: C.sageLight }}>免費註冊，3 分鐘完成專業檔案；企業首筆合作享平台服務費減免。</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button className="fl-btn fl-light" style={btn("light", true)} onClick={() => openAuth("signup", "talent")}>我是專業人才，免費加入</button>
              <button className="fl-btn" style={{ ...btn("ghost", true), borderColor: C.sageLight, color: C.ivory }} onClick={() => openRequest()}>我是企業雇主，開始找人才</button>
            </div>
          </div>
        </div>
      </div>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, background: C.ivory2 }}>
        <div style={{ ...wrap, paddingTop: 56, paddingBottom: 28 }}>
          <div style={grid(170, 32)}>
            <div style={{ minWidth: 0 }}>
              <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}><Leaf size={28} /><span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".14em", color: C.forest }}>FREELI</span></Link>
              <p style={{ fontSize: 14, color: C.ink2, marginTop: 14, lineHeight: 1.8 }}>連結數位遊牧、資深自由工作者與重返職場媽媽，為台灣企業提供彈性專業服務。</p>
            </div>
            {[
              { h: "探索服務", l: ["行銷公關", "品牌設計", "B2B 業務開發", "網站與數位開發"] },
              { h: "專業人才", l: ["成為人才", "人才認證標準", "服務包上架指南", "人才社群"] },
              { h: "關於 FREELI", l: ["品牌故事", "企業方案", "媒體報導", "加入我們"] },
              { h: "支援中心", l: ["常見問題", "付款保障說明", "服務條款", "隱私權政策"] },
            ].map((col: { h: string; l: string[] }) => (
              <div key={col.h}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 14 }}>{col.h}</div>
                {col.l.map((x: string) => {
                  const href = col.h === "探索服務" ? catalogPath(x) : x === "常見問題" ? "/faq" : x === "成為人才" ? "/#join" : null;
                  return href ? (
                    <Link key={x} to={href} className="fl-link" style={{ display: "block", fontSize: 14, color: C.ink2, padding: "4px 0", textDecoration: "none" }}>{x}</Link>
                  ) : (
                    <div key={x} style={{ fontSize: 14, color: C.ink2, padding: "4px 0" }}>{x}</div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${C.line}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, fontSize: 13, color: C.ink3 }}>
            <span>© 2026 FREELI 版權所有・台灣</span>
            <span>本頁為設計原型，人物與數據皆為示意</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

