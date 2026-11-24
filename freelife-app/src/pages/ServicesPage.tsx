import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Seo, breadcrumbJsonLd, graph, organizationJsonLd, professionalServiceJsonLd, serviceItemListJsonLd, websiteJsonLd } from "../components/Seo";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { useBootstrap } from "../lib/bootstrap";
import { BRAND_WORDMARK, SERVICES_DESCRIPTION } from "../lib/site";
import { C, CATEGORIES, btn, card, fmt, grid, wrap } from "../lib/theme";
import { listPublicServices, type PublicService } from "../lib/supabase";
import { Icon, Photo, Pill, SecHead, Stars, initialsOf } from "../components/ui";

export default function ServicesPage() {
  const boot = useBootstrap();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [rows, setRows] = useState<PublicService[] | null>(boot.services ?? null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
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

  const apply = (term = q, cat = category) => {
    const nextTerm = term.trim();
    setAppliedQ(nextTerm);
    setCategory(cat);
    setQ(term);
    const next = new URLSearchParams();
    if (nextTerm) next.set("q", nextTerm);
    if (cat) next.set("category", cat);
    setParams(next, { replace: true });
  };

  const tabs = useMemo(() => ["全部", ...CATEGORIES], []);

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
      <main className="fl-sec" style={{ ...wrap, paddingTop: 56, paddingBottom: 88 }}>
        <Breadcrumbs items={[{ name: "首頁", to: "/" }, { name: "探索服務" }]} />
        <SecHead as="h1" eyebrow="服務市集" title="探索標準化服務" sub="以透明定價的服務包開始合作。可依類別與關鍵字篩選，點進頁面即可比較 Basic／Standard／Premium 方案。" />
        <form role="search" className="fl-search" onSubmit={(e: FormEvent) => { e.preventDefault(); apply(q, category); }} style={{ marginBottom: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, boxShadow: "0 18px 40px rgba(31,61,43,.08)" }}>
          <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", minWidth: 0 }}>
            <Icon name="search" color={C.ink3} />
            <label className="fl-sr" htmlFor="service-search">搜尋服務</label>
            <input id="service-search" className="fl-input" value={q} placeholder="搜尋服務、類別或人才姓名" onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }} />
          </div>
          <button type="submit" className="fl-btn fl-primary" style={{ ...btn("primary"), padding: "13px 28px" }}>搜尋</button>
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
          {tabs.map((c) => (
            <Pill key={c} active={(c === "全部" && !category) || c === category} onClick={() => apply(appliedQ, c === "全部" ? "" : c)}>{c}</Pill>
          ))}
        </div>

        {rows === null && error ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: "#B4533C" }}>{error}</div>
        ) : rows === null ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink3 }}>載入服務中…</div>
        ) : rows.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink2 }}>
            目前沒有符合的服務。<button type="button" className="fl-link" style={{ border: "none", background: "transparent", color: C.forest2, fontWeight: 700 }} onClick={() => apply("", "")}>清除篩選</button>
          </div>
        ) : (
          <div style={grid(280)}>
            {rows.map((s) => {
              const img = s.images?.[0] || "";
              return (
                <Link key={s.id} to={`/services/${s.slug}`} className="fl-card" style={{ ...card, padding: 0, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}>
                  <Photo src={img} alt={s.title} height={180} radius={0} initials={initialsOf(s.talent_name)} />
                  <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.forest2, fontWeight: 600 }}>{s.category}</div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{s.title}</h2>
                    <div style={{ fontSize: 14, color: C.ink2 }}>{s.talent_name}{s.talent_location ? `・${s.talent_location}` : ""}</div>
                    <Stars value={s.avg_rating} reviews={s.review_count} />
                    <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, color: C.ink3 }}>{s.availability ? "可接案" : "暫停接案"}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.forest }}>{s.basic_price != null ? `由 ${fmt(s.basic_price)} 起` : "查看方案"}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
