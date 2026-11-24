import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Seo, breadcrumbJsonLd, graph, organizationJsonLd, professionalServiceJsonLd, serviceItemListJsonLd, websiteJsonLd } from "../components/Seo";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { useBootstrap } from "../lib/bootstrap";
import { BRAND_WORDMARK, SERVICES_DESCRIPTION } from "../lib/site";
import { C, CATEGORIES, btn, fmt } from "../lib/theme";
import { listPublicServices, publicMediaUrl, rpcMessage, type PublicService } from "../lib/supabase";
import { assignServiceCovers, type ServiceCover } from "../lib/service-covers";
import { featuredTalentPhoto } from "../lib/talent-photos";
import { Icon, Photo, Pill, SecHead, initialsOf } from "../components/ui";

type Budget = "all" | "under" | "mid" | "over";
type SortKey = "recommended" | "asc" | "desc";

function serviceImageSrc(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("asset:")) return `/images/${raw.slice("asset:".length)}`;
  return publicMediaUrl(raw) || raw;
}

function priceOf(service: PublicService): number | null {
  if (service.basic_price == null || !Number.isFinite(service.basic_price) || service.basic_price <= 0) return null;
  return service.basic_price;
}

function matchesBudget(service: PublicService, budget: Budget): boolean {
  if (budget === "all") return true;
  const price = priceOf(service);
  if (price == null) return false;
  if (budget === "under") return price < 20000;
  if (budget === "mid") return price >= 20000 && price <= 50000;
  return price > 50000;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20s-7-4.4-7-9.2A4.1 4.1 0 0 1 9.1 6.2c1.3 0 2.4.6 2.9 1.6.5-1 1.6-1.6 2.9-1.6A4.1 4.1 0 0 1 19 10.8C19 15.6 12 20 12 20z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cover({ src, alt, initials, position }: { src: string; alt: string; initials: string; position: string }) {
  const [failed, setFailed] = useState(false);
  const photo = src.trim();
  if (!photo || failed) {
    return (
      <div className="fl-svc-fallback" role="img" aria-label={alt}>
        <span>{initials}</span>
      </div>
    );
  }
  return <img src={photo} alt={alt} style={{ objectPosition: position }} loading="eager" decoding="async" onError={() => setFailed(true)} />;
}

function ServiceCard({
  service,
  cover,
  saved,
  pending,
  onToggle,
}: {
  service: PublicService;
  cover: ServiceCover;
  saved: boolean;
  pending: boolean;
  onToggle: (serviceId: string) => void;
}) {
  const href = `/services/${service.slug}`;
  const price = priceOf(service);
  const place = [service.talent_location, service.availability ? "可接案" : "暫停接案"].filter(Boolean).join(" · ");
  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <article className="fl-card fl-svc-card">
      <div className="fl-svc-cover">
        <Link to={href} className="fl-svc-cover-link" aria-label={service.title}>
          <Cover src={cover.src} alt={service.title} initials={initialsOf(service.talent_name)} position={cover.position} />
        </Link>
        <span className="fl-svc-cat">{service.category}</span>
        <button
          type="button"
          className="fl-svc-heart"
          aria-pressed={saved}
          aria-label={saved ? `取消收藏${service.title}` : `收藏${service.title}`}
          disabled={pending}
          onClick={(event) => {
            stop(event);
            onToggle(service.id);
          }}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>
      <div className="fl-svc-body">
        <div className="fl-svc-seller">
          <div className="fl-svc-avatar">
            <Photo
              src={featuredTalentPhoto(service.talent_name)}
              alt={`${service.talent_name}的頭像`}
              height={32}
              radius={999}
              initials={initialsOf(service.talent_name)}
            />
          </div>
          <div className="fl-svc-seller-meta">
            <span className="fl-svc-name">{service.talent_name}</span>
            <span className="fl-svc-place">{place}</span>
          </div>
        </div>
        <h2 className="fl-svc-title">
          <Link to={href}>{service.title}</Link>
        </h2>
        <div className="fl-svc-rate">
          {service.review_count > 0 ? (
            <span><b>★</b>{Number(service.avg_rating || 0).toFixed(1)} ({service.review_count})</span>
          ) : (
            <span className="fl-svc-new">新上架</span>
          )}
        </div>
        <div className="fl-svc-foot">
          <span className="fl-svc-foot-label">透明方案</span>
          <span className="fl-svc-price">{price != null ? `${fmt(price)} 起` : "查看方案"}</span>
        </div>
      </div>
    </article>
  );
}

export default function ServicesPage() {
  const boot = useBootstrap();
  const { sb, profile, openAuth, setNotice } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [budget, setBudget] = useState<Budget>("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [rows, setRows] = useState<PublicService[] | null>(boot.services ?? null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(() => new Set());
  const [pendingFav, setPendingFav] = useState<string | null>(null);
  const filterSynced = useRef(false);

  useLayoutEffect(() => {
    const q0 = (params.get("q") || "").trim();
    const cat0 = params.get("category") || "";
    const nextCat = cat0 === "全部" ? "" : cat0;
    setQ(q0);
    setCategory(nextCat);
    setAppliedQ(q0);
    setReady(true);
    if (!filterSynced.current && (q0 || nextCat)) setRows(null);
    filterSynced.current = true;
  }, [params]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listPublicServices(appliedQ, category);
        if (!cancelled) {
          setRows(data);
          setError("");
        }
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "無法載入服務");
      }
    })();
    return () => { cancelled = true; };
  }, [ready, appliedQ, category]);

  useEffect(() => {
    if (!sb || !profile) {
      setFavIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: favError } = await sb.from("service_favorites").select("service_id").eq("user_id", profile.id);
      if (cancelled) return;
      if (favError) {
        console.warn("[FREELI] service favorites load failed", favError);
        return;
      }
      setFavIds(new Set((data || []).map((row: { service_id: string }) => String(row.service_id))));
    })();
    return () => { cancelled = true; };
  }, [sb, profile]);

  const apply = (term = q, cat = category) => {
    const nextTerm = term.trim();
    setAppliedQ(nextTerm);
    setCategory(cat);
    setQ(nextTerm);
    const next = new URLSearchParams();
    if (nextTerm) next.set("q", nextTerm);
    if (cat) next.set("category", cat);
    setParams(next, { replace: true });
  };

  const clearAll = () => {
    setQ("");
    setCategory("");
    setAppliedQ("");
    setBudget("all");
    setSort("recommended");
    setParams(new URLSearchParams(), { replace: true });
  };

  const toggleFav = async (serviceId: string) => {
    if (!profile || !sb) {
      setNotice("請先登入後再收藏服務");
      openAuth("login");
      return;
    }
    if (pendingFav) return;
    setPendingFav(serviceId);
    const saved = favIds.has(serviceId);
    try {
      if (saved) {
        const { error: favError } = await sb.from("service_favorites").delete().eq("user_id", profile.id).eq("service_id", serviceId);
        if (favError) throw favError;
        setFavIds((current) => {
          const next = new Set(current);
          next.delete(serviceId);
          return next;
        });
      } else {
        const { error: favError } = await sb.from("service_favorites").insert({ user_id: profile.id, service_id: serviceId });
        if (favError) throw favError;
        setFavIds((current) => new Set(current).add(serviceId));
      }
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setPendingFav(null);
    }
  };

  const tabs = useMemo(() => ["全部", ...CATEGORIES], []);
  const shown = useMemo(() => {
    const list = (rows ?? []).filter((service) => service.slug && matchesBudget(service, budget));
    if (sort === "asc") {
      return [...list].sort((a, b) => (priceOf(a) ?? Number.POSITIVE_INFINITY) - (priceOf(b) ?? Number.POSITIVE_INFINITY));
    }
    if (sort === "desc") {
      return [...list].sort((a, b) => (priceOf(b) ?? Number.NEGATIVE_INFINITY) - (priceOf(a) ?? Number.NEGATIVE_INFINITY));
    }
    return list;
  }, [rows, budget, sort]);
  const covers = useMemo(
    () => assignServiceCovers(shown.map((service) => ({ ...service, images: (service.images || []).map((src) => serviceImageSrc(src)) }))),
    [shown],
  );
  const filtersActive = Boolean(appliedQ || category || budget !== "all" || sort !== "recommended");

  return (
    <>
      <Seo
        title={`探索服務｜${BRAND_WORDMARK}`}
        description={SERVICES_DESCRIPTION}
        path="/services"
        jsonLd={graph(
          organizationJsonLd(),
          websiteJsonLd(),
          professionalServiceJsonLd(),
          breadcrumbJsonLd([
            { name: "首頁", path: "/" },
            { name: "探索服務", path: "/services" },
          ]),
          rows && rows.length ? serviceItemListJsonLd(rows) : null,
        )}
      />
      <SiteHeader />
      <main className="fl-market">
        <Breadcrumbs items={[{ name: "首頁", to: "/" }, { name: "探索服務" }]} />
        <SecHead className="fl-market-head" as="h1" eyebrow="服務市集" title="探索標準化服務" sub="以透明定價的服務包開始合作。可依類別與關鍵字篩選，點進頁面即可比較 Basic／Standard／Premium 方案。" />
        <form role="search" className="fl-search fl-market-search" onSubmit={(e: FormEvent) => { e.preventDefault(); apply(q, category); }} style={{ marginBottom: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, boxShadow: "0 18px 40px rgba(46,106,76,.08)" }}>
          <div style={{ flex: "1 1 180px", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", minWidth: 0 }}>
            <Icon name="search" color={C.ink3} />
            <label className="fl-sr" htmlFor="service-search">搜尋服務</label>
            <input id="service-search" className="fl-input" value={q} placeholder="搜尋服務、類別或人才姓名" onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }} />
          </div>
          <button type="submit" className="fl-btn fl-primary" style={{ ...btn("primary"), padding: "13px 28px" }}>搜尋</button>
        </form>
        <div className="fl-market-cats">
          {tabs.map((c) => (
            <Pill key={c} active={(c === "全部" && !category) || c === category} onClick={() => apply(appliedQ, c === "全部" ? "" : c)}>{c}</Pill>
          ))}
        </div>

        <div className="fl-market-tools">
          <div className="fl-market-count">{rows === null && !error ? "載入服務中…" : `共 ${shown.length} 項服務`}</div>
          <label className="fl-market-field">
            <span className="fl-market-field-label">預算篩選</span>
            <select aria-label="預算篩選" value={budget} onChange={(e) => setBudget(e.target.value as Budget)}>
              <option value="all">全部預算</option>
              <option value="under">NT$20,000 以下</option>
              <option value="mid">NT$20,000–50,000</option>
              <option value="over">NT$50,000 以上</option>
            </select>
          </label>
          <label className="fl-market-field">
            <span className="fl-market-field-label">排序</span>
            <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recommended">推薦排序</option>
              <option value="asc">價格由低到高</option>
              <option value="desc">價格由高到低</option>
            </select>
          </label>
          {filtersActive ? (
            <button type="button" className="fl-market-clear" onClick={clearAll}>清除篩選</button>
          ) : null}
        </div>

        {rows === null && error ? (
          <div className="fl-svc-status" style={{ color: "#B4533C" }}>{error}</div>
        ) : rows === null ? (
          <div className="fl-svc-status" style={{ color: C.ink3 }}>載入服務中…</div>
        ) : shown.length === 0 ? (
          <div className="fl-svc-empty">
            <h2>目前沒有符合的服務</h2>
            <p>換個關鍵字、類別或預算再試試看，或直接看全部上架服務。</p>
            <button type="button" onClick={clearAll}>查看全部服務</button>
          </div>
        ) : (
          <div className="fl-market-grid">
            {shown.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                cover={covers.get(service.id) || { src: "", position: "center center" }}
                saved={favIds.has(service.id)}
                pending={pendingFav === service.id}
                onToggle={(id) => { void toggleFav(id); }}
              />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
