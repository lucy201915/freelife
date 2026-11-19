import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { ensureConversation } from "../lib/chat";
import { findSampleTalent } from "../lib/samples";
import { getSb, rpcMessage } from "../lib/supabase";
import { C, btn, card, fmt, wrap } from "../lib/theme";
import { UUID_RE, asStringList, firstOf } from "../lib/text";
import { Icon, Photo, Stars, initialsOf } from "../components/ui";

type TalentView = {
  id: string;
  name: string;
  username: string;
  headline: string;
  location: string;
  languages: string;
  bio: string;
  skills: string[];
  hourlyMin: number;
  hourlyMax: number;
  projectMin: number;
  projectMax: number;
  linkedin: string;
  sample: boolean;
  img: string;
  years: number;
  rating: number;
  reviewCount: number;
};

type WorkItem = { id: string; title: string; summary: string; outcome: string };
type ReviewItem = { id: string; rating: number; comment: string; reviewer_name: string };
type ServiceItem = { id: string; slug: string; title: string; category: string };
type RequestOption = { id: string; title: string };

function rangeLabel(min: number, max: number): string {
  if (min > 0 && max > 0) return `${fmt(min)} – ${fmt(max)}`;
  if (min > 0) return `${fmt(min)} 起`;
  if (max > 0) return `${fmt(max)} 以內`;
  return "尚未設定";
}

export default function TalentProfilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { sb, profile, openAuth, setNotice, openRequest } = useAuth();
  const [talent, setTalent] = useState<TalentView | null | undefined>(undefined);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [requests, setRequests] = useState<RequestOption[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTalent(undefined);
    setError("");
    (async () => {
      const client = getSb();
      if (!client) {
        const sample = findSampleTalent(id);
        if (!cancelled) setTalent(sample ? fromSample(sample) : null);
        return;
      }
      try {
        const view = await loadTalent(id);
        if (cancelled) return;
        if (!view) {
          setTalent(null);
          return;
        }
        setTalent(view);
        if (view.sample) {
          setWorks([]);
          setReviews([]);
          setServices([]);
          return;
        }
        const [portfolio, cases, svcs] = await Promise.all([
          client.from("portfolio_items").select("id, title, summary, outcome").eq("user_id", view.id).order("sort"),
          client.from("case_studies").select("id, title, context, metric_value, metric_label").eq("user_id", view.id).order("sort"),
          client.from("services").select("id, slug, title, category").eq("talent_id", view.id).eq("status", "active"),
        ]);
        const workItems: WorkItem[] = [
          ...((portfolio.data || []) as { id: string; title: string; summary: string; outcome: string }[]).map((item) => ({
            id: item.id, title: item.title, summary: item.summary, outcome: item.outcome,
          })),
          ...((cases.data || []) as { id: string; title: string; context: string; metric_value: string; metric_label: string }[]).map((item) => ({
            id: item.id, title: item.title, summary: item.context, outcome: [item.metric_value, item.metric_label].filter(Boolean).join(" "),
          })),
        ];
        const serviceRows = (svcs.data || []) as ServiceItem[];
        let reviewRows: ReviewItem[] = [];
        if (serviceRows.length) {
          const reviewRes = await client.from("service_reviews").select("id, rating, comment, reviewer_name").in("service_id", serviceRows.map((row) => row.id));
          reviewRows = (reviewRes.data || []) as ReviewItem[];
        }
        if (cancelled) return;
        setWorks(workItems);
        setServices(serviceRows);
        setReviews(reviewRows);
        if (reviewRows.length) {
          const avg = reviewRows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / reviewRows.length;
          setTalent({ ...view, rating: avg, reviewCount: reviewRows.length });
        }
      } catch (err) {
        if (!cancelled) {
          setError(rpcMessage(err));
          setTalent(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    document.title = talent ? `${talent.name}｜FREELI` : "人才檔案｜FREELI";
  }, [talent]);

  const startChat = async () => {
    if (!talent || talent.sample) {
      setNotice("這是示意檔案，請改從資料庫中的人才開始對話");
      return;
    }
    if (!profile) {
      setNotice("請先以企業雇主帳號登入");
      openAuth("login", "business");
      return;
    }
    if (profile.role !== "business") {
      setNotice("請使用企業雇主帳號開始對話");
      return;
    }
    if (profile.id === talent.id) {
      setNotice("這是你的檔案");
      return;
    }
    setBusy(true);
    try {
      const conversationId = await ensureConversation({
        businessId: profile.id,
        talentId: talent.id,
        subject: talent.headline || `${talent.name}的合作洽詢`,
      });
      navigate(`/messages/${conversationId}`);
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openInvite = async () => {
    if (!talent || talent.sample) {
      setNotice("這是示意檔案，請改邀請資料庫中的人才");
      return;
    }
    if (!profile) {
      openAuth("login", "business");
      return;
    }
    if (profile.role !== "business" || !sb) {
      setNotice("請使用企業雇主帳號邀請人才");
      return;
    }
    setInviteOpen(true);
    const { data, error: loadError } = await sb.from("requests").select("id, title").eq("business_id", profile.id).eq("status", "open").order("created_at", { ascending: false });
    if (loadError) setNotice(loadError.message);
    setRequests((data || []) as RequestOption[]);
  };

  const sendInvite = async (request: RequestOption) => {
    if (!sb || !profile || !talent) return;
    setBusy(true);
    try {
      const conversationId = await ensureConversation({
        businessId: profile.id,
        talentId: talent.id,
        subject: request.title,
        requestId: request.id,
      });
      const { error: inviteError } = await sb.from("invites").insert({
        business_id: profile.id,
        talent_id: talent.id,
        kind: "quote",
        note: `邀請你加入專案「${request.title}」`,
        conversation_id: conversationId,
      });
      if (inviteError) setNotice(inviteError.message);
      else setNotice("已送出邀請");
      navigate(`/messages/${conversationId}`);
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (talent === undefined && !error) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center", color: C.ink3 }}>載入人才檔案中…</div>
        <SiteFooter />
      </>
    );
  }

  if (!talent) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 30, color: C.ink }}>找不到這位人才</h1>
          <p style={{ color: C.ink2 }}>{error || "檔案可能尚未公開，或網址不正確。"}</p>
          <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => navigate("/talents")}>回到找專業</button>
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <div style={{ ...wrap, paddingTop: 36, paddingBottom: 88 }}>
        <div style={{ fontSize: 13, color: C.ink3, marginBottom: 18 }}>
          <span className="fl-link" onClick={() => navigate("/talents")}>找專業</span>
          <span> ／ {talent.name}</span>
        </div>
        {talent.sample ? (
          <div style={{ ...card, padding: "14px 18px", marginBottom: 18, background: C.goldLight, color: "#7A5F2E" }}>
            這是首頁示意卡片，資料庫裡沒有對應檔案。技能與報價僅供瀏覽，不能開始對話。
          </div>
        ) : null}
        <div className="fl-gig" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.7fr)", gap: 28, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 28 }}>
              <div style={{ width: 168, flexShrink: 0 }}>
                <Photo src={talent.img} alt={`${talent.name}的專業形象照`} height={168} radius={28} initials={initialsOf(talent.name)} />
                {!talent.img ? <div style={{ fontSize: 12, color: C.ink3, textAlign: "center", marginTop: 8 }}>尚未上傳形象照</div> : null}
              </div>
              <div style={{ flex: "1 1 240px" }}>
                <h1 style={{ margin: 0, fontSize: 34, color: C.ink }}>{talent.name}</h1>
                <div style={{ fontSize: 18, color: C.ink2, marginTop: 6 }}>{talent.headline || "尚未填寫職稱"}</div>
                <div style={{ fontSize: 14, color: C.ink3, marginTop: 6 }}>{talent.location || "地點未提供"}{talent.languages ? `・${talent.languages}` : ""}</div>
                <div style={{ marginTop: 12 }}>
                  {talent.reviewCount > 0 ? <Stars value={talent.rating} reviews={talent.reviewCount} /> : <span style={{ color: C.ink3, fontSize: 14 }}>{talent.sample ? "示意評價，不是訂單評價" : "尚無評價"}</span>}
                </div>
                {talent.years > 0 ? <div style={{ marginTop: 10, color: C.forest, fontWeight: 700 }}>認證 {talent.years} 年資歷</div> : <div style={{ marginTop: 10, color: C.forest, fontWeight: 700 }}>認證人才</div>}
              </div>
            </div>

            <Section title="技能">
              {talent.skills.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {talent.skills.map((skill) => <span key={skill} style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", color: C.ink2 }}>{skill}</span>)}
                </div>
              ) : <Empty>尚未列出技能</Empty>}
            </Section>
            <Section title="自我介紹">
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: C.ink2, lineHeight: 1.85 }}>{talent.bio || "尚未填寫自我介紹。"}</p>
            </Section>
            <Section title="作品與過往合作">
              {works.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14 }}>
                  {works.map((work) => (
                    <div key={work.id} style={{ ...card, padding: 16 }}>
                      <div style={{ fontWeight: 700, color: C.ink }}>{work.title}</div>
                      {work.summary ? <div style={{ color: C.ink2, marginTop: 6, fontSize: 14 }}>{work.summary}</div> : null}
                      {work.outcome ? <div style={{ color: C.forest, marginTop: 8, fontWeight: 700 }}>{work.outcome}</div> : null}
                    </div>
                  ))}
                </div>
              ) : <Empty>尚未提供作品或過往合作。</Empty>}
            </Section>
            <Section title="上架服務">
              {services.length ? services.map((service) => (
                <Link key={service.id} to={`/services/${service.slug}`} style={{ display: "block", textDecoration: "none", color: "inherit", marginBottom: 8 }}>
                  <div style={{ ...card, padding: 16 }}>
                    <div style={{ fontSize: 13, color: C.forest2 }}>{service.category}</div>
                    <div style={{ fontWeight: 700 }}>{service.title}</div>
                  </div>
                </Link>
              )) : <Empty>尚未上架服務。</Empty>}
            </Section>
            <Section title="評價">
              {reviews.length ? reviews.map((review) => (
                <div key={review.id} style={{ ...card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <b>{review.reviewer_name || "企業雇主"}</b>
                    <Stars value={review.rating} />
                  </div>
                  {review.comment ? <p style={{ color: C.ink2, marginBottom: 0 }}>{review.comment}</p> : null}
                </div>
              )) : <Empty>尚無評價。完成訂單後，企業雇主可以留下評價。</Empty>}
            </Section>
          </div>

          <div style={{ ...card, padding: 22, position: "sticky", top: 96 }}>
            <div style={{ fontSize: 13, color: C.ink3, marginBottom: 8 }}>合作報價</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <span style={{ color: C.ink2 }}>時薪</span>
              <b style={{ color: C.forest }}>{rangeLabel(talent.hourlyMin, talent.hourlyMax)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <span style={{ color: C.ink2 }}>專案</span>
              <b style={{ color: C.forest }}>{talent.sample && talent.projectMin > 0 ? `${fmt(talent.projectMin)} 起` : rangeLabel(talent.projectMin, talent.projectMax)}</b>
            </div>
            {talent.linkedin ? <a href={talent.linkedin} style={{ color: C.forest2, fontSize: 14 }}>LinkedIn</a> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <button className="fl-btn fl-primary" disabled={busy} style={{ ...btn("primary", true), width: "100%" }} onClick={() => void startChat()}>
                開始對話 <Icon name="arrow" size={18} color={C.ivory} />
              </button>
              <button className="fl-btn fl-ghost" disabled={busy} style={{ ...btn("ghost", true), width: "100%" }} onClick={() => void openInvite()}>邀請加入專案</button>
            </div>
          </div>
        </div>
      </div>
      {inviteOpen ? (
        <div onClick={() => setInviteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,38,32,.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, padding: 28, width: "min(480px, 100%)", background: C.white }}>
            <h2 style={{ marginTop: 0 }}>邀請加入專案</h2>
            {requests === null ? <p style={{ color: C.ink3 }}>載入你的專案中…</p> : null}
            {requests && !requests.length ? (
              <div>
                <p style={{ color: C.ink2 }}>你還沒有開放中的專案。</p>
                <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => { setInviteOpen(false); openRequest(); }}>發布專案</button>
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(requests || []).map((request) => (
                <button key={request.id} className="fl-btn fl-ghost" disabled={busy} style={{ ...btn("ghost"), justifyContent: "flex-start" }} onClick={() => void sendInvite(request)}>{request.title}</button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <SiteFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, marginBottom: 12, color: C.ink }}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: C.ink3, background: C.ivory2, borderRadius: 16, padding: "16px 18px" }}>{children}</div>;
}

function fromSample(sample: NonNullable<ReturnType<typeof findSampleTalent>>): TalentView {
  return {
    id: "",
    name: sample.name,
    username: sample.slug || "",
    headline: sample.title,
    location: sample.city,
    languages: "",
    bio: "",
    skills: sample.skills,
    hourlyMin: 0,
    hourlyMax: 0,
    projectMin: sample.from,
    projectMax: 0,
    linkedin: "",
    sample: true,
    img: sample.img,
    years: sample.years,
    rating: sample.rating,
    reviewCount: sample.reviews,
  };
}

async function loadTalent(id: string): Promise<TalentView | null> {
  const sb = getSb();
  if (!sb) return null;
  let row: Record<string, unknown> | null = null;
  if (UUID_RE.test(id)) {
    const res = await sb.from("talent_profiles").select("user_id, headline, location, languages, bio, hourly_min, hourly_max, project_min, project_max, skills, linkedin_url, onboarded, profiles!talent_profiles_user_id_fkey(id, name, username)").eq("user_id", id).maybeSingle();
    if (res.error) throw res.error;
    row = res.data as Record<string, unknown> | null;
  } else {
    const profileRes = await sb.from("profiles").select("id, name, username, role").eq("username", id).maybeSingle();
    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data || profileRes.data.role !== "talent") {
      const sample = findSampleTalent(id);
      return sample ? fromSample(sample) : null;
    }
    const res = await sb.from("talent_profiles").select("user_id, headline, location, languages, bio, hourly_min, hourly_max, project_min, project_max, skills, linkedin_url, onboarded").eq("user_id", profileRes.data.id).maybeSingle();
    if (res.error) throw res.error;
    row = res.data ? { ...res.data, profiles: profileRes.data } : null;
  }
  if (!row || row.onboarded === false) {
    const sample = findSampleTalent(id);
    return sample ? fromSample(sample) : null;
  }
  const person = firstOf(row.profiles as { id?: string; name?: string; username?: string } | { id?: string; name?: string; username?: string }[] | null);
  return {
    id: String(person?.id || row.user_id || ""),
    name: String(person?.name || "專業人才"),
    username: String(person?.username || ""),
    headline: String(row.headline || ""),
    location: String(row.location || ""),
    languages: String(row.languages || ""),
    bio: String(row.bio || ""),
    skills: asStringList(row.skills),
    hourlyMin: Number(row.hourly_min || 0),
    hourlyMax: Number(row.hourly_max || 0),
    projectMin: Number(row.project_min || 0),
    projectMax: Number(row.project_max || 0),
    linkedin: String(row.linkedin_url || ""),
    sample: false,
    img: "",
    years: 0,
    rating: 0,
    reviewCount: 0,
  };
}
