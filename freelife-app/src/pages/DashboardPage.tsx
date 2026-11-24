import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { BRAND_WORDMARK } from "../lib/site";
import { C, CATEGORIES, ORDER_STATUS_LABEL, TIER_LABEL, btn, card, fmt, wrap } from "../lib/theme";
import { publicMediaUrl, rpcMessage, type BillingPeriod, type FlProfile, type ServiceType } from "../lib/supabase";
import { SERVICE_TYPE_LABEL, SERVICE_TYPES, serviceTypeOf } from "../lib/service-display";
import { Field, Pill, Stars } from "../components/ui";

type Tab = "services" | "orders" | "messages" | "reviews" | "favorites" | "invites";

type PkgDraft = { tier: "basic" | "standard" | "premium"; name: string; price: string; delivery_days: string; revisions: string; features: string };
type FaqDraft = { id?: string; question: string; answer: string };
type PortDraft = { id?: string; title: string; summary: string; image_path: string };
type ServiceRow = {
  id: string; slug: string; title: string; category: string; description: string;
  images: string[]; status: string; availability: boolean; service_type?: string;
};

function emptyPackages(): PkgDraft[] {
  return [
    { tier: "basic", name: "", price: "3000", delivery_days: "5", revisions: "1", features: "需求釐清\n交付摘要" },
    { tier: "standard", name: "", price: "8000", delivery_days: "10", revisions: "2", features: "完整規劃\n兩次修訂\n線上會議" },
    { tier: "premium", name: "", price: "15000", delivery_days: "14", revisions: "3", features: "完整規劃與執行建議\n三次修訂\n追蹤會議" },
  ];
}

function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return ascii.length >= 3 ? ascii.slice(0, 80) : "";
}

function isValidSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 80;
}

type Sb = NonNullable<ReturnType<typeof useAuth>["sb"]>;

function featureLines(raw: string): string[] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean);
}

function missingColumn(err: unknown, column: string): boolean {
  const msg = String((err as { message?: string })?.message || "");
  return msg.includes(column) && /schema cache|does not exist|column/i.test(msg);
}

async function writeService(sb: Sb, id: string | null, body: Record<string, unknown>): Promise<string> {
  if (id) {
    const { error } = await sb.from("services").update(body).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await sb.from("services").insert(body).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

async function upsertPackage(sb: Sb, row: Record<string, unknown>): Promise<"full" | "legacy"> {
  const { error } = await sb.from("service_packages").upsert(row, { onConflict: "service_id,tier" });
  if (!error) return "full";
  if (row.name !== undefined && (missingColumn(error, "name") || missingColumn(error, "billing_period"))) {
    const rest: Record<string, unknown> = { ...row };
    delete rest.name;
    delete rest.billing_period;
    const retry = await sb.from("service_packages").upsert(rest, { onConflict: "service_id,tier" });
    if (retry.error) throw retry.error;
    return "legacy";
  }
  throw error;
}

function packageRow(serviceId: string, pkg: PkgDraft, billing: BillingPeriod, includeNew: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    service_id: serviceId,
    tier: pkg.tier,
    price: Number(pkg.price),
    delivery_days: Number(pkg.delivery_days),
    revisions: Number(pkg.revisions),
    features: featureLines(pkg.features),
  };
  if (includeNew) {
    row.name = pkg.name.trim();
    row.billing_period = billing;
  }
  return row;
}

async function writePackages(sb: Sb, serviceId: string, serviceType: ServiceType, packages: PkgDraft[], typeStored: boolean) {
  if (serviceType === "retainer") {
    if (!typeStored) throw new Error("資料庫尚未支援月費顧問，這次沒有變更方案。");
    const basic = packages.find((pkg) => pkg.tier === "basic");
    if (!basic) throw new Error("請填寫月費方案");
    const mode = await upsertPackage(sb, packageRow(serviceId, basic, "monthly", typeStored));
    if (mode === "legacy") {
      throw new Error("資料庫尚未支援每月計費，這次沒有刪除原有方案。");
    }
    const { error } = await sb.from("service_packages").delete().eq("service_id", serviceId).in("tier", ["standard", "premium"]);
    if (error) throw error;
    return;
  }
  for (const pkg of packages) {
    await upsertPackage(sb, packageRow(serviceId, pkg, "one_time", typeStored));
  }
}

async function uploadMedia(sb: NonNullable<ReturnType<typeof useAuth>["sb"]>, userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
  if (!["jpg", "png", "webp", "gif"].includes(ext)) throw new Error("請上傳 JPG、PNG、WEBP 或 GIF 圖片");
  if (file.size > 10 * 1024 * 1024) throw new Error("圖片需小於 10MB");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("service-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from("service-media").getPublicUrl(path);
  return data.publicUrl;
}

export default function DashboardPage() {
  const { sb, profile, openAuth } = useAuth();
  const isTalent = profile?.role === "talent";
  const isBusiness = profile?.role === "business";
  const defaultTab: Tab = isTalent ? "services" : "orders";
  const [tab, setTab] = useState<Tab>(defaultTab);

  useEffect(() => {
    if (profile) setTab(profile.role === "talent" ? "services" : "orders");
  }, [profile]);

  const seo = (
    <Seo
      title={`工作台｜${BRAND_WORDMARK}`}
      description="Freeli 工作台只供登入後管理自己的服務、訂單與訊息，不會對搜尋引擎公開。"
      path="/dashboard"
      noindex
    />
  );

  if (!profile) {
    return (
      <>
        {seo}
        <SiteHeader />
        <main style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 28, marginBottom: 12, color: C.ink }}>請先登入工作台</h1>
          <p style={{ color: C.ink2, marginBottom: 24 }}>登入後即可管理服務、訂單與訊息。</p>
          <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => openAuth("login")}>登入</button>
        </main>
        <SiteFooter />
      </>
    );
  }

  const tabs: { id: Tab; label: string }[] = isTalent
    ? [
        { id: "services", label: "我的服務" },
        { id: "orders", label: "訂單" },
        { id: "messages", label: "訊息" },
        { id: "reviews", label: "評價" },
      ]
    : [
        { id: "orders", label: "我的訂單" },
        { id: "favorites", label: "收藏" },
        { id: "invites", label: "邀請" },
        { id: "messages", label: "訊息" },
      ];

  return (
    <>
      {seo}
      <SiteHeader />
      <main style={{ ...wrap, paddingTop: 36, paddingBottom: 88 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 8 }}>工作台</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: C.ink }}>你好，{profile.name}</h1>
          <p style={{ color: C.ink2, marginTop: 8 }}>{isTalent ? "先完成人才檔案，公開後就會出現在首頁人才區。也可以在這裡管理服務、訂單與訊息。" : "追蹤合作進度、收藏與邀請。"}</p>
        </div>
        {isTalent ? <TalentProfileCard profile={profile} /> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
          {tabs.map((t) => (
            <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Pill>
          ))}
        </div>
        {tab === "services" && isTalent ? <TalentServices profile={profile} /> : null}
        {tab === "orders" ? <OrdersPanel profile={profile} /> : null}
        {tab === "messages" ? <MessagesPanel profile={profile} /> : null}
        {tab === "reviews" && isTalent ? <ReviewsPanel profile={profile} /> : null}
        {tab === "favorites" && isBusiness ? <FavoritesPanel profile={profile} /> : null}
        {tab === "invites" && isBusiness ? <InvitesPanel profile={profile} /> : null}
        {!sb ? <p style={{ color: "#B4533C" }}>尚未連上資料庫。</p> : null}
      </main>
      <SiteFooter />
    </>
  );
}

const SKILL_SPLIT = /[,，、\n]/;

function splitSkills(raw: string): string[] {
  return raw.split(SKILL_SPLIT).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function normalizeSkills(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const skill = item.replace(/\s+/g, " ").trim();
    if (!skill) continue;
    const key = skill.toLocaleLowerCase("zh-Hant");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

function skillsFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeSkills(value.map((item) => String(item)));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return normalizeSkills(parsed.map((item) => String(item)));
    } catch {
      /* plain text */
    }
    return normalizeSkills(splitSkills(trimmed));
  }
  return [];
}

function TalentProfileCard({ profile }: { profile: FlProfile }) {
  const { sb } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [publish, setPublish] = useState(false);
  const [savedPublic, setSavedPublic] = useState(false);
  const [hasRow, setHasRow] = useState(false);
  const [busy, setBusy] = useState<"public" | "draft" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!sb) {
      setLoading(false);
      setLoadError("尚未連上資料庫，暫時無法編輯檔案。");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await sb
        .from("talent_profiles")
        .select("headline, bio, skills, onboarded")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[FREELI] talent profile load failed", error);
        setLoadError("人才檔案暫時讀取不到，請重新整理後再試。");
        setLoading(false);
        return;
      }
      if (data) {
        const row = data as { headline?: string; bio?: string; skills?: unknown; onboarded?: boolean };
        setHeadline(row.headline || "");
        setBio(row.bio || "");
        setSkills(skillsFromJson(row.skills));
        setPublish(!!row.onboarded);
        setSavedPublic(!!row.onboarded);
        setHasRow(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sb, profile.id]);

  const commitDraft = () => {
    const next = normalizeSkills([...skills, ...splitSkills(skillDraft)]);
    if (next.length !== skills.length || skillDraft.trim()) setSkills(next);
    setSkillDraft("");
    return next;
  };

  const save = async (nextPublic: boolean) => {
    if (!sb) {
      setFeedback({ tone: "err", text: "尚未連上資料庫，暫時無法儲存。" });
      return;
    }
    const nextHeadline = headline.trim();
    const nextBio = bio.trim();
    const nextSkills = normalizeSkills([...skills, ...splitSkills(skillDraft)]);
    if (nextPublic && nextHeadline.length < 2) {
      setFeedback({ tone: "err", text: "公開前請先寫下一句話頭銜，讓企業知道你擅長什麼。" });
      return;
    }
    if (nextHeadline.length > 80) {
      setFeedback({ tone: "err", text: "一句話頭銜請控制在 80 字以內。" });
      return;
    }
    if (nextBio.length > 800) {
      setFeedback({ tone: "err", text: "簡介請控制在 800 字以內。" });
      return;
    }
    if (nextSkills.some((skill) => skill.length > 40)) {
      setFeedback({ tone: "err", text: "每個專長請在 40 字以內，方便企業快速瀏覽。" });
      return;
    }
    setBusy(nextPublic ? "public" : "draft");
    setFeedback(null);
    const patch = {
      headline: nextHeadline,
      bio: nextBio,
      skills: nextSkills,
      onboarded: nextPublic,
    };
    try {
      const { error } = await sb.from("talent_profiles").upsert(
        { user_id: profile.id, ...patch },
        { onConflict: "user_id", defaultToNull: false },
      );
      if (error) throw error;
      setHeadline(nextHeadline);
      setBio(nextBio);
      setSkills(nextSkills);
      setSkillDraft("");
      setPublish(nextPublic);
      setSavedPublic(nextPublic);
      setHasRow(true);
      setFeedback({
        tone: "ok",
        text: nextPublic
          ? "已儲存並公開。你的頭銜、專長與所在地會出現在首頁人才區。"
          : "已儲存為草稿。目前不會出現在首頁，只有你自己看得到。",
      });
    } catch (err) {
      console.warn("[FREELI] talent profile save failed", err);
      const raw = rpcMessage(err);
      const denied = /row-level security|42501|permission|not_authenticated/i.test(raw);
      setFeedback({
        tone: "err",
        text: denied ? "沒有權限儲存這份檔案。請確認你是以人才帳號登入。" : "儲存失敗，請再試一次。",
      });
    } finally {
      setBusy(null);
    }
  };

  const statusText = savedPublic
    ? "已公開，會出現在首頁人才區"
    : hasRow
      ? "尚未公開，只有你自己看得到"
      : "尚未建立檔案。可以先存草稿，或直接公開";

  return (
    <section aria-labelledby="talent-profile-title" style={{ ...card, padding: 28, marginBottom: 28, border: `1px solid ${C.sage}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 8 }}>人才檔案</div>
          <h2 id="talent-profile-title" style={{ margin: 0, fontSize: 24, color: C.ink }}>讓企業一眼認識你</h2>
          <p style={{ margin: "8px 0 0", color: C.ink2, maxWidth: 640 }}>填寫一句話頭銜、簡介與專長。公開後，訪客可以在首頁人才區看到你。</p>
        </div>
        <span style={{ background: savedPublic ? C.sageMist : C.ivory2, color: savedPublic ? C.forest : C.ink2, borderRadius: 999, padding: "6px 12px", fontWeight: 700, fontSize: 13 }}>
          {savedPublic ? "已公開" : "尚未公開"}
        </span>
      </div>
      <p style={{ margin: "16px 0 0", fontSize: 14, color: C.ink2 }}>目前狀態：{statusText}</p>
      {loading ? <p style={{ color: C.ink3 }}>正在讀取你的人才檔案…</p> : null}
      {loadError ? <p style={{ color: "#B4533C" }}>{loadError}</p> : null}
      {!loading && !loadError ? (
        <div style={{ marginTop: 18 }}>
          <Field label="一句話頭銜" value={headline} placeholder="例如：B2B 行銷策略顧問" onChange={setHeadline} />
          <Field label="簡介" value={bio} textarea placeholder="用幾句話介紹你的經歷，以及企業可以怎麼跟你合作。" onChange={setBio} />
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>專長</div>
            {skills.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {skills.map((skill) => (
                  <span key={skill} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.sageMist, color: C.forest, borderRadius: 999, padding: "4px 8px 4px 12px", fontSize: 13, fontWeight: 600 }}>
                    {skill}
                    <button type="button" aria-label={`移除${skill}`} onClick={() => setSkills(skills.filter((item) => item !== skill))} style={{ border: "none", background: "transparent", color: C.forest, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              className="fl-input"
              value={skillDraft}
              placeholder="例如：B2B 行銷、內容策略。輸入後按 Enter"
              onChange={(e) => {
                const value = e.target.value;
                if (/[,，、]$/.test(value)) {
                  setSkills(normalizeSkills([...skills, ...splitSkills(value)]));
                  setSkillDraft("");
                  return;
                }
                setSkillDraft(value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              onBlur={() => { if (skillDraft.trim()) commitDraft(); }}
              style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, color: C.ink, background: C.white, fontFamily: "inherit" }}
            />
            <div style={{ fontSize: 13, color: C.ink3, marginTop: 6 }}>用逗號、頓號或 Enter 分隔。重複的專長會自動合併。</div>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0 18px", color: C.ink }}>
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} style={{ marginTop: 4 }} />
            <span>
              <span style={{ fontWeight: 700 }}>公開出現在首頁人才區</span>
              <span style={{ display: "block", fontSize: 13, color: C.ink3, fontWeight: 400 }}>勾選代表你希望公開。兩個按鈕都會儲存頭銜、簡介與專長，差別只在要不要出現在首頁。</span>
            </span>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className={publish ? "fl-btn fl-primary" : "fl-btn fl-ghost"} disabled={busy !== null} style={publish ? btn("primary") : btn("ghost")} onClick={() => void save(true)}>{busy === "public" ? "儲存中…" : "儲存並公開"}</button>
            <button type="button" className={!publish ? "fl-btn fl-primary" : "fl-btn fl-ghost"} disabled={busy !== null} style={!publish ? btn("primary") : btn("ghost")} onClick={() => void save(false)}>{busy === "draft" ? "儲存中…" : "儲存草稿"}</button>
            {savedPublic ? <Link to="/#talent" style={{ color: C.forest2, fontWeight: 700 }}>查看首頁人才區</Link> : null}
          </div>
          {feedback ? (
            <div role="status" style={{ marginTop: 14, color: feedback.tone === "ok" ? C.forest : "#B4533C", background: feedback.tone === "ok" ? C.sageMist : "#F8EBE6", borderRadius: 12, padding: "10px 14px" }}>
              {feedback.text}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TalentServices({ profile }: { profile: FlProfile }) {
  const { sb, setNotice } = useAuth();
  const [rows, setRows] = useState<ServiceRow[] | null>(null);
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [error, setError] = useState("");

  const reload = async () => {
    if (!sb) return;
    const { data, error: e } = await sb.from("services").select("*").eq("talent_id", profile.id).order("created_at", { ascending: false });
    if (e) setError(rpcMessage(e));
    else setRows(((data || []) as ServiceRow[]).map((row) => ({ ...row, service_type: serviceTypeOf(row.service_type) })));
  };

  useEffect(() => { void reload(); }, [sb, profile.id]);

  if (editing) {
    return (
      <ServiceEditor
        profile={profile}
        existing={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); void reload(); setNotice("服務已儲存"); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, color: C.ink }}>我的服務</h2>
        <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => setEditing("new")}>新增服務</button>
      </div>
      {error ? <p style={{ color: "#B4533C" }}>{error}</p> : null}
      {rows === null ? <p style={{ color: C.ink3 }}>載入中…</p> : null}
      {rows && !rows.length ? <div style={{ ...card, padding: 28, color: C.ink2 }}>還沒有服務。建立一筆服務並上架後，就會出現在市集。</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(rows || []).map((s) => (
          <div key={s.id} style={{ ...card, padding: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: C.forest2 }}>{s.category}・{SERVICE_TYPE_LABEL[serviceTypeOf(s.service_type)]}・{s.status === "active" ? "已上架" : s.status === "paused" ? "已暫停" : "草稿"}{s.availability ? "" : "・暫停接案"}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: C.ink, marginTop: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: C.ink3 }}>/services/{s.slug}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {s.status === "active" ? <Link to={`/services/${s.slug}`} className="fl-btn fl-ghost" style={{ ...btn("ghost"), textDecoration: "none" }}>查看</Link> : null}
              <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => setEditing(s)}>編輯</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceEditor({
  profile, existing, onCancel, onSaved,
}: {
  profile: FlProfile;
  existing: ServiceRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { sb } = useAuth();
  const [title, setTitle] = useState(existing?.title || "");
  const [slug, setSlug] = useState(existing?.slug || "");
  const [category, setCategory] = useState(existing?.category || CATEGORIES[0]);
  const [description, setDescription] = useState(existing?.description || "");
  const [images, setImages] = useState<string[]>(existing?.images || []);
  const [status, setStatus] = useState(existing?.status || "draft");
  const [availability, setAvailability] = useState(existing?.availability ?? true);
  const [serviceType, setServiceType] = useState<ServiceType>(serviceTypeOf(existing?.service_type));
  const [packages, setPackages] = useState<PkgDraft[]>(emptyPackages());
  const [faqs, setFaqs] = useState<FaqDraft[]>([{ question: "", answer: "" }]);
  const [ports, setPorts] = useState<PortDraft[]>([{ title: "", summary: "", image_path: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [heldNote, setHeldNote] = useState("");
  const [persistedId, setPersistedId] = useState<string | null>(existing?.id ?? null);
  const [persistedStatus, setPersistedStatus] = useState(existing?.status || "draft");
  const [persistedType, setPersistedType] = useState<ServiceType>(serviceTypeOf(existing?.service_type));

  useEffect(() => {
    if (!sb || !existing) return;
    (async () => {
      const [p, f, pf] = await Promise.all([
        sb.from("service_packages").select("*").eq("service_id", existing.id),
        sb.from("service_faqs").select("*").eq("service_id", existing.id).order("sort"),
        sb.from("service_portfolios").select("*").eq("service_id", existing.id).order("sort"),
      ]);
      if (p.data?.length) {
        const by = Object.fromEntries(p.data.map((x: PkgDraft & { features?: string[] }) => [x.tier, x]));
        setPackages(emptyPackages().map((d) => {
          const row = by[d.tier] as unknown as { name?: string; price: number; delivery_days: number; revisions: number; features: string[] } | undefined;
          return row
            ? { ...d, name: String(row.name || ""), price: String(row.price), delivery_days: String(row.delivery_days), revisions: String(row.revisions), features: (row.features || []).join("\n") }
            : d;
        }));
      }
      if (f.data?.length) setFaqs(f.data.map((x: FaqDraft) => ({ id: x.id, question: x.question, answer: x.answer })));
      if (pf.data?.length) setPorts(pf.data.map((x: PortDraft) => ({ id: x.id, title: x.title, summary: x.summary || "", image_path: x.image_path || "" })));
    })();
  }, [sb, existing?.id]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 4 || title.trim().length > 120) e.title = "標題請介於 4 到 120 字";
    const sl = slug.trim();
    if (!isValidSlug(sl)) e.slug = "網址需為 3–80 字的小寫英文、數字與連字號，例如 brand-audit";
    if (!(CATEGORIES as readonly string[]).includes(category)) e.category = "請選擇有效的服務類別";
    if (description.trim().length < 20) e.description = "請至少撰寫 20 字的服務說明";
    else if (description.trim().length > 5000) e.description = "服務介紹最多 5000 字";
    if (images.length > 8) e.images = "圖片最多 8 張";
    const visible = serviceType === "retainer" ? packages.filter((p) => p.tier === "basic") : packages;
    visible.forEach((p) => {
      const price = Number(p.price);
      const days = Number(p.delivery_days);
      const rev = Number(p.revisions);
      if (p.name.trim().length > 40) e[`${p.tier}-name`] = "方案名稱最多 40 字";
      if (!Number.isFinite(price) || price < 0) e[`${p.tier}-price`] = "價格需為 0 以上的數字";
      else if (price > 10000000) e[`${p.tier}-price`] = "價格上限為 NT$10,000,000";
      if (!Number.isInteger(days) || days < 1) e[`${p.tier}-days`] = "交付天數至少 1 天";
      else if (days > 365) e[`${p.tier}-days`] = "交期最多 365 天";
      if (!Number.isInteger(rev) || rev < 0) e[`${p.tier}-rev`] = "修訂次數需為 0 以上整數";
      else if (rev > 20) e[`${p.tier}-rev`] = "修改次數最多 20 次";
      const lines = featureLines(p.features);
      if (!lines.length) e[`${p.tier}-feat`] = "請至少列一項方案內容";
      else if (lines.length > 12) e[`${p.tier}-feat`] = "方案內容最多 12 條";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!sb) return;
    if (!validate()) return;
    setBusy(true);
    setFormError("");
    setHeldNote("");
    const wanted = status === "active" || status === "paused" ? status : "draft";
    const shapeChanged = persistedType !== serviceType;
    const interim: "draft" | "active" | "paused" =
      !persistedId || persistedStatus !== "active"
        ? "draft"
        : shapeChanged
          ? "paused"
          : "active";
    const body = {
      talent_id: profile.id,
      title: title.trim(),
      slug: slug.trim(),
      category,
      description: description.trim(),
      images,
      availability,
      status: interim,
    };
    let serviceId = persistedId;
    let serviceWritten = false;
    let typeStored = true;
    try {
      try {
        serviceId = await writeService(sb, serviceId, { ...body, service_type: serviceType });
      } catch (err) {
        if (!missingColumn(err, "service_type")) throw err;
        if (serviceType === "retainer") {
          throw new Error("資料庫尚未支援月費顧問，這次沒有變更方案。請先選擇標準專案包，或等更新完成後再儲存。");
        }
        typeStored = false;
        serviceId = await writeService(sb, serviceId, body);
      }
      if (!serviceId) throw new Error("無法儲存服務");
      serviceWritten = true;
      setPersistedId(serviceId);
      setPersistedStatus(interim);
      if (typeStored) setPersistedType(serviceType);

      await writePackages(sb, serviceId, serviceType, packages, typeStored);

      const { error: delF } = await sb.from("service_faqs").delete().eq("service_id", serviceId);
      if (delF) throw delF;
      const faqRows = faqs.filter((f) => f.question.trim() && f.answer.trim()).map((f, i) => ({
        service_id: serviceId, question: f.question.trim(), answer: f.answer.trim(), sort: i + 1,
      }));
      if (faqRows.length) {
        const { error } = await sb.from("service_faqs").insert(faqRows);
        if (error) throw error;
      }

      const { error: delP } = await sb.from("service_portfolios").delete().eq("service_id", serviceId);
      if (delP) throw delP;
      const portRows = ports.filter((p) => p.title.trim()).map((p, i) => ({
        service_id: serviceId, title: p.title.trim(), summary: p.summary.trim(), image_path: p.image_path || null, sort: i + 1,
      }));
      if (portRows.length) {
        const { error } = await sb.from("service_portfolios").insert(portRows);
        if (error) throw error;
      }

      if (wanted !== interim) {
        const { error } = await sb.from("services").update({ status: wanted }).eq("id", serviceId);
        if (error) throw error;
        setPersistedStatus(wanted);
      }
      onSaved();
    } catch (err) {
      if (serviceWritten && wanted === "active") {
        setHeldNote(interim === "paused" ? "已改為暫停展示，請修正後再上架" : "已儲存為草稿，請修正後再上架");
      } else if (serviceWritten && interim === "paused") {
        setHeldNote("已改為暫停展示，請修正後再儲存");
      }
      setFormError(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File, kind: "image" | "port", portIdx?: number) => {
    if (!sb) return;
    if (kind === "image" && images.length >= 8) {
      setFormError("圖片最多 8 張");
      return;
    }
    try {
      const url = await uploadMedia(sb, profile.id, file);
      if (kind === "image") setImages((prev) => prev.length >= 8 ? prev : [...prev, url]);
      else if (portIdx != null) setPorts((prev) => prev.map((p, i) => i === portIdx ? { ...p, image_path: url } : p));
    } catch (err) {
      setFormError(rpcMessage(err));
    }
  };

  const patchPackage = (idx: number, patch: Partial<PkgDraft>) => {
    setPackages((prev) => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));
  };

  const typeMeta = SERVICE_TYPES.find((item) => item.id === serviceType);
  const retainer = serviceType === "retainer";
  const visiblePackages = retainer ? packages.filter((pkg) => pkg.tier === "basic") : packages;

  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 22, marginBottom: 18 }}>{existing ? "編輯服務" : "新增服務"}</h2>
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 18px" }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 8 }}>服務類型 *</legend>
        <div role="radiogroup" aria-label="服務類型" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SERVICE_TYPES.map((item) => {
            const selected = serviceType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className="fl-chip"
                onClick={() => setServiceType(item.id)}
                style={{ border: `1px solid ${selected ? C.forest : C.line}`, background: selected ? C.forest : C.white, color: selected ? C.ivory : C.ink2, borderRadius: 999, padding: "9px 16px", fontSize: 14, fontWeight: 600 }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {typeMeta ? <p style={{ margin: "10px 0 0", fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>{typeMeta.hint}</p> : null}
      </fieldset>
      <Field label="服務標題" value={title} required error={errors.title} onChange={(v) => { setTitle(v); if (!existing && !slug) setSlug(slugify(v)); }} />
      <Field label="網址代稱（slug）" value={slug} required error={errors.slug} placeholder="brand-community-audit" onChange={setSlug} />
      <label style={{ display: "block", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>類別 *</div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.category ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 4 }}>{errors.category}</div> : null}
      </label>
      <Field label="服務說明" value={description} required textarea error={errors.description} onChange={setDescription} />

      <div style={{ margin: "8px 0 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>服務圖片</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {images.map((src) => (
            <div key={src} style={{ width: 96, height: 72, borderRadius: 10, overflow: "hidden", position: "relative", background: C.sageMist }}>
              <img src={publicMediaUrl(src) || src} alt="已上傳的服務圖片" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button type="button" onClick={() => setImages(images.filter((x) => x !== src))} style={{ position: "absolute", top: 2, right: 2, border: "none", borderRadius: 999, width: 22, height: 22, background: C.white }}>×</button>
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void onUpload(f, "image"); e.target.value = ""; }} style={{ marginTop: 8 }} />
        {errors.images ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 4 }}>{errors.images}</div> : null}
        <div style={{ fontSize: 13, color: C.ink3, marginTop: 6 }}>最多 8 張。</div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ fontSize: 14, color: C.ink2 }}>
          狀態{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            <option value="draft">草稿</option>
            <option value="active">上架</option>
            <option value="paused">暫停展示</option>
          </select>
        </label>
        <label style={{ fontSize: 14, color: C.ink2, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={availability} onChange={(e) => setAvailability(e.target.checked)} />
          開放接案
        </label>
      </div>

      <h3 style={{ fontSize: 18, margin: "16px 0 10px" }}>{retainer ? "月費方案" : "三個方案"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: retainer ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14, maxWidth: retainer ? 560 : undefined }}>
        {visiblePackages.map((p) => {
          const idx = packages.findIndex((row) => row.tier === p.tier);
          return (
            <div key={p.tier} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, background: C.ivory }}>
              {retainer ? null : <div style={{ fontWeight: 700, marginBottom: 8 }}>{TIER_LABEL[p.tier]}</div>}
              <Field label="方案名稱（選填）" value={p.name} placeholder={retainer ? "例如：每月顧問" : "例如：入門健檢"} error={errors[`${p.tier}-name`]} onChange={(v) => patchPackage(idx, { name: v })} />
              <Field label={retainer ? "每月價格（NT$）" : "價格（NT$）"} value={p.price} required suffix={retainer ? "/月" : undefined} error={errors[`${p.tier}-price`]} onChange={(v) => patchPackage(idx, { price: v })} />
              <Field label={retainer ? "每月交付天數" : "交付天數"} value={p.delivery_days} required error={errors[`${p.tier}-days`]} onChange={(v) => patchPackage(idx, { delivery_days: v })} />
              {retainer ? <div style={{ fontSize: 13, color: C.ink3, marginTop: -8, marginBottom: 12 }}>也可當作每月的回應週期。</div> : null}
              <Field label={retainer ? "每月修改次數" : "修訂次數"} value={p.revisions} required error={errors[`${p.tier}-rev`]} onChange={(v) => patchPackage(idx, { revisions: v })} />
              <Field label={retainer ? "每月包含內容（一行一項）" : "方案內容（一行一項）"} value={p.features} textarea required error={errors[`${p.tier}-feat`]} onChange={(v) => patchPackage(idx, { features: v })} />
            </div>
          );
        })}
      </div>

      <h3 style={{ fontSize: 18, margin: "22px 0 10px" }}>常見問題</h3>
      {faqs.map((f, i) => (
        <div key={i} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <Field label={`問題 ${i + 1}`} value={f.question} onChange={(v) => setFaqs(faqs.map((x, j) => j === i ? { ...x, question: v } : x))} />
          <Field label="回答" value={f.answer} textarea onChange={(v) => setFaqs(faqs.map((x, j) => j === i ? { ...x, answer: v } : x))} />
          <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}>移除此題</button>
        </div>
      ))}
      <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginBottom: 18 }} onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}>新增問題</button>

      <h3 style={{ fontSize: 18, margin: "10px 0" }}>作品集</h3>
      {ports.map((p, i) => (
        <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <Field label="作品標題" value={p.title} onChange={(v) => setPorts(ports.map((x, j) => j === i ? { ...x, title: v } : x))} />
          <Field label="說明" value={p.summary} textarea onChange={(v) => setPorts(ports.map((x, j) => j === i ? { ...x, summary: v } : x))} />
          {p.image_path ? <img src={publicMediaUrl(p.image_path) || p.image_path} alt={p.title || "作品圖片"} loading="lazy" decoding="async" style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 10 }} /> : null}
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f, "port", i); e.target.value = ""; }} />
          <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginTop: 8 }} onClick={() => setPorts(ports.filter((_, j) => j !== i))}>移除此筆</button>
        </div>
      ))}
      <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginBottom: 18 }} onClick={() => setPorts([...ports, { title: "", summary: "", image_path: "" }])}>新增作品</button>

      {formError ? <div role="alert" style={{ color: "#B4533C", marginBottom: 8 }}>{formError}</div> : null}
      {heldNote ? <div role="status" style={{ color: C.forest, background: C.sageMist, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>{heldNote}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="fl-btn fl-primary" disabled={busy} style={btn("primary", true)} onClick={() => void save()}>{busy ? "儲存中…" : "儲存服務"}</button>
        <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

type OrderRow = {
  id: string; status: string; price: number; package_tier: string; delivery_days: number; revisions: number;
  brief: string; created_at: string; business_id: string; talent_id: string; service_id: string;
  services?: { title: string; slug: string } | null;
  order_deliveries?: { id: string; message: string; file_paths: string[]; created_at: string }[];
  service_reviews?: { id: string }[] | { id: string } | null;
};

function OrdersPanel({ profile }: { profile: FlProfile }) {
  const { sb, setNotice } = useAuth();
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState("");
  const [deliverFor, setDeliverFor] = useState<string | null>(null);
  const [deliverMsg, setDeliverMsg] = useState("");
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!sb) return;
    const col = profile.role === "talent" ? "talent_id" : "business_id";
    const { data, error: e } = await sb
      .from("orders")
      .select("*, services(title, slug), order_deliveries(id, message, file_paths, created_at), service_reviews(id)")
      .eq(col, profile.id)
      .order("created_at", { ascending: false });
    if (e) setError(e.message);
    else setRows((data || []) as OrderRow[]);
  };

  useEffect(() => { void reload(); }, [sb, profile.id]);

  const act = async (id: string, status: string) => {
    if (!sb) return;
    setBusy(true);
    try {
      const { error: e } = await sb.rpc("update_order_status", { p_order_id: id, p_status: status });
      if (e) throw e;
      setNotice("訂單狀態已更新");
      await reload();
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const deliver = async (id: string) => {
    if (!sb) return;
    if (deliverMsg.trim().length < 4) { setNotice("請至少填寫 4 字的交付說明"); return; }
    setBusy(true);
    try {
      const { error: e } = await sb.rpc("submit_order_delivery", {
        p_order_id: id,
        p_message: deliverMsg.trim(),
        p_file_paths: [],
      });
      if (e) throw e;
      setDeliverFor(null);
      setDeliverMsg("");
      setNotice("已送出交付");
      await reload();
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string) => {
    if (!sb) return;
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) { setNotice("評分需為 1 到 5 星"); return; }
    setBusy(true);
    try {
      const { error: e } = await sb.rpc("create_service_review", { p_order_id: id, p_rating: r, p_comment: comment.trim() });
      if (e) throw e;
      setReviewFor(null);
      setComment("");
      setNotice("感謝你的評價");
      await reload();
    } catch (err) {
      setNotice(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) return <p style={{ color: C.ink3 }}>載入訂單中…</p>;
  if (error) return <p style={{ color: "#B4533C" }}>{error}</p>;
  if (!rows.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>目前沒有訂單。</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((o) => {
        const reviewed = Array.isArray(o.service_reviews) ? o.service_reviews.length > 0 : !!o.service_reviews;
        return (
          <div key={o.id} style={{ ...card, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{o.services?.title || "服務訂單"}</div>
                <div style={{ fontSize: 14, color: C.ink2, marginTop: 4 }}>
                  {TIER_LABEL[o.package_tier] || o.package_tier}・{fmt(o.price)}・{o.delivery_days} 天
                </div>
                <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>建立於 {new Date(o.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
              </div>
              <span style={{ background: C.sageMist, color: C.forest, borderRadius: 999, padding: "6px 12px", fontWeight: 600, height: "fit-content" }}>{ORDER_STATUS_LABEL[o.status] || o.status}</span>
            </div>
            {o.brief ? <p style={{ marginTop: 12, color: C.ink2, whiteSpace: "pre-wrap" }}>{o.brief}</p> : null}
            {o.order_deliveries?.length ? (
              <div style={{ marginTop: 12, background: C.ivory, borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>交付紀錄</div>
                {o.order_deliveries.map((d) => <div key={d.id} style={{ fontSize: 14, color: C.ink2 }}>{d.message}</div>)}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {profile.role === "talent" && o.status === "pending" ? (
                <>
                  <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => void act(o.id, "accepted")}>接受</button>
                  <button className="fl-btn fl-ghost" disabled={busy} style={btn("ghost")} onClick={() => void act(o.id, "declined")}>婉拒</button>
                </>
              ) : null}
              {profile.role === "talent" && o.status === "accepted" ? (
                <button className="fl-btn fl-ghost" disabled={busy} style={btn("ghost")} onClick={() => void act(o.id, "in_progress")}>開始進行</button>
              ) : null}
              {profile.role === "talent" && (o.status === "accepted" || o.status === "in_progress") ? (
                <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => setDeliverFor(o.id)}>交付成果</button>
              ) : null}
              {profile.role === "business" && o.status === "pending" ? (
                <button className="fl-btn fl-ghost" disabled={busy} style={btn("ghost")} onClick={() => void act(o.id, "cancelled")}>取消訂單</button>
              ) : null}
              {profile.role === "business" && o.status === "delivered" ? (
                <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => void act(o.id, "completed")}>確認完成</button>
              ) : null}
              {profile.role === "business" && o.status === "completed" && !reviewed ? (
                <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => setReviewFor(o.id)}>留下評價</button>
              ) : null}
              {o.services?.slug ? <Link to={`/services/${o.services.slug}`} style={{ ...btn("ghost"), textDecoration: "none" }} className="fl-btn fl-ghost">查看服務</Link> : null}
            </div>
            {deliverFor === o.id ? (
              <div style={{ marginTop: 12 }}>
                <Field label="交付說明" value={deliverMsg} textarea required onChange={setDeliverMsg} />
                <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => void deliver(o.id)}>送出交付</button>
              </div>
            ) : null}
            {reviewFor === o.id ? (
              <div style={{ marginTop: 12 }}>
                <Field label="評分（1–5）" value={rating} onChange={setRating} />
                <Field label="評論（選填）" value={comment} textarea onChange={setComment} />
                <button className="fl-btn fl-primary" disabled={busy} style={btn("primary")} onClick={() => void review(o.id)}>送出評價</button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MessagesPanel({ profile }: { profile: FlProfile }) {
  const { sb, setNotice } = useAuth();
  const [convs, setConvs] = useState<Array<{ id: string; subject: string; business_id: string; talent_id: string; updated_at: string }> | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Array<{ id: string; body: string; sender_id?: string; created_at: string }>>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await sb
        .from("conversations")
        .select("id, subject, business_id, talent_id, updated_at")
        .or(`business_id.eq.${profile.id},talent_id.eq.${profile.id}`)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (e) setError(e.message);
      else setConvs(data || []);
    })();
    return () => { cancelled = true; };
  }, [sb, profile.id]);

  useEffect(() => {
    if (!sb || !active) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await sb.from("messages").select("id, body, sender_id, created_at").eq("conversation_id", active).order("created_at");
      if (cancelled) return;
      if (e) setError(e.message);
      else setMsgs((data || []) as typeof msgs);
    })();
    return () => { cancelled = true; };
  }, [sb, active]);

  const send = async () => {
    if (!sb || !active) return;
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) { setNotice("訊息請介於 1 到 2000 字"); return; }
    const { error: e } = await sb.from("messages").insert({ conversation_id: active, body: text, sender_id: profile.id });
    if (e) { setNotice(e.message); return; }
    setBody("");
    const { data } = await sb.from("messages").select("id, body, sender_id, created_at").eq("conversation_id", active).order("created_at");
    setMsgs((data || []) as typeof msgs);
  };

  if (error) return <p style={{ color: "#B4533C" }}>{error}</p>;
  if (convs === null) return <p style={{ color: C.ink3 }}>載入訊息中…</p>;
  if (!convs.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>目前沒有對話。企業雇主可從服務頁點「聯絡人才」開始。</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 280px) 1fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {convs.map((c) => (
          <button key={c.id} onClick={() => setActive(c.id)} style={{ ...card, padding: 14, textAlign: "left", border: `1px solid ${active === c.id ? C.forest : C.line}`, background: active === c.id ? C.sageMist : C.white, cursor: "pointer" }}>
            <div style={{ fontWeight: 700 }}>{c.subject}</div>
            <div style={{ fontSize: 12, color: C.ink3 }}>{new Date(c.updated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
          </button>
        ))}
      </div>
      <div style={{ ...card, padding: 18, minHeight: 320, display: "flex", flexDirection: "column" }}>
        {!active ? <div style={{ color: C.ink3 }}>請選擇左側對話</div> : (
          <>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {msgs.map((m) => (
                <div key={m.id} style={{ background: C.ivory, borderRadius: 12, padding: "10px 12px", color: C.ink2 }}>{m.body}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="fl-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="輸入訊息" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", fontSize: 15 }} />
              <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => void send()}>送出</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewsPanel({ profile }: { profile: FlProfile }) {
  const { sb } = useAuth();
  const [rows, setRows] = useState<Array<{ id: string; rating: number; comment: string; reviewer_name: string; created_at: string; service_id: string }> | null>(null);
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: svcs } = await sb.from("services").select("id").eq("talent_id", profile.id);
      const ids = (svcs || []).map((s: { id: string }) => s.id);
      if (!ids.length) { setRows([]); return; }
      const { data } = await sb.from("service_reviews").select("*").in("service_id", ids).order("created_at", { ascending: false });
      setRows((data || []) as NonNullable<typeof rows>);
    })();
  }, [sb, profile.id]);
  if (rows === null) return <p style={{ color: C.ink3 }}>載入評價中…</p>;
  if (!rows.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>還沒有收到評價。</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>{r.reviewer_name || "企業雇主"}</b>
            <Stars value={r.rating} />
          </div>
          <p style={{ color: C.ink2, marginTop: 8 }}>{r.comment}</p>
        </div>
      ))}
    </div>
  );
}

function FavoritesPanel({ profile }: { profile: FlProfile }) {
  const { sb } = useAuth();
  const [services, setServices] = useState<Array<{ service_id: string; services?: { title: string; slug: string } | null }> | null>(null);
  const [talents, setTalents] = useState<Array<{ talent_id: string; profiles?: { name: string } | null }> | null>(null);
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [sf, tf] = await Promise.all([
        sb.from("service_favorites").select("service_id, services(title, slug)").eq("user_id", profile.id),
        sb.from("favorites").select("talent_id, profiles!favorites_talent_id_fkey(name)").eq("user_id", profile.id),
      ]);
      setServices((sf.data || []) as unknown as NonNullable<typeof services>);
      setTalents((tf.data || []) as unknown as NonNullable<typeof talents>);
    })();
  }, [sb, profile.id]);
  if (!services || !talents) return <p style={{ color: C.ink3 }}>載入收藏中…</p>;
  if (!services.length && !talents.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>還沒有收藏。可從服務頁或首頁人才卡片加入。</div>;
  return (
    <div>
      <h3 style={{ fontSize: 18, marginBottom: 10 }}>收藏的服務</h3>
      {services.map((s) => (
        <div key={s.service_id} style={{ ...card, padding: 16, marginBottom: 8 }}>
          {s.services?.slug ? <Link to={`/services/${s.services.slug}`}>{s.services.title}</Link> : (s.services?.title || s.service_id)}
        </div>
      ))}
      <h3 style={{ fontSize: 18, margin: "20px 0 10px" }}>收藏的人才</h3>
      {talents.map((t) => (
        <div key={t.talent_id} style={{ ...card, padding: 16, marginBottom: 8 }}>{t.profiles?.name || t.talent_id}</div>
      ))}
    </div>
  );
}

function InvitesPanel({ profile }: { profile: FlProfile }) {
  const { sb } = useAuth();
  const [rows, setRows] = useState<Array<{ id: string; kind: string; status: string; note: string; created_at: string; talent_id: string; service_id?: string }> | null>(null);
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.from("invites").select("id, kind, status, note, created_at, talent_id, service_id").eq("business_id", profile.id).order("created_at", { ascending: false });
      setRows((data || []) as NonNullable<typeof rows>);
    })();
  }, [sb, profile.id]);
  if (rows === null) return <p style={{ color: C.ink3 }}>載入邀請中…</p>;
  if (!rows.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>還沒有送出邀請。</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ ...card, padding: 18 }}>
          <div style={{ fontWeight: 700 }}>{r.kind === "meeting" ? "會議邀請" : "詢價邀請"}・{r.status}</div>
          <div style={{ color: C.ink2, marginTop: 6 }}>{r.note}</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 6 }}>{new Date(r.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</div>
        </div>
      ))}
    </div>
  );
}

const selectStyle = {
  width: "100%" as const,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 15,
  color: C.ink,
  background: C.white,
  fontFamily: "inherit",
};
