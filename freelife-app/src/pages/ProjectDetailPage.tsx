import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { ensureConversation } from "../lib/chat";
import { getSb, rpcMessage } from "../lib/supabase";
import { C, btn, card, wrap } from "../lib/theme";
import { asStringList, firstOf, formatWhen } from "../lib/text";
import { Field } from "../components/ui";
import { budgetLabel, statusLabel, type ProjectListItem } from "./ProjectsPage";

type ProjectDetail = ProjectListItem & {
  businessId: string;
  createdAt: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  note: string;
  created_at: string;
  talentName: string;
  username: string;
};

const DETAIL_WITH_TIMELINE = "id, business_id, title, brief, tags, budget_min, budget_max, status, timeline, created_at, profiles!requests_business_id_fkey(name, company)";
const DETAIL_BASE = "id, business_id, title, brief, tags, budget_min, budget_max, status, created_at, profiles!requests_business_id_fkey(name, company)";

export default function ProjectDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { sb, profile, openAuth, setNotice } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<string>("");
  const [applications, setApplications] = useState<ApplicationRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setProject(undefined);
    setError("");
    (async () => {
      const client = getSb();
      if (!client) {
        if (!cancelled) {
          setError("尚未連上資料庫");
          setProject(null);
        }
        return;
      }
      try {
        let res = await client.from("requests").select(DETAIL_WITH_TIMELINE).eq("id", id).maybeSingle();
        if (res.error && /timeline/i.test(res.error.message)) {
          res = await client.from("requests").select(DETAIL_BASE).eq("id", id).maybeSingle();
        }
        if (res.error) throw res.error;
        if (!res.data) {
          if (!cancelled) setProject(null);
          return;
        }
        const row = res.data as Record<string, unknown>;
        const clientProfile = firstOf(row.profiles as { name?: string; company?: string } | { name?: string; company?: string }[] | null);
        if (!cancelled) {
          setProject({
            id: String(row.id),
            businessId: String(row.business_id || ""),
            title: String(row.title || "未命名專案"),
            brief: String(row.brief || ""),
            tags: asStringList(row.tags),
            budgetMin: row.budget_min == null ? null : Number(row.budget_min),
            budgetMax: row.budget_max == null ? null : Number(row.budget_max),
            status: String(row.status || ""),
            timeline: String(row.timeline || ""),
            createdAt: String(row.created_at || ""),
            clientName: String(clientProfile?.name || "企業雇主"),
            clientCompany: String(clientProfile?.company || ""),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(rpcMessage(err));
          setProject(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    document.title = project ? `${project.title}｜FREELI` : "專案｜FREELI";
  }, [project]);

  useEffect(() => {
    if (!sb || !profile || !project) return;
    let cancelled = false;
    (async () => {
      if (profile.role === "talent") {
        const { data } = await sb.from("applications").select("status").eq("request_id", project.id).eq("talent_id", profile.id).maybeSingle();
        if (!cancelled) setMine(String(data?.status || ""));
      }
      if (profile.id === project.businessId) {
        const { data } = await sb.from("applications").select("id, status, note, created_at, talent_id, profiles!applications_talent_id_fkey(name, username)").eq("request_id", project.id).order("created_at", { ascending: false });
        if (cancelled) return;
        setApplications(((data || []) as Record<string, unknown>[]).map((row) => {
          const person = firstOf(row.profiles as { name?: string; username?: string } | { name?: string; username?: string }[] | null);
          return {
            id: String(row.id),
            status: String(row.status || ""),
            note: String(row.note || ""),
            created_at: String(row.created_at || ""),
            talentName: String(person?.name || "人才"),
            username: String(person?.username || row.talent_id || ""),
          };
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [sb, profile, project]);

  const apply = async () => {
    if (!project || !sb) return;
    if (!profile) {
      openAuth("login", "talent");
      return;
    }
    if (profile.role !== "talent") {
      setNotice("請使用人才帳號應徵");
      return;
    }
    if (mine) {
      setNotice("你已經應徵過這個專案");
      return;
    }
    setBusy(true);
    try {
      const { error: insertError } = await sb.from("applications").insert({
        request_id: project.id,
        talent_id: profile.id,
        note: note.trim(),
      });
      if (insertError) throw insertError;
      setMine("pending");
      setNotice("已送出應徵");
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const contact = async () => {
    if (!project) return;
    if (!profile) {
      navigate(`/messages/new?request=${project.id}`);
      return;
    }
    if (profile.role !== "talent") {
      setNotice("請使用人才帳號聯絡發布者");
      return;
    }
    setBusy(true);
    try {
      const conversationId = await ensureConversation({
        businessId: project.businessId,
        talentId: profile.id,
        subject: project.title,
        requestId: project.id,
      });
      navigate(`/messages/${conversationId}`);
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (project === undefined && !error) {
    return (<><SiteHeader /><div style={{ ...wrap, padding: "80px 24px", textAlign: "center", color: C.ink3 }}>載入專案中…</div><SiteFooter /></>);
  }
  if (!project) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 30, color: C.ink }}>找不到這個專案</h1>
          <p style={{ color: C.ink2 }}>{error || "專案可能已結束，或網址不正確。"}</p>
          <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => navigate("/projects")}>回到找專案</button>
        </div>
        <SiteFooter />
      </>
    );
  }

  const owner = profile?.id === project.businessId;
  const client = project.clientCompany ? `${project.clientCompany}・${project.clientName}` : project.clientName;

  return (
    <>
      <SiteHeader />
      <div style={{ ...wrap, paddingTop: 36, paddingBottom: 88 }}>
        <div style={{ fontSize: 13, color: C.ink3, marginBottom: 18 }}>
          <span className="fl-link" onClick={() => navigate("/projects")}>找專案</span>
          <span> ／ {project.title}</span>
        </div>
        <div className="fl-gig" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 0.72fr)", gap: 28, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.forest2, marginBottom: 8 }}>{statusLabel(project.status)}</div>
            <h1 style={{ margin: "0 0 12px", fontSize: "clamp(28px, 4vw, 40px)", color: C.ink }}>{project.title}</h1>
            <div style={{ color: C.ink2, marginBottom: 22 }}>委託方：{client}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12, marginBottom: 28 }}>
              <Fact label="預算" value={budgetLabel(project.budgetMin, project.budgetMax)} />
              <Fact label="時程" value={project.timeline || "尚未提供時程"} />
              <Fact label="狀態" value={statusLabel(project.status)} />
              <Fact label="發布時間" value={formatWhen(project.createdAt) || "未提供"} />
            </div>
            <Section title="專案說明">
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: C.ink2, lineHeight: 1.85 }}>{project.brief || "尚未填寫專案說明。"}</p>
            </Section>
            <Section title="需要的技能">
              {project.tags.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {project.tags.map((tag) => <span key={tag} style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", color: C.ink2 }}>{tag}</span>)}
                </div>
              ) : <p style={{ color: C.ink3 }}>尚未列出需要的技能。</p>}
            </Section>
            {owner ? (
              <Section title="應徵">
                {applications.length ? applications.map((row) => (
                  <div key={row.id} style={{ ...card, padding: 16, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <b>{row.username ? <span className="fl-link" onClick={() => navigate(`/talents/${row.username}`)}>{row.talentName}</span> : row.talentName}</b>
                      <span style={{ color: C.ink3 }}>{row.status === "pending" ? "待回覆" : row.status === "accepted" ? "已接受" : row.status === "declined" ? "已婉拒" : row.status}</span>
                    </div>
                    {row.note ? <p style={{ color: C.ink2, marginBottom: 0 }}>{row.note}</p> : <p style={{ color: C.ink3, marginBottom: 0 }}>沒有附加說明。</p>}
                  </div>
                )) : <p style={{ color: C.ink3 }}>還沒有人應徵。</p>}
              </Section>
            ) : null}
          </div>
          <div style={{ ...card, padding: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>參與這個專案</div>
            <p style={{ color: C.ink2, marginTop: 0 }}>應徵會送給發布者。聯絡會開啟你們的對話，並可在對話中產生合約草稿。</p>
            {owner ? <p style={{ color: C.forest }}>這是你發布的專案。</p> : null}
            {!owner && profile?.role === "talent" ? (
              mine ? <p style={{ color: C.forest }}>你已應徵，狀態：{mine === "pending" ? "待回覆" : mine}</p> : <Field label="應徵說明（選填）" value={note} textarea onChange={setNote} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!owner ? <button className="fl-btn fl-primary" disabled={busy || project.status !== "open" || !!mine} style={{ ...btn("primary", true), width: "100%" }} onClick={() => void apply()}>{project.status === "open" ? (mine ? "已應徵" : "我要應徵") : "專案未開放應徵"}</button> : null}
              {!owner ? <button className="fl-btn fl-ghost" disabled={busy} style={{ ...btn("ghost", true), width: "100%" }} onClick={() => void contact()}>聯絡發布者</button> : null}
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ marginBottom: 28 }}><h2 style={{ fontSize: 20, color: C.ink }}>{title}</h2>{children}</section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: C.ink3 }}>{label}</div>
      <div style={{ fontWeight: 700, color: C.ink, marginTop: 4 }}>{value}</div>
    </div>
  );
}
