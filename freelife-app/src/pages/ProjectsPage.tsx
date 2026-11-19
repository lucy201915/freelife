import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { getSb } from "../lib/supabase";
import { C, btn, card, fmt, grid, wrap } from "../lib/theme";
import { asStringList, firstOf } from "../lib/text";
import { Icon, SecHead } from "../components/ui";

export type ProjectListItem = {
  id: string;
  title: string;
  brief: string;
  tags: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  status: string;
  timeline: string;
  clientName: string;
  clientCompany: string;
};

const SELECT_WITH_TIMELINE = "id, title, brief, tags, budget_min, budget_max, status, timeline, profiles!requests_business_id_fkey(name, company)";
const SELECT_BASE = "id, title, brief, tags, budget_min, budget_max, status, profiles!requests_business_id_fkey(name, company)";

export function budgetLabel(min: number | null, max: number | null): string {
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)} 起`;
  if (max) return `${fmt(max)} 以內`;
  return "預算面議";
}

export function statusLabel(status: string): string {
  if (status === "open") return "開放應徵";
  if (status === "closed") return "已結束";
  if (status === "active") return "進行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status || "未提供";
}

function mapRow(row: Record<string, unknown>): ProjectListItem {
  const client = firstOf(row.profiles as { name?: string; company?: string } | { name?: string; company?: string }[] | null);
  return {
    id: String(row.id || ""),
    title: String(row.title || "未命名專案"),
    brief: String(row.brief || ""),
    tags: asStringList(row.tags),
    budgetMin: row.budget_min == null ? null : Number(row.budget_min),
    budgetMax: row.budget_max == null ? null : Number(row.budget_max),
    status: String(row.status || "open"),
    timeline: String(row.timeline || ""),
    clientName: String(client?.name || "企業雇主"),
    clientCompany: String(client?.company || ""),
  };
}

export async function loadOpenProjects(): Promise<ProjectListItem[]> {
  const sb = getSb();
  if (!sb) throw new Error("尚未連上資料庫");
  const withTimeline = await sb.from("requests").select(SELECT_WITH_TIMELINE).eq("status", "open").order("created_at", { ascending: false });
  if (!withTimeline.error) return ((withTimeline.data || []) as Record<string, unknown>[]).map(mapRow);
  if (!/timeline/i.test(withTimeline.error.message)) throw withTimeline.error;
  const base = await sb.from("requests").select(SELECT_BASE).eq("status", "open").order("created_at", { ascending: false });
  if (base.error) throw base.error;
  return ((base.data || []) as Record<string, unknown>[]).map(mapRow);
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "找專案｜FREELI";
    let cancelled = false;
    (async () => {
      try {
        const data = await loadOpenProjects();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "無法載入專案");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((project) => !term || `${project.title}${project.brief}${project.clientName}${project.clientCompany}${project.tags.join("")}`.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <>
      <SiteHeader />
      <div className="fl-sec" style={{ ...wrap, paddingTop: 56, paddingBottom: 88 }}>
        <SecHead eyebrow="找專案" title="瀏覽開放中的專案" sub="企業留下的需求會出現在這裡。點進專案可查看預算、時程與需要的技能，並應徵或聯絡發布者。" />
        <div className="fl-search" style={{ marginBottom: 22, background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
            <Icon name="search" color={C.ink3} />
            <input className="fl-input" value={q} placeholder="搜尋專案、公司或技能" onChange={(e) => setQ(e.target.value)} style={{ flex: 1, border: "none", background: "transparent", fontSize: 16, color: C.ink, padding: "12px 0" }} />
          </div>
        </div>
        {error ? <div style={{ ...card, padding: 28, color: "#B4533C" }}>{error}</div> : null}
        {rows === null && !error ? <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink3 }}>載入專案中…</div> : null}
        {rows && !shown.length ? (
          <div style={{ ...card, padding: 40, textAlign: "center", color: C.ink2 }}>
            {rows.length ? "沒有符合的專案。" : "目前沒有開放中的專案。"}
          </div>
        ) : null}
        <div style={grid(320, 22)}>
          {shown.map((project) => (
            <div key={project.id} className="fl-card" style={{ ...card, padding: 26, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }} onClick={() => navigate(`/projects/${project.id}`)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.forest2, background: C.sageMist, borderRadius: 999, padding: "4px 12px" }}>{statusLabel(project.status)}</span>
                <span style={{ fontSize: 13, color: C.ink3 }}>{project.clientCompany || project.clientName}</span>
              </div>
              <h3 style={{ margin: 0, fontSize: 20, lineHeight: 1.45, color: C.ink }}>{project.title}</h3>
              <p style={{ margin: 0, color: C.ink2, fontSize: 15, lineHeight: 1.7 }}>{project.brief || "尚未填寫專案說明"}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {project.tags.length ? project.tags.map((tag) => <span key={tag} style={{ fontSize: 12, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "3px 9px" }}>{tag}</span>) : <span style={{ fontSize: 13, color: C.ink3 }}>尚未列出技能</span>}
              </div>
              <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "space-between", gap: 8, color: C.ink3, fontSize: 14 }}>
                <span>{budgetLabel(project.budgetMin, project.budgetMax)}</span>
                <span>{project.timeline || "時程未提供"}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28 }}>
          <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => navigate("/talents")}>改找專業人才</button>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
