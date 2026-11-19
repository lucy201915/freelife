import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { listPublicTalents } from "../lib/supabase";
import { SAMPLE_TALENTS, type Talent } from "../lib/samples";
import { C, btn, card, fmt, grid, wrap } from "../lib/theme";
import { asStringList } from "../lib/text";
import { Icon, Photo, SecHead, Stars, initialsOf } from "../components/ui";

export default function TalentsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Talent[] | null>(null);
  const [usingSample, setUsingSample] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "找專業｜FREELI";
    let cancelled = false;
    (async () => {
      try {
        const data = await listPublicTalents();
        if (cancelled) return;
        const mapped = data.map((row) => ({
          id: row.id,
          username: row.username,
          name: row.name,
          title: row.headline || "專業人才",
          years: 0,
          type: "專業人才" as const,
          skills: asStringList(row.skills),
          rating: 0,
          reviews: 0,
          from: Number(row.project_min) > 0 ? Number(row.project_min) : Number(row.hourly_min) || 0,
          img: "",
          city: row.location || "",
        }));
        if (!mapped.length) {
          setRows(SAMPLE_TALENTS);
          setUsingSample(true);
        } else {
          setRows(mapped);
          setUsingSample(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[FREELI] talent directory unavailable", err);
        setError("");
        setRows(SAMPLE_TALENTS);
        setUsingSample(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((talent) => !term || `${talent.name}${talent.title}${talent.city}${talent.skills.join("")}`.toLowerCase().includes(term));
  }, [rows, q]);

  const open = (talent: Talent) => {
    const key = talent.username || talent.slug || talent.id;
    if (key) navigate(`/talents/${key}`);
  };

  return (
    <>
      <SiteHeader />
      <div className="fl-sec" style={{ ...wrap, paddingTop: 56, paddingBottom: 88 }}>
        <SecHead eyebrow="找專業" title="瀏覽認證專業人才" sub="點進人才卡片，查看經歷、技能、報價與過往作品，並開始對話或邀請加入專案。" />
        <div className="fl-search" style={{ marginBottom: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
            <Icon name="search" color={C.ink3} />
            <input className="fl-input" value={q} placeholder="搜尋姓名、職稱、技能或城市" onChange={(e) => setQ(e.target.value)} style={{ flex: 1, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }} />
          </div>
        </div>
        {usingSample ? <p style={{ color: C.ink3, marginTop: 0 }}>目前顯示首頁示意人才。連上資料庫後會改為實際檔案。</p> : null}
        {error ? <div style={{ ...card, padding: 28, color: "#B4533C" }}>{error}</div> : null}
        {rows === null ? <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink3 }}>載入人才中…</div> : null}
        {rows && !shown.length ? <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink2 }}>沒有符合的人才。</div> : null}
        <div style={grid(250, 22)}>
          {shown.map((talent) => (
            <div key={talent.username || talent.slug || talent.name} className="fl-card" style={{ ...card, cursor: "pointer" }} onClick={() => open(talent)}>
              <div style={{ padding: 10 }}>
                <Photo src={talent.img} alt={`${talent.name}的專業形象照`} height={220} radius={16} initials={initialsOf(talent.name)} />
              </div>
              <div style={{ padding: "4px 22px 22px" }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.ink }}>{talent.name}</div>
                <div style={{ fontSize: 15, color: C.ink2, marginTop: 4 }}>{talent.title}</div>
                <div style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>{talent.city || "地點未提供"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {talent.skills.length ? talent.skills.map((skill) => <span key={skill} style={{ fontSize: 12, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "3px 9px" }}>{skill}</span>) : <span style={{ fontSize: 13, color: C.ink3 }}>尚未列出技能</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  {talent.rating > 0 ? <Stars value={talent.rating} reviews={talent.reviews} /> : <span style={{ fontSize: 13, color: C.ink3 }}>尚無評價</span>}
                  <span style={{ fontSize: 13, color: C.ink3 }}>{talent.from > 0 ? <>起價 <b style={{ color: C.forest }}>{fmt(talent.from)}</b></> : "報價面議"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28 }}>
          <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => navigate("/projects")}>改看開放中的專案</button>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
