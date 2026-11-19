import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { C, CATEGORIES, ORDER_STATUS_LABEL, TIER_LABEL, btn, card, fmt, wrap } from "../lib/theme";
import { publicMediaUrl, rpcMessage, type FlProfile } from "../lib/supabase";
import { Field, Pill, Stars } from "../components/ui";

type Tab = "services" | "orders" | "messages" | "reviews" | "favorites" | "invites";

type PkgDraft = { tier: "basic" | "standard" | "premium"; price: string; delivery_days: string; revisions: string; features: string };
type FaqDraft = { id?: string; question: string; answer: string };
type PortDraft = { id?: string; title: string; summary: string; image_path: string };
type ServiceRow = {
  id: string; slug: string; title: string; category: string; description: string;
  images: string[]; status: string; availability: boolean;
};

function emptyPackages(): PkgDraft[] {
  return [
    { tier: "basic", price: "3000", delivery_days: "5", revisions: "1", features: "需求釐清\n交付摘要" },
    { tier: "standard", price: "8000", delivery_days: "10", revisions: "2", features: "完整規劃\n兩次修訂\n線上會議" },
    { tier: "premium", price: "15000", delivery_days: "14", revisions: "3", features: "完整規劃與執行建議\n三次修訂\n追蹤會議" },
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
    document.title = "工作台｜FREELIFE";
    if (profile) setTab(profile.role === "talent" ? "services" : "orders");
  }, [profile?.id]);

  if (!profile) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 28, marginBottom: 12, color: C.ink }}>請先登入工作台</h1>
          <p style={{ color: C.ink2, marginBottom: 24 }}>登入後即可管理服務、訂單與訊息。</p>
          <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => openAuth("login")}>登入</button>
        </div>
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
      <SiteHeader />
      <div style={{ ...wrap, paddingTop: 36, paddingBottom: 88 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 8 }}>工作台</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: C.ink }}>你好，{profile.name}</h1>
          <p style={{ color: C.ink2, marginTop: 8 }}>{isTalent ? "管理服務方案、訂單交付與訊息。" : "追蹤合作進度、收藏與邀請。"}</p>
        </div>
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
      </div>
      <SiteFooter />
    </>
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
    if (e) setError(e.message);
    else setRows((data || []) as ServiceRow[]);
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
      {rows && !rows.length ? <div style={{ ...card, padding: 28, color: C.ink2 }}>還沒有服務。建立一筆含三個方案的服務後，即可出現在市集。</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(rows || []).map((s) => (
          <div key={s.id} style={{ ...card, padding: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: C.forest2 }}>{s.category}・{s.status === "active" ? "已上架" : s.status === "paused" ? "已暫停" : "草稿"}{s.availability ? "" : "・暫停接案"}</div>
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
  const [packages, setPackages] = useState<PkgDraft[]>(emptyPackages());
  const [faqs, setFaqs] = useState<FaqDraft[]>([{ question: "", answer: "" }]);
  const [ports, setPorts] = useState<PortDraft[]>([{ title: "", summary: "", image_path: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

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
          const row = by[d.tier] as unknown as { price: number; delivery_days: number; revisions: number; features: string[] } | undefined;
          return row ? { ...d, price: String(row.price), delivery_days: String(row.delivery_days), revisions: String(row.revisions), features: (row.features || []).join("\n") } : d;
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
    if (!category) e.category = "請選擇類別";
    if (description.trim().length < 20) e.description = "請至少撰寫 20 字的服務說明";
    packages.forEach((p) => {
      const price = Number(p.price);
      const days = Number(p.delivery_days);
      const rev = Number(p.revisions);
      if (!Number.isFinite(price) || price < 0) e[`${p.tier}-price`] = "價格需為 0 以上的數字";
      if (!Number.isInteger(days) || days < 1) e[`${p.tier}-days`] = "交付天數至少 1 天";
      if (!Number.isInteger(rev) || rev < 0) e[`${p.tier}-rev`] = "修訂次數需為 0 以上整數";
      if (!p.features.trim()) e[`${p.tier}-feat`] = "請至少列一項方案內容";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!sb) return;
    if (!validate()) return;
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        talent_id: profile.id,
        title: title.trim(),
        slug: slug.trim(),
        category,
        description: description.trim(),
        images,
        status,
        availability,
      };
      let serviceId = existing?.id;
      if (existing) {
        const { error } = await sb.from("services").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("services").insert(payload).select("id").single();
        if (error) throw error;
        serviceId = data.id;
      }
      if (!serviceId) throw new Error("無法儲存服務");

      for (const p of packages) {
        const row = {
          service_id: serviceId,
          tier: p.tier,
          price: Number(p.price),
          delivery_days: Number(p.delivery_days),
          revisions: Number(p.revisions),
          features: p.features.split("\n").map((s) => s.trim()).filter(Boolean),
        };
        const { error } = await sb.from("service_packages").upsert(row, { onConflict: "service_id,tier" });
        if (error) throw error;
      }

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
      onSaved();
    } catch (err) {
      setFormError(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File, kind: "image" | "port", portIdx?: number) => {
    if (!sb) return;
    try {
      const url = await uploadMedia(sb, profile.id, file);
      if (kind === "image") setImages((prev) => [...prev, url]);
      else if (portIdx != null) setPorts((prev) => prev.map((p, i) => i === portIdx ? { ...p, image_path: url } : p));
    } catch (err) {
      setFormError(rpcMessage(err));
    }
  };

  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 22, marginBottom: 18 }}>{existing ? "編輯服務" : "新增服務"}</h2>
      <Field label="服務標題" value={title} required error={errors.title} onChange={(v) => { setTitle(v); if (!existing && !slug) setSlug(slugify(v)); }} />
      <Field label="網址代稱（slug）" value={slug} required error={errors.slug} placeholder="brand-community-audit" onChange={setSlug} />
      <label style={{ display: "block", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>類別 *</div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <Field label="服務說明" value={description} required textarea error={errors.description} onChange={setDescription} />

      <div style={{ margin: "8px 0 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>服務圖片</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {images.map((src) => (
            <div key={src} style={{ width: 96, height: 72, borderRadius: 10, overflow: "hidden", position: "relative", background: C.sageMist }}>
              <img src={publicMediaUrl(src) || src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button type="button" onClick={() => setImages(images.filter((x) => x !== src))} style={{ position: "absolute", top: 2, right: 2, border: "none", borderRadius: 999, width: 22, height: 22, background: C.white }}>×</button>
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void onUpload(f, "image"); e.target.value = ""; }} style={{ marginTop: 8 }} />
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

      <h3 style={{ fontSize: 18, margin: "16px 0 10px" }}>三個方案</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14 }}>
        {packages.map((p, idx) => (
          <div key={p.tier} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, background: C.ivory }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{TIER_LABEL[p.tier]}</div>
            <Field label="價格（NT$）" value={p.price} required error={errors[`${p.tier}-price`]} onChange={(v) => setPackages(packages.map((x, i) => i === idx ? { ...x, price: v } : x))} />
            <Field label="交付天數" value={p.delivery_days} required error={errors[`${p.tier}-days`]} onChange={(v) => setPackages(packages.map((x, i) => i === idx ? { ...x, delivery_days: v } : x))} />
            <Field label="修訂次數" value={p.revisions} required error={errors[`${p.tier}-rev`]} onChange={(v) => setPackages(packages.map((x, i) => i === idx ? { ...x, revisions: v } : x))} />
            <Field label="方案內容（一行一項）" value={p.features} textarea required error={errors[`${p.tier}-feat`]} onChange={(v) => setPackages(packages.map((x, i) => i === idx ? { ...x, features: v } : x))} />
          </div>
        ))}
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
          {p.image_path ? <img src={publicMediaUrl(p.image_path) || p.image_path} alt="" style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 10 }} /> : null}
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f, "port", i); e.target.value = ""; }} />
          <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginTop: 8 }} onClick={() => setPorts(ports.filter((_, j) => j !== i))}>移除此筆</button>
        </div>
      ))}
      <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginBottom: 18 }} onClick={() => setPorts([...ports, { title: "", summary: "", image_path: "" }])}>新增作品</button>

      {formError ? <div style={{ color: "#B4533C", marginBottom: 12 }}>{formError}</div> : null}
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
  const { sb } = useAuth();
  const [convs, setConvs] = useState<Array<{ id: string; subject: string; updated_at: string }> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await sb
        .from("conversations")
        .select("id, subject, updated_at")
        .or(`business_id.eq.${profile.id},talent_id.eq.${profile.id}`)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (e) setError(e.message);
      else setConvs(data || []);
    })();
    return () => { cancelled = true; };
  }, [sb, profile.id]);

  if (error) return <p style={{ color: "#B4533C" }}>{error}</p>;
  if (convs === null) return <p style={{ color: C.ink3 }}>載入訊息中…</p>;
  if (!convs.length) return <div style={{ ...card, padding: 28, color: C.ink2 }}>目前沒有對話。可從人才檔案或專案頁開始。</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {convs.map((c) => (
        <Link key={c.id} to={`/messages/${c.id}`} style={{ ...card, padding: 16, textDecoration: "none", color: "inherit" }}>
          <div style={{ fontWeight: 700 }}>{c.subject}</div>
          <div style={{ fontSize: 12, color: C.ink3 }}>{new Date(c.updated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}・開啟對話與合約</div>
        </Link>
      ))}
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
  const [talents, setTalents] = useState<Array<{ talent_id: string; profiles?: { name: string; username?: string } | null }> | null>(null);
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [sf, tf] = await Promise.all([
        sb.from("service_favorites").select("service_id, services(title, slug)").eq("user_id", profile.id),
        sb.from("favorites").select("talent_id, profiles!favorites_talent_id_fkey(name, username)").eq("user_id", profile.id),
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
        <div key={t.talent_id} style={{ ...card, padding: 16, marginBottom: 8 }}>
          <Link to={`/talents/${t.profiles?.username || t.talent_id}`}>{t.profiles?.name || "人才檔案"}</Link>
        </div>
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
