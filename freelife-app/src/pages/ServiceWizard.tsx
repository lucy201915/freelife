import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "../lib/auth";
import { Field } from "../components/ui";
import { C, CATEGORIES, TIER_LABEL, btn, card } from "../lib/theme";
import { publicMediaUrl, rpcMessage, type BillingPeriod, type FlProfile, type ServiceType } from "../lib/supabase";
import { SERVICE_TYPES, serviceTypeOf } from "../lib/service-display";

export type WizardService = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  images: string[];
  status: string;
  availability: boolean;
  service_type?: string;
  subcategory?: string;
  search_tags?: unknown;
};

type Tier = "basic" | "standard" | "premium";
type PkgDraft = {
  tier: Tier;
  name: string;
  summary: string;
  price: string;
  delivery_days: string;
  revisions: string;
  features: string[];
};
type FaqDraft = { question: string; answer: string };
type PortDraft = { title: string; summary: string; image_path: string };
type CheckItem = { id: string; ok: boolean; title: string; detail: string };

const STEPS = [
  { label: "概覽", title: "先用一句話說明這份服務", sub: "標題、類型和類別就夠存成草稿。其餘等你確認要刊登再補，大約一分鐘。" },
  { label: "定價", title: "排出企業看得到的方案", sub: "諮詢和專案包並排三個方案。月費顧問只留一個每月欄位。" },
  { label: "說明", title: "服務說明與常見問題", sub: "說明會出現在服務頁。常見問題可以先留空。" },
  { label: "需求", title: "下單前想問企業的事", sub: "例如預算、既有素材和期望時程。" },
  { label: "圖片", title: "封面與圖片", sub: "第一張會當成封面。最多 8 張。" },
  { label: "刊登", title: "確認要刊登", sub: "下面沒打勾的項目補完就能公開。進度可以先存著。" },
];

const SUBCATEGORIES: Record<string, string[]> = {
  "行銷公關": ["社群經營", "廣告投放", "公關媒體", "活動企劃"],
  "品牌設計": ["品牌識別", "包裝設計", "簡報與視覺", "形象設計"],
  "B2B 業務開發": ["開發信", "名單建置", "銷售流程", "合作開發"],
  "網站與數位開發": ["形象網站", "電商", "產品原型", "網站改版"],
  "營運流程優化": ["流程梳理", "專案管理", "工具導入", "效率診斷"],
  "內容與文案": ["品牌文案", "新聞稿", "腳本", "SEO 文章"],
  "數據分析": ["數據追蹤", "儀表板", "市場研究", "報表解讀"],
  "財務法務": ["合約檢視", "記帳稅務", "募資文件", "合規整理"],
};

const TYPE_HINT: Record<ServiceType, string> = {
  consult: "單次深度諮詢。三個方案等刊登前再補。",
  package: "有範圍的專案。三個方案等刊登前再補。",
  retainer: "每月固定合作。刊登時只需要一個月費方案。",
};

const TIERS: Tier[] = ["basic", "standard", "premium"];

type Sb = NonNullable<ReturnType<typeof useAuth>["sb"]>;

function blankPackages(): PkgDraft[] {
  return TIERS.map((tier) => ({ tier, name: "", summary: "", price: "", delivery_days: "", revisions: "", features: [] }));
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function isValidSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 80;
}

function makeSlug(title: string): string {
  const ascii = slugify(title).replace(/^-+|-+$/g, "");
  if (ascii.length >= 3 && isValidSlug(ascii)) return ascii;
  return `svc-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function parseWhole(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  return Number(text);
}

function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
}

function missingColumn(err: unknown, column: string): boolean {
  const msg = String((err as { message?: string })?.message || "");
  return msg.includes(column) && /schema cache|does not exist|column/i.test(msg);
}

function packageTouched(pkg: PkgDraft): boolean {
  return Boolean(pkg.name.trim() || pkg.summary.trim() || pkg.price.trim() || pkg.delivery_days.trim() || pkg.revisions.trim() || pkg.features.some((item) => item.trim()));
}

function buildChecks(input: {
  description: string;
  images: string[];
  serviceType: ServiceType;
  packages: PkgDraft[];
  onboarded: boolean | null;
}): CheckItem[] {
  const items: CheckItem[] = [];
  const desc = input.description.trim();
  items.push({
    id: "desc",
    ok: desc.length >= 20 && desc.length <= 5000,
    title: "服務說明",
    detail: desc.length > 5000 ? "最多 5000 字" : desc.length < 20 ? "至少 20 字，讓企業知道你會怎麼做" : "已填寫",
  });
  items.push({
    id: "cover",
    ok: input.images.length >= 1 && input.images.length <= 8,
    title: "封面圖片",
    detail: input.images.length > 8 ? "最多 8 張" : input.images.length < 1 ? "至少上傳 1 張，第一張會當封面" : "已上傳",
  });
  const visible = input.serviceType === "retainer" ? input.packages.filter((pkg) => pkg.tier === "basic") : input.packages;
  for (const pkg of visible) {
    const label = input.serviceType === "retainer" ? "月費方案" : TIER_LABEL[pkg.tier];
    const price = parseWhole(pkg.price);
    const days = parseWhole(pkg.delivery_days);
    const rev = parseWhole(pkg.revisions);
    const features = pkg.features.map((item) => item.trim()).filter(Boolean);
    const priceOk = price != null && price > 0 && price <= 10000000;
    const daysOk = days != null && days >= 1 && days <= 365;
    const revOk = rev != null && rev >= 0 && rev <= 20;
    const featOk = features.length >= 1 && features.length <= 12;
    const detail = !priceOk ? "請填大於 0 的價格"
      : !daysOk ? "請填 1–365 天的交期"
      : !revOk ? "請填 0–20 次修改"
      : !featOk ? (features.length > 12 ? "交付內容最多 12 條" : "請至少列一項交付內容")
      : "價格、交期、修改與內容都齊了";
    items.push({ id: pkg.tier, ok: priceOk && daysOk && revOk && featOk, title: label, detail });
  }
  items.push({
    id: "profile",
    ok: input.onboarded === true,
    title: "人才檔案",
    detail: input.onboarded === null ? "正在確認人才檔案是否已公開" : input.onboarded ? "已公開，可以刊登" : "請先到上方人才檔案按「儲存並公開」",
  });
  return items;
}

async function writeService(sb: Sb, id: string | null, body: Record<string, unknown>): Promise<string> {
  let payload = { ...body };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (id) {
      const { error } = await sb.from("services").update(payload).eq("id", id);
      if (!error) return id;
      const column = ["service_type", "subcategory", "search_tags"].find((key) => key in payload && missingColumn(error, key));
      if (!column) throw error;
      if (column === "service_type" && payload.service_type === "retainer") {
        throw new Error("資料庫尚未支援月費顧問，這次沒有變更方案。請先選標準專案包，或等更新完成後再儲存。");
      }
      delete payload[column];
      payload = { ...payload };
      continue;
    }
    const { data, error } = await sb.from("services").insert(payload).select("id").single();
    if (!error) return String((data as { id: string }).id);
    const column = ["service_type", "subcategory", "search_tags"].find((key) => key in payload && missingColumn(error, key));
    if (!column) throw error;
    if (column === "service_type" && payload.service_type === "retainer") {
      throw new Error("資料庫尚未支援月費顧問，這次沒有變更方案。請先選標準專案包，或等更新完成後再儲存。");
    }
    delete payload[column];
    payload = { ...payload };
  }
  throw new Error("無法儲存服務");
}

async function upsertPackage(sb: Sb, row: Record<string, unknown>): Promise<"full" | "legacy"> {
  let payload = { ...row };
  let legacy = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await sb.from("service_packages").upsert(payload, { onConflict: "service_id,tier" });
    if (!error) return legacy || !("billing_period" in payload) ? "legacy" : "full";
    const column = ["summary", "name", "billing_period"].find((key) => key in payload && missingColumn(error, key));
    if (!column) throw error;
    if (column === "billing_period" || column === "name") legacy = true;
    delete payload[column];
    payload = { ...payload };
  }
  throw new Error("無法儲存方案");
}

async function uploadMedia(sb: Sb, userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
  if (!["jpg", "png", "webp", "gif"].includes(ext)) throw new Error("請上傳 JPG、PNG、WEBP 或 GIF 圖片");
  if (file.size > 10 * 1024 * 1024) throw new Error("圖片需小於 10MB");
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("service-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from("service-media").getPublicUrl(path);
  return data.publicUrl;
}

export function ServiceWizard({
  profile, existing, onCancel, onSaved,
}: {
  profile: FlProfile;
  existing: WizardService | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { sb, setNotice } = useAuth();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(existing?.title || "");
  const [category, setCategory] = useState(existing?.category || CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState(existing?.subcategory || "");
  const [tags, setTags] = useState<string[]>(tagsOf(existing?.search_tags));
  const [tagDraft, setTagDraft] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>(serviceTypeOf(existing?.service_type));
  const [description, setDescription] = useState(existing?.description || "");
  const [images, setImages] = useState<string[]>(existing?.images || []);
  const [packages, setPackages] = useState<PkgDraft[]>(blankPackages());
  const [faqs, setFaqs] = useState<FaqDraft[]>([{ question: "", answer: "" }]);
  const [ports, setPorts] = useState<PortDraft[]>([]);
  const [availability, setAvailability] = useState(existing?.availability ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [heldNote, setHeldNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!existing);
  const [published, setPublished] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [persistedId, setPersistedId] = useState<string | null>(existing?.id ?? null);
  const [persistedStatus, setPersistedStatus] = useState(existing?.status || "draft");
  const [persistedType, setPersistedType] = useState<ServiceType>(serviceTypeOf(existing?.service_type));
  const [persistedSlug, setPersistedSlug] = useState(existing?.slug || "");
  const [knownTiers, setKnownTiers] = useState<Set<Tier>>(new Set());

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb.from("talent_profiles").select("onboarded").eq("user_id", profile.id).maybeSingle();
      if (!cancelled) setOnboarded(Boolean((data as { onboarded?: boolean } | null)?.onboarded));
    })();
    return () => { cancelled = true; };
  }, [sb, profile.id]);

  useEffect(() => {
    if (!sb || !existing) return;
    let cancelled = false;
    (async () => {
      const [pkgRes, faqRes, portRes] = await Promise.all([
        sb.from("service_packages").select("*").eq("service_id", existing.id),
        sb.from("service_faqs").select("*").eq("service_id", existing.id).order("sort"),
        sb.from("service_portfolios").select("*").eq("service_id", existing.id).order("sort"),
      ]);
      if (cancelled) return;
      if (pkgRes.data?.length) {
        const by = Object.fromEntries(pkgRes.data.map((row: { tier: string }) => [row.tier, row]));
        const known = new Set<Tier>();
        setPackages(blankPackages().map((draft) => {
          const row = by[draft.tier] as { name?: string; summary?: string; price?: number; delivery_days?: number; revisions?: number; features?: string[] } | undefined;
          if (!row) return draft;
          known.add(draft.tier);
          return {
            ...draft,
            name: String(row.name || ""),
            summary: String(row.summary || ""),
            price: row.price ? String(row.price) : "",
            delivery_days: row.delivery_days ? String(row.delivery_days) : "",
            revisions: row.revisions == null ? "" : String(row.revisions),
            features: Array.isArray(row.features) ? row.features.map(String).filter(Boolean) : [],
          };
        }));
        setKnownTiers(known);
      }
      if (faqRes.data?.length) setFaqs(faqRes.data.map((row: FaqDraft) => ({ question: row.question, answer: row.answer })));
      if (portRes.data?.length) {
        setPorts(portRes.data.map((row: PortDraft) => ({ title: row.title, summary: row.summary || "", image_path: row.image_path || "" })));
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [sb, existing]);

  const retainer = serviceType === "retainer";
  const visibleTiers = retainer ? (["basic"] as Tier[]) : TIERS;
  const subs = SUBCATEGORIES[category] || [];
  const checks = buildChecks({ description, images, serviceType, packages, onboarded });
  const ready = checks.every((item) => item.ok);
  const stepMeta = STEPS[step];

  const validateDraft = () => {
    const next: Record<string, string> = {};
    const trimmed = title.trim();
    if (trimmed.length < 4 || trimmed.length > 120) next.title = "標題請介於 4 到 120 字";
    if (!(CATEGORIES as readonly string[]).includes(category)) next.category = "請選擇有效的服務類別";
    if (subcategory.trim().length > 40) next.subcategory = "子類別最多 40 字";
    if (tags.length > 5 || tags.some((tag) => tag.length > 20)) next.tags = "搜尋標籤最多 5 個，每個 20 字以內";
    if (description.trim().length > 5000) next.description = "服務介紹最多 5000 字";
    if (images.length > 8) next.images = "圖片最多 8 張";
    for (const pkg of packages) {
      if (!packageTouched(pkg) && !knownTiers.has(pkg.tier)) continue;
      if (pkg.name.trim().length > 40) next[`${pkg.tier}-name`] = "方案名稱最多 40 字";
      if (pkg.summary.trim().length > 120) next[`${pkg.tier}-summary`] = "簡短說明最多 120 字";
      const price = parseWhole(pkg.price);
      const days = parseWhole(pkg.delivery_days);
      const rev = parseWhole(pkg.revisions);
      if (pkg.price.trim() && (price == null || Number.isNaN(price) || price > 10000000)) next[`${pkg.tier}-price`] = "價格請填 0 到 10,000,000 的整數";
      if (pkg.delivery_days.trim() && (days == null || Number.isNaN(days) || days < 1 || days > 365)) next[`${pkg.tier}-days`] = "交期請填 1 到 365 天";
      if (pkg.revisions.trim() && (rev == null || Number.isNaN(rev) || rev > 20)) next[`${pkg.tier}-rev`] = "修改次數請填 0 到 20 的整數";
      if (pkg.features.filter((item) => item.trim()).length > 12) next[`${pkg.tier}-feat`] = "方案內容最多 12 條";
    }
    const partialFaq = faqs.some((faq) => (faq.question.trim() && !faq.answer.trim()) || (!faq.question.trim() && faq.answer.trim()));
    if (partialFaq) next.faq = "問題與回答請一起填寫";
    if (ports.some((port) => port.title.trim() && port.title.trim().length < 2)) next.port = "作品標題至少 2 個字";
    return next;
  };

  const addTag = () => {
    const next = tagDraft.trim();
    if (!next) return;
    if (tags.includes(next) || tags.length >= 5 || next.length > 20) {
      setErrors((curr) => ({ ...curr, tags: "搜尋標籤最多 5 個，每個 20 字以內，且不重複" }));
      return;
    }
    setTags([...tags, next]);
    setTagDraft("");
    setErrors((curr) => ({ ...curr, tags: "" }));
  };

  const patchPackage = (tier: Tier, patch: Partial<PkgDraft>) => {
    setPackages((curr) => curr.map((pkg) => pkg.tier === tier ? { ...pkg, ...patch } : pkg));
  };

  const save = async (opts: { publish?: boolean; advanceTo?: number } = {}) => {
    if (!sb || !loaded) return false;
    const fieldErrors = validateDraft();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).some((key) => fieldErrors[key])) {
      setFormError("有欄位需要修正，才能儲存");
      setHeldNote("");
      return false;
    }
    setBusy(true);
    setFormError("");
    const liveChecks = buildChecks({ description, images, serviceType, packages, onboarded });
    const complete = liveChecks.every((item) => item.ok);
    const shapeChanged = persistedType !== serviceType;
    const interim: "draft" | "paused" | "active" =
      persistedStatus === "active" && !shapeChanged && complete ? "active"
      : persistedStatus === "active" ? "paused"
      : persistedStatus === "paused" ? "paused"
      : "draft";
    let serviceId = persistedId;
    let slug = persistedSlug || makeSlug(title);
    const base = {
      talent_id: profile.id,
      title: title.trim(),
      slug,
      category,
      subcategory: subcategory.trim(),
      search_tags: tags,
      description: description.trim(),
      images,
      availability,
      status: interim,
      service_type: serviceType,
    };
    try {
      try {
        serviceId = await writeService(sb, serviceId, base);
      } catch (err) {
        const msg = String((err as { message?: string })?.message || "");
        if (!persistedId && /services_slug|duplicate key/i.test(msg)) {
          slug = `svc-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
          serviceId = await writeService(sb, null, { ...base, slug });
        } else {
          throw err;
        }
      }
      setPersistedId(serviceId);
      setPersistedSlug(slug);
      setPersistedStatus(interim);
      setPersistedType(serviceType);

      const trimRetainer = retainer && (Boolean(opts.publish) || step === 1);
      const nextKnown = new Set(knownTiers);
      for (const pkg of packages) {
        const show = retainer ? pkg.tier === "basic" : true;
        if (!show) continue;
        if (!packageTouched(pkg) && !knownTiers.has(pkg.tier)) continue;
        const billing: BillingPeriod = retainer ? "monthly" : "one_time";
        const mode = await upsertPackage(sb, {
          service_id: serviceId,
          tier: pkg.tier,
          name: pkg.name.trim(),
          summary: pkg.summary.trim(),
          billing_period: billing,
          price: parseWhole(pkg.price) ?? 0,
          delivery_days: parseWhole(pkg.delivery_days) ?? 0,
          revisions: parseWhole(pkg.revisions) ?? 0,
          features: pkg.features.map((item) => item.trim()).filter(Boolean),
        });
        if (retainer && mode === "legacy") {
          throw new Error("資料庫尚未支援每月計費，這次沒有刪除原有方案。");
        }
        nextKnown.add(pkg.tier);
      }
      if (trimRetainer) {
        const { error } = await sb.from("service_packages").delete().eq("service_id", serviceId).in("tier", ["standard", "premium"]);
        if (error) throw error;
        nextKnown.delete("standard");
        nextKnown.delete("premium");
      }
      setKnownTiers(nextKnown);

      const { error: delF } = await sb.from("service_faqs").delete().eq("service_id", serviceId);
      if (delF) throw delF;
      const faqRows = faqs.filter((faq) => faq.question.trim() && faq.answer.trim()).map((faq, index) => ({
        service_id: serviceId, question: faq.question.trim(), answer: faq.answer.trim(), sort: index + 1,
      }));
      if (faqRows.length) {
        const { error } = await sb.from("service_faqs").insert(faqRows);
        if (error) throw error;
      }
      const { error: delP } = await sb.from("service_portfolios").delete().eq("service_id", serviceId);
      if (delP) throw delP;
      const portRows = ports.filter((port) => port.title.trim().length >= 2).map((port, index) => ({
        service_id: serviceId, title: port.title.trim(), summary: port.summary.trim(), image_path: port.image_path || null, sort: index + 1,
      }));
      if (portRows.length) {
        const { error } = await sb.from("service_portfolios").insert(portRows);
        if (error) throw error;
      }

      if (opts.publish) {
        if (!complete) {
          setHeldNote(interim === "paused" && persistedStatus === "active" ? "已暫停展示，補齊後再刊登" : "已儲存。下面還沒完成的項目，補上就能刊登");
          setStep(5);
          return false;
        }
        if (interim !== "active") {
          const { error } = await sb.from("services").update({ status: "active" }).eq("id", serviceId);
          if (error) throw error;
          setPersistedStatus("active");
        }
        setPublished(true);
        setNotice("服務已刊登");
        return true;
      }
      setHeldNote(interim === "paused" && persistedStatus === "active" ? "已暫停展示。這份服務暫時不會出現在市集。" : "已儲存，可以隨時再回來補。");
      if (opts.advanceTo != null) setStep(opts.advanceTo);
      return true;
    } catch (err) {
      setFormError(rpcMessage(err));
      if (serviceId && opts.publish) setHeldNote(interim === "paused" ? "已暫停展示，請修正後再刊登" : "已儲存為草稿，請修正後再刊登");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const goTo = (next: number) => {
    if (next === step || busy) return;
    if (next < step) {
      setStep(next);
      return;
    }
    void save({ advanceTo: next });
  };

  const onUpload = async (file: File, kind: "image" | "port", portIdx?: number) => {
    if (!sb) return;
    if (kind === "image" && images.length >= 8) {
      setFormError("圖片最多 8 張");
      return;
    }
    try {
      const url = await uploadMedia(sb, profile.id, file);
      if (kind === "image") setImages((curr) => curr.length >= 8 ? curr : [...curr, url]);
      else if (portIdx != null) setPorts((curr) => curr.map((port, index) => index === portIdx ? { ...port, image_path: url } : port));
    } catch (err) {
      setFormError(rpcMessage(err));
    }
  };

  if (published) {
    return (
      <section style={{ ...card, padding: 28 }}>
        <div style={{ fontSize: 13, letterSpacing: ".14em", color: C.forest2, fontWeight: 700, marginBottom: 8 }}>已刊登</div>
        <h2 style={{ fontSize: 26, color: C.ink, marginBottom: 8 }}>{title}</h2>
        <p style={{ color: C.ink2, lineHeight: 1.7 }}>這份服務現在會出現在服務市集。你可以隨時回來改價格或說明。</p>
        <button type="button" className="fl-btn fl-primary" style={{ ...btn("primary"), marginTop: 18 }} onClick={onSaved}>回到我的服務</button>
      </section>
    );
  }

  return (
    <section style={{ ...card, padding: "22px 22px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ fontSize: 22, color: C.ink }}>{existing ? "編輯服務" : "新增服務"}</h2>
        <button type="button" className="fl-link" style={{ border: "none", background: "transparent", color: C.forest2, fontWeight: 700 }} onClick={onCancel}>返回列表</button>
      </div>
      <nav className="fl-wizard-steps" aria-label="建立服務步驟">
        {STEPS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className={index < step ? "fl-wizard-step is-done" : "fl-wizard-step"}
            aria-current={index === step ? "step" : undefined}
            onClick={() => goTo(index)}
          >
            <span className="fl-wizard-num">{index < step ? "✓" : index + 1}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <h3 style={{ fontSize: 20, color: C.ink, marginBottom: 6 }}>{stepMeta.title}</h3>
      <p style={{ color: C.ink2, lineHeight: 1.7, marginBottom: 16 }}>{stepMeta.sub}</p>

      {step === 0 ? (
        <div>
          <Field label="服務標題" value={title} required placeholder="我會為你完成一份可直接使用的品牌健檢" error={errors.title} onChange={setTitle} />
          <p style={{ margin: "-6px 0 14px", fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>建議用「我會為你…」開頭，讓企業一眼知道你會交付什麼。{title.trim() && !title.trim().startsWith("我會") ? " 現在的標題也可以，之後仍能修改。" : ""}</p>
          <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
            <legend style={{ fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 8 }}>服務類型</legend>
            <div role="radiogroup" aria-label="服務類型" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SERVICE_TYPES.map((item) => {
                const selected = serviceType === item.id;
                return (
                  <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setServiceType(item.id)} style={{ border: `1px solid ${selected ? C.forest : C.line}`, background: selected ? C.forest : C.white, color: selected ? C.ivory : C.ink2, borderRadius: 999, padding: "9px 14px", fontWeight: 700, fontSize: 14 }}>
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: C.ink3 }}>{TYPE_HINT[serviceType]}</p>
          </fieldset>
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 6 }}>類別</div>
            <select className="fl-mini" value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(""); }} style={{ borderRadius: 12 }}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            {errors.category ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 4 }}>{errors.category}</div> : null}
          </label>
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 6 }}>子類別（選填）</div>
            <select className="fl-mini" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} style={{ borderRadius: 12 }}>
              <option value="">先不選</option>
              {subs.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 6 }}>搜尋標籤（選填，最多 5 個）</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {tags.map((tag) => (
                <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.sageMist, color: C.forest, borderRadius: 999, padding: "4px 8px 4px 12px", fontWeight: 700, fontSize: 13 }}>
                  {tag}
                  <button type="button" aria-label={`移除${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))} style={{ border: "none", background: "transparent", color: C.forest, cursor: "pointer" }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="fl-mini" value={tagDraft} placeholder="例如：品牌健檢" onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} />
              <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} onClick={addTag}>加入</button>
            </div>
            {errors.tags ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 4 }}>{errors.tags}</div> : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="fl-price-scroll">
          <table className={retainer ? "fl-price-table is-retainer" : "fl-price-table"}>
            <thead>
              <tr>
                <th />
                {visibleTiers.map((tier) => <th key={tier} scope="col">{retainer ? "月費方案" : TIER_LABEL[tier]}</th>)}
              </tr>
            </thead>
            <tbody>
              <PriceRow label="方案名稱" tiers={visibleTiers} packages={packages} errors={errors} field="name" placeholder={retainer ? "每月顧問" : "入門健檢"} tierName={(tier) => retainer ? "月費方案" : TIER_LABEL[tier]} onChange={patchPackage} />
              <PriceRow label="簡短說明" tiers={visibleTiers} packages={packages} errors={errors} field="summary" placeholder="一句話說這個方案包含什麼" tierName={(tier) => retainer ? "月費方案" : TIER_LABEL[tier]} onChange={patchPackage} />
              <PriceRow label={retainer ? "每月天數" : "交付天數"} tiers={visibleTiers} packages={packages} errors={errors} field="delivery_days" placeholder="5" tierName={(tier) => retainer ? "月費方案" : TIER_LABEL[tier]} onChange={patchPackage} />
              <PriceRow label={retainer ? "每月修改" : "修改次數"} tiers={visibleTiers} packages={packages} errors={errors} field="revisions" placeholder="1" tierName={(tier) => retainer ? "月費方案" : TIER_LABEL[tier]} onChange={patchPackage} />
              <tr>
                <th scope="row">包含內容</th>
                {visibleTiers.map((tier) => {
                  const pkg = packages.find((item) => item.tier === tier)!;
                  return (
                    <td key={tier}>
                      <span className="fl-tier-tag">{retainer ? "月費方案" : TIER_LABEL[tier]}</span>
                      <FeatureList items={pkg.features} onChange={(features) => patchPackage(tier, { features })} />
                      {errors[`${tier}-feat`] ? <div style={{ color: "#B4533C", fontSize: 12, marginTop: 4 }}>{errors[`${tier}-feat`]}</div> : null}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th scope="row">{retainer ? "每月價格" : "價格 NT$"}</th>
                {visibleTiers.map((tier) => {
                  const pkg = packages.find((item) => item.tier === tier)!;
                  return (
                    <td key={tier}>
                      <span className="fl-tier-tag">{retainer ? "月費方案" : TIER_LABEL[tier]}</span>
                      <span style={{ position: "relative", display: "block" }}>
                        <input className="fl-mini" inputMode="numeric" aria-label={retainer ? "每月價格" : `${TIER_LABEL[tier]}價格`} value={pkg.price} placeholder="4800" onChange={(event) => patchPackage(tier, { price: event.target.value })} style={{ paddingRight: retainer ? 42 : 12 }} />
                        {retainer ? <span aria-hidden="true" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.ink3 }}>/月</span> : null}
                      </span>
                      {errors[`${tier}-price`] ? <div style={{ color: "#B4533C", fontSize: 12, marginTop: 4 }}>{errors[`${tier}-price`]}</div> : null}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          {retainer ? <p style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>每月天數也可以當成你的回應週期。</p> : <p style={{ fontSize: 13, color: C.ink3 }}>左右滑動可以比較三個方案。沒填完也能先存。</p>}
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <Field label="服務說明" value={description} textarea placeholder="你會怎麼開始、交付什麼、適合誰。" error={errors.description} onChange={setDescription} />
          <div style={{ marginTop: -8, marginBottom: 16, fontSize: 13, color: description.trim().length > 5000 ? "#B4533C" : C.ink3 }}>{description.trim().length} / 5000{description.trim().length < 20 ? "・刊登前至少 20 字" : ""}</div>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>常見問題（選填）</h3>
          {faqs.map((faq, index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <Field label={`問題 ${index + 1}`} value={faq.question} onChange={(value) => setFaqs(faqs.map((item, i) => i === index ? { ...item, question: value } : item))} />
              <Field label="回答" value={faq.answer} textarea onChange={(value) => setFaqs(faqs.map((item, i) => i === index ? { ...item, answer: value } : item))} />
              {faqs.length > 1 ? <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => setFaqs(faqs.filter((_, i) => i !== index))}>移除此題</button> : null}
            </div>
          ))}
          {errors.faq ? <div style={{ color: "#B4533C", fontSize: 13, marginBottom: 8 }}>{errors.faq}</div> : null}
          <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}>新增問題</button>
        </div>
      ) : null}

      {step === 3 ? (
        <div style={{ border: `1px dashed ${C.sage}`, borderRadius: 18, padding: 22, background: C.ivory }}>
          <div style={{ display: "inline-flex", border: `1px solid ${C.forest}`, color: C.forest, background: C.sageMist, borderRadius: 999, padding: "4px 10px", fontWeight: 800, fontSize: 13, marginBottom: 12 }}>即將推出</div>
          <p style={{ color: C.ink2, lineHeight: 1.7, marginBottom: 8 }}>企業下單時要先回答的問題，例如「目前有沒有品牌指引？」「希望什麼時候看到第一版？」</p>
          <p style={{ color: C.ink3, lineHeight: 1.7 }}>這個步驟還沒有可以儲存的欄位，不會影響草稿。你可以先完成定價、說明和圖片。</p>
        </div>
      ) : null}

      {step === 4 ? (
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {images.map((src, index) => (
              <div key={src + index} style={{ width: 120, height: 84, borderRadius: 12, overflow: "hidden", position: "relative", background: C.sageMist }}>
                <img src={publicMediaUrl(src) || src} alt={index === 0 ? "封面" : `服務圖片 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: 6, bottom: 6, background: C.ivory, color: C.forest, borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "2px 6px" }}>{index === 0 ? "封面" : index + 1}</span>
                <button type="button" aria-label="移除圖片" onClick={() => setImages(images.filter((_, i) => i !== index))} style={{ position: "absolute", top: 4, right: 4, border: "none", borderRadius: 999, width: 22, height: 22, background: C.white }}>×</button>
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void onUpload(file, "image"); event.target.value = ""; }} />
          {errors.images ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 6 }}>{errors.images}</div> : <div style={{ fontSize: 13, color: C.ink3, marginTop: 6 }}>刊登前至少 1 張。目前 {images.length} / 8。</div>}
          <h3 style={{ fontSize: 16, margin: "18px 0 8px" }}>作品（選填）</h3>
          {ports.map((port, index) => (
            <div key={index} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <Field label="作品標題" value={port.title} onChange={(value) => setPorts(ports.map((item, i) => i === index ? { ...item, title: value } : item))} />
              <Field label="說明" value={port.summary} textarea onChange={(value) => setPorts(ports.map((item, i) => i === index ? { ...item, summary: value } : item))} />
              {port.image_path ? <img src={publicMediaUrl(port.image_path) || port.image_path} alt={port.title || "作品"} style={{ width: 140, height: 88, objectFit: "cover", borderRadius: 10 }} /> : null}
              <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file, "port", index); event.target.value = ""; }} />
              <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), marginTop: 8 }} onClick={() => setPorts(ports.filter((_, i) => i !== index))}>移除此筆</button>
            </div>
          ))}
          {errors.port ? <div style={{ color: "#B4533C", fontSize: 13, marginBottom: 8 }}>{errors.port}</div> : null}
          <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => setPorts([...ports, { title: "", summary: "", image_path: "" }])}>新增作品</button>
        </div>
      ) : null}

      {step === 5 ? (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checks.map((item) => (
              <div key={item.id} className={item.ok ? "fl-check is-ok" : "fl-check is-miss"}>
                <span aria-hidden="true" style={{ fontWeight: 800, color: item.ok ? C.forest : "#B4533C" }}>{item.ok ? "✓" : "!"}</span>
                <div>
                  <div style={{ fontWeight: 800, color: C.ink }}>{item.title}</div>
                  <div style={{ fontSize: 14, color: C.ink2, marginTop: 2 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: C.ink3, marginTop: 12, lineHeight: 1.6 }}>子類別和搜尋標籤有助於被找到，沒填也能刊登。買家下單問卷尚未開放。</p>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, color: C.ink2 }}>
            <input type="checkbox" checked={availability} onChange={(event) => setAvailability(event.target.checked)} />
            刊登後開放接案
          </label>
        </div>
      ) : null}

      {formError ? <div role="alert" style={{ color: "#B4533C", marginTop: 12 }}>{formError}</div> : null}
      {heldNote ? <div role="status" style={{ color: C.forest, background: C.sageMist, borderRadius: 12, padding: "10px 14px", marginTop: 12 }}>{heldNote}</div> : null}
      <div className="fl-wizard-bar">
        {step > 0 ? <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} disabled={busy} onClick={() => goTo(step - 1)}>上一步</button> : null}
        <button type="button" className="fl-btn fl-ghost" style={btn("ghost")} disabled={busy || !loaded} onClick={() => void save()}>{busy ? "儲存中…" : "儲存進度"}</button>
        {step < 5 ? (
          <button type="button" className="fl-btn fl-primary" style={btn("primary")} disabled={busy || !loaded} onClick={() => void save({ advanceTo: step + 1 })}>{step === 0 ? "儲存並繼續" : "下一步"}</button>
        ) : (
          <button type="button" className="fl-btn fl-primary" style={{ ...btn("primary"), opacity: ready ? 1 : 0.45 }} disabled={busy || !loaded || !ready} onClick={() => void save({ publish: true })}>確認刊登</button>
        )}
      </div>
    </section>
  );
}

function PriceRow({
  label, tiers, packages, errors,   field, placeholder, tierName, onChange,
}: {
  label: string;
  tiers: Tier[];
  packages: PkgDraft[];
  errors: Record<string, string>;
  field: "name" | "summary" | "delivery_days" | "revisions";
  placeholder: string;
  tierName: (tier: Tier) => string;
  onChange: (tier: Tier, patch: Partial<PkgDraft>) => void;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {tiers.map((tier) => {
        const pkg = packages.find((item) => item.tier === tier)!;
        const message = errors[`${tier}-${field === "delivery_days" ? "days" : field === "revisions" ? "rev" : field}`];
        return (
          <td key={tier}>
            <span className="fl-tier-tag">{tierName(tier)}</span>
            <input className="fl-mini" aria-label={`${TIER_LABEL[tier]} ${label}`} inputMode={field === "delivery_days" || field === "revisions" ? "numeric" : "text"} value={pkg[field]} placeholder={placeholder} onChange={(event) => onChange(tier, { [field]: event.target.value })} />
            {message ? <div style={{ color: "#B4533C", fontSize: 12, marginTop: 4 }}>{message}</div> : null}
          </td>
        );
      })}
    </tr>
  );
}

function FeatureList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const text = draft.trim();
    if (!text || items.length >= 12) return;
    onChange([...items, text]);
    setDraft("");
  };
  return (
    <div>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 13, color: C.ink, marginBottom: 4 }}>
          <span>{item}</span>
          <button type="button" aria-label={`移除${item}`} onClick={() => onChange(items.filter((_, i) => i !== index))} style={{ border: "none", background: "transparent", color: C.ink3, cursor: "pointer" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 4 }}>
        <input className="fl-mini" value={draft} placeholder="加一項" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        <button type="button" className="fl-btn fl-ghost" style={{ ...btn("ghost"), padding: "8px 10px" }} onClick={add}>加</button>
      </div>
    </div>
  );
}
