import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { C, CATEGORIES, btn, card, fmt, grid, wrap } from "../lib/theme";
import { listPublicServices, type PublicService } from "../lib/supabase";
import { Icon, Photo, Pill, SecHead, Stars, initialsOf } from "../components/ui";

export default function ServicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q0 = params.get("q") || "";
  const cat0 = params.get("category") || "全部";
  const [q, setQ] = useState(q0);
  const [category, setCategory] = useState(cat0 === "全部" ? "" : cat0);
  const [appliedQ, setAppliedQ] = useState(q0);
  const [rows, setRows] = useState<PublicService[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "探索服務｜FREELIFE";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setRows(null);
    (async () => {
      try {
        const data = await listPublicServices(appliedQ, category);
        if (!cancelled) setRows(data);
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "無法載入服務");
      }
    })();
    return () => { cancelled = true; };
  }, [appliedQ, category]);

  const apply = (term = q, cat = category) => {
    setAppliedQ(term.trim());
    setCategory(cat);
    const next = new URLSearchParams();
    if (term.trim()) next.set("q", term.trim());
    if (cat) next.set("category", cat);
    setParams(next, { replace: true });
  };

  const tabs = useMemo(() => ["全部", ...CATEGORIES], []);

  return (
    <>
      <SiteHeader />
      <div className="fl-sec" style={{ ...wrap, paddingTop: 56, paddingBottom: 88 }}>
        <SecHead eyebrow="服務市集" title="探索標準化服務" sub="以透明定價的服務包開始合作。可依類別與關鍵字篩選，點進頁面即可比較 Basic／Standard／Premium 方案。" />
        <div className="fl-search" style={{ marginBottom: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, boxShadow: "0 18px 40px rgba(31,61,43,.08)" }}>
          <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 10, padding: "0 12px", minWidth: 0 }}>
            <Icon name="search" color={C.ink3} />
            <input className="fl-input" value={q} placeholder="搜尋服務、類別或人才姓名" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) apply(q, category); }} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }} />
          </div>
          <button className="fl-btn fl-primary" style={{ ...btn("primary"), padding: "13px 28px" }} onClick={() => apply(q, category)}>搜尋</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
          {tabs.map((c) => (
            <Pill key={c} active={(c === "全部" && !category) || c === category} onClick={() => { setQ(q); apply(appliedQ, c === "全部" ? "" : c); }}>{c}</Pill>
          ))}
        </div>

        {error ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: "#B4533C" }}>{error}</div>
        ) : rows === null ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink3 }}>載入服務中…</div>
        ) : rows.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink2 }}>
            目前沒有符合的服務。<span className="fl-link" style={{ color: C.forest2, fontWeight: 700 }} onClick={() => apply("", "")}>清除篩選</span>
          </div>
        ) : (
          <div style={grid(280)}>
            {rows.map((s) => {
              const img = s.images?.[0] || "";
              return (
                <div key={s.id} className="fl-card" style={{ ...card, padding: 0, cursor: "pointer", display: "flex", flexDirection: "column" }} onClick={() => navigate(`/services/${s.slug}`)}>
                  <Photo src={img} alt={s.title} height={180} radius={0} initials={initialsOf(s.talent_name)} />
                  <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.forest2, fontWeight: 600 }}>{s.category}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: C.ink2 }}>{s.talent_name}{s.talent_location ? `・${s.talent_location}` : ""}</div>
                    <Stars value={s.avg_rating} reviews={s.review_count} />
                    <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, color: C.ink3 }}>{s.availability ? "可接案" : "暫停接案"}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.forest }}>{s.basic_price != null ? `由 ${fmt(s.basic_price)} 起` : "查看方案"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
