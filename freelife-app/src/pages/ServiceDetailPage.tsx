import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { C, TIER_LABEL, btn, card, fmt, wrap } from "../lib/theme";
import { getPublicServicePage, publicMediaUrl, rpcMessage, startPayment, type ServicePackage, type ServicePage } from "../lib/supabase";
import { Icon, Image, Photo, Stars, initialsOf } from "../components/ui";

function useSeo(title: string, description: string, url?: string, image?: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const tags: { sel: string; attr: string; el: HTMLMetaElement }[] = [];
    const set = (attr: "name" | "property", key: string, value: string) => {
      const sel = `meta[${attr}="${key}"]`;
      let el = document.head.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
      tags.push({ sel, attr, el });
    };
    if (description) {
      set("name", "description", description);
      set("property", "og:description", description);
    }
    set("property", "og:title", title);
    set("property", "og:type", "website");
    if (url) set("property", "og:url", url);
    if (image) set("property", "og:image", image);
    return () => { document.title = prevTitle; };
  }, [title, description, url, image]);
}

export default function ServiceDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { sb, profile, openAuth, setNotice } = useAuth();
  const [page, setPage] = useState<ServicePage | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [tier, setTier] = useState<"basic" | "standard" | "premium">("standard");
  const [imgIdx, setImgIdx] = useState(0);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStep, setOrderStep] = useState<"form" | "payment">("form");

  useEffect(() => {
    let cancelled = false;
    setPage(undefined);
    setError("");
    setImgIdx(0);
    setOrderOpen(false);
    setOrderId(null);
    setOrderStep("form");
    (async () => {
      try {
        const data = await getPublicServicePage(slug);
        if (cancelled) return;
        setPage(data);
        const hasStd = data?.packages?.some((p) => p.tier === "standard");
        setTier(hasStd ? "standard" : (data?.packages?.[0]?.tier as typeof tier) || "basic");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(rpcMessage(err));
          setPage(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!sb || !profile || !page?.service.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb.from("service_favorites").select("service_id").eq("user_id", profile.id).eq("service_id", page.service.id).maybeSingle();
      if (!cancelled) setFav(!!data);
    })();
    return () => { cancelled = true; };
  }, [sb, profile, page?.service.id]);

  const desc = page?.service.description?.replace(/\s+/g, " ").slice(0, 140) || "FREELIFE 標準化服務";
  const cover = page?.service.images?.[0] ? (page.service.images[0].startsWith("http") ? page.service.images[0] : window.location.origin + (page.service.images[0].startsWith("/") ? page.service.images[0] : "/" + page.service.images[0])) : undefined;
  useSeo(
    page ? `${page.service.title}｜FREELIFE` : error ? "找不到服務｜FREELIFE" : "載入中｜FREELIFE",
    desc,
    typeof window !== "undefined" ? window.location.href : undefined,
    cover,
  );

  const pkg: ServicePackage | undefined = useMemo(
    () => page?.packages.find((p) => p.tier === tier) || page?.packages[0],
    [page, tier],
  );

  const images = page?.service.images?.length ? page.service.images : [];
  const skills = Array.isArray(page?.talent.skills) ? (page!.talent.skills as string[]) : [];

  const requireBusiness = (action: () => void) => {
    if (!profile) {
      setNotice("請先登入企業雇主帳號");
      openAuth("login", "business");
      return;
    }
    if (profile.role !== "business") {
      setNotice("僅限企業雇主帳號進行此操作");
      return;
    }
    action();
  };

  const toggleFav = async () => {
    if (!profile || !sb) {
      setNotice("請先登入後再收藏服務");
      openAuth("login");
      return;
    }
    if (!page) return;
    try {
      if (fav) {
        const { error: e } = await sb.from("service_favorites").delete().eq("user_id", profile.id).eq("service_id", page.service.id);
        if (e) throw e;
        setFav(false);
      } else {
        const { error: e } = await sb.from("service_favorites").insert({ user_id: profile.id, service_id: page.service.id });
        if (e) throw e;
        setFav(true);
      }
    } catch (err) {
      setNotice(rpcMessage(err));
    }
  };

  const submitOrder = async () => {
    if (!sb || !page || !pkg) return;
    if (brief.trim().length < 8) {
      setFormError("請至少用 8 個字說明合作需求");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const { data, error } = await sb.rpc("create_order", {
        p_service_id: page.service.id,
        p_tier: pkg.tier,
        p_brief: brief.trim(),
      });
      if (error) throw error;
      setOrderId(String(data));
      setOrderStep("payment");
      setNotice("訂單已建立，待人才確認");
    } catch (err) {
      setFormError(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitContact = async () => {
    if (!sb || !page) return;
    setBusy(true);
    setFormError("");
    try {
      const { data, error } = await sb.rpc("start_service_contact", {
        p_service_id: page.service.id,
        p_kind: "quote",
        p_note: note.trim() || `想進一步了解「${page.service.title}」`,
      });
      if (error) throw error;
      const conversationId = data && typeof data === "object" && "conversation_id" in data
        ? String((data as { conversation_id?: string }).conversation_id || "")
        : "";
      setContactOpen(false);
      setNote("");
      setNotice("已開啟對話");
      navigate(conversationId ? `/messages/${conversationId}` : "/dashboard");
    } catch (err) {
      setFormError(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (page === undefined && !error) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center", color: C.ink3 }}>載入服務內容中…</div>
        <SiteFooter />
      </>
    );
  }

  if (!page) {
    return (
      <>
        <SiteHeader />
        <div style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 30, color: C.ink, marginBottom: 12 }}>找不到這個服務</h1>
          <p style={{ color: C.ink2, marginBottom: 24 }}>{error || "服務可能已下架，或網址不正確。"}</p>
          <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => navigate("/services")}>回到服務列表</button>
        </div>
        <SiteFooter />
      </>
    );
  }

  const PackageCard = ({ desktopCta }: { desktopCta?: boolean }) => (
    <div className="fl-pkg-col" style={{ ...card, padding: 22, position: "sticky", top: 96 }}>
      <div style={{ display: "flex", gap: 6, background: C.ivory2, borderRadius: 999, padding: 4, marginBottom: 18 }}>
        {(["basic", "standard", "premium"] as const).map((t) => {
          const exists = page.packages.some((p) => p.tier === t);
          return (
            <button key={t} disabled={!exists} className="fl-btn" onClick={() => exists && setTier(t)} style={{ flex: 1, border: "none", borderRadius: 999, padding: "9px 0", fontSize: 13, fontWeight: 700, background: tier === t ? C.forest : "transparent", color: tier === t ? C.ivory : exists ? C.ink2 : C.ink3, minHeight: 40, opacity: exists ? 1 : 0.45 }}>
              {TIER_LABEL[t]}
            </button>
          );
        })}
      </div>
      {pkg ? (
        <>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.forest }}>{fmt(pkg.price)}</div>
          <div style={{ display: "flex", gap: 16, margin: "12px 0 18px", color: C.ink2, fontSize: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="clock" size={16} />{pkg.delivery_days} 天交付</span>
            <span>修訂 {pkg.revisions} 次</span>
          </div>
          <ul style={{ margin: "0 0 18px", padding: "0 0 0 18px", color: C.ink2, fontSize: 14, lineHeight: 1.8 }}>
            {(pkg.features || []).map((f) => <li key={f}>{f}</li>)}
          </ul>
          <div className={desktopCta ? "fl-desktop-cta" : undefined} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="fl-btn fl-primary" style={{ ...btn("primary", true), width: "100%" }} disabled={!page.service.availability} onClick={() => requireBusiness(() => { setFormError(""); setOrderStep("form"); setOrderOpen(true); })}>
              {page.service.availability ? "立即合作" : "目前暫停接案"}
            </button>
            <button className="fl-btn fl-ghost" style={{ ...btn("ghost", true), width: "100%" }} onClick={() => requireBusiness(() => { setFormError(""); setContactOpen(true); })}>聯絡人才</button>
          </div>
        </>
      ) : (
        <div style={{ color: C.ink3 }}>尚未設定方案</div>
      )}
    </div>
  );

  return (
    <>
      <SiteHeader />
      <div style={{ ...wrap, paddingTop: 36, paddingBottom: 120 }}>
        <div style={{ fontSize: 13, color: C.ink3, marginBottom: 18 }}>
          <span className="fl-link" onClick={() => navigate("/services")}>探索服務</span>
          <span> ／ {page.service.category} ／ {page.service.title}</span>
        </div>

        <div className="fl-gig" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.9fr)", gap: 36, alignItems: "start" }}>
          <div>
            <h1 style={{ fontSize: "clamp(26px, 3vw, 36px)", fontWeight: 800, color: C.ink, lineHeight: 1.3, marginBottom: 18 }}>{page.service.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <div style={{ width: 48, height: 48, borderRadius: 999, overflow: "hidden", background: C.forest, color: C.ivory, display: "grid", placeItems: "center", fontWeight: 700 }}>
                {initialsOf(page.talent.name)}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: C.ink }}><Link to={`/talents/${page.talent.username || page.talent.id}`} style={{ color: "inherit", textDecoration: "none" }}>{page.talent.name}</Link></div>
                <div style={{ fontSize: 14, color: C.ink2 }}>{page.talent.headline}{page.talent.location ? `・${page.talent.location}` : ""}</div>
              </div>
              {page.stats.review_count > 0 ? <Stars value={page.stats.avg_rating} reviews={page.stats.review_count} /> : <span style={{ fontSize: 13, color: C.ink3 }}>尚無評價</span>}
              <button className="fl-btn" aria-label="收藏服務" onClick={() => void toggleFav()} style={{ marginLeft: "auto", width: 42, height: 42, borderRadius: 999, border: `1px solid ${C.line}`, background: C.white, color: fav ? "#B4533C" : C.ink3, fontSize: 18 }}>{fav ? "♥" : "♡"}</button>
            </div>

            {images.length ? (
              <div style={{ marginBottom: 28 }}>
                <div style={{ borderRadius: 20, overflow: "hidden", background: C.sageMist }}>
                  <Image src={publicMediaUrl(images[imgIdx]) || images[imgIdx]} alt={page.service.title} height={420} />
                </div>
                {images.length > 1 ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
                    {images.map((src, i) => (
                      <button key={src + i} onClick={() => setImgIdx(i)} style={{ border: `2px solid ${i === imgIdx ? C.forest : "transparent"}`, padding: 0, borderRadius: 12, overflow: "hidden", width: 84, height: 64, background: C.sageMist }}>
                        <Image src={publicMediaUrl(src) || src} alt="" height={64} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Section title="服務說明">
              <p style={{ fontSize: 16, lineHeight: 1.9, color: C.ink2, whiteSpace: "pre-wrap" }}>{page.service.description}</p>
            </Section>

            {pkg ? (
              <Section title="這個方案包含">
                <ul style={{ margin: 0, paddingLeft: 18, color: C.ink2, lineHeight: 1.9 }}>
                  {(pkg.features || []).map((f) => <li key={f}>{f}</li>)}
                </ul>
                <div style={{ marginTop: 10, color: C.ink3, fontSize: 14 }}>{pkg.delivery_days} 天交付・可修訂 {pkg.revisions} 次</div>
              </Section>
            ) : null}

            <Section title="人才介紹">
              <p style={{ fontSize: 16, lineHeight: 1.9, color: C.ink2, whiteSpace: "pre-wrap" }}>{page.talent.bio || "這位人才尚未填寫詳細自我介紹，可先從方案與作品了解合作方式。"}</p>
              {page.talent.languages ? <div style={{ marginTop: 10, fontSize: 14, color: C.ink2 }}>語言：{page.talent.languages}</div> : null}
              {skills.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                  {skills.map((s) => <span key={s} style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 12px", fontSize: 13, color: C.ink2 }}>{s}</span>)}
                </div>
              ) : null}
            </Section>

            {page.portfolios?.length ? (
              <Section title="相關作品">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 16 }}>
                  {page.portfolios.map((p) => (
                    <div key={p.id} style={{ ...card, padding: 0 }}>
                      {p.image_path ? <Photo src={publicMediaUrl(p.image_path) || p.image_path} alt={p.title} height={150} radius={0} /> : null}
                      <div style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, color: C.ink }}>{p.title}</div>
                        {p.summary ? <div style={{ fontSize: 14, color: C.ink2, marginTop: 6 }}>{p.summary}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {page.faqs?.length ? (
              <Section title="常見問題">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {page.faqs.map((f) => {
                    const open = openFaq === f.id;
                    return (
                      <div key={f.id} style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: C.white }}>
                        <button className="fl-btn" onClick={() => setOpenFaq(open ? null : f.id)} style={{ width: "100%", border: "none", background: "transparent", textAlign: "left", padding: "16px 18px", fontSize: 16, fontWeight: 700, color: C.ink, display: "flex", justifyContent: "space-between", gap: 12 }}>
                          {f.question}<span style={{ color: C.ink3 }}>{open ? "–" : "+"}</span>
                        </button>
                        {open ? <div style={{ padding: "0 18px 16px", color: C.ink2, lineHeight: 1.8 }}>{f.answer}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            <Section title="評價">
              {page.reviews?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Stars value={page.stats.avg_rating} reviews={page.stats.review_count} />
                  {page.reviews.map((r) => (
                    <div key={r.id} style={{ ...card, padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <b>{r.reviewer_name || "企業雇主"}</b>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment ? <p style={{ color: C.ink2, fontSize: 15, lineHeight: 1.7 }}>{r.comment}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: C.ink3 }}>還沒有評價。完成第一筆合作後，真實評價會顯示在這裡。</p>
              )}
            </Section>

            {page.related?.length ? (
              <Section title="相關服務">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14 }}>
                  {page.related.map((r) => (
                    <Link key={r.slug} to={`/services/${r.slug}`} style={{ ...card, padding: 16, textDecoration: "none" }}>
                      <div style={{ fontSize: 12, color: C.forest2, fontWeight: 600 }}>{r.category}</div>
                      <div style={{ fontWeight: 700, color: C.ink, margin: "6px 0" }}>{r.title}</div>
                      <div style={{ fontSize: 13, color: C.ink2 }}>{r.talent_name}</div>
                      <div style={{ marginTop: 8, fontWeight: 700, color: C.forest }}>{r.basic_price != null ? `${fmt(r.basic_price)} 起` : "查看方案"}</div>
                    </Link>
                  ))}
                </div>
              </Section>
            ) : null}
          </div>

          <PackageCard desktopCta />
        </div>
      </div>

      <div className="fl-mobile-cta" style={{ display: "none", position: "fixed", left: 0, right: 0, bottom: 0, background: "rgba(250,246,238,.96)", borderTop: `1px solid ${C.line}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", zIndex: 50, gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: C.ink3 }}>{pkg ? TIER_LABEL[pkg.tier] : ""}{pkg ? `・${pkg.delivery_days} 天` : ""}</div>
          <div style={{ fontWeight: 800, color: C.forest, fontSize: 18 }}>{pkg ? fmt(pkg.price) : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => requireBusiness(() => { setFormError(""); setContactOpen(true); })}>聯絡</button>
          <button className="fl-btn fl-primary" style={btn("primary")} disabled={!page.service.availability} onClick={() => requireBusiness(() => { setFormError(""); setOrderStep("form"); setOrderOpen(true); })}>立即合作</button>
        </div>
      </div>

      {orderOpen ? (
        <Modal onClose={() => !busy && setOrderOpen(false)}>
          {orderStep === "form" ? (
            <>
              <h3 style={{ fontSize: 22, marginBottom: 8 }}>確認合作方案</h3>
              <p style={{ color: C.ink2, marginBottom: 16 }}>{page.service.title}・{pkg ? `${TIER_LABEL[pkg.tier]} ${fmt(pkg.price)}` : ""}。價格由系統依方案寫入，無法在前端改價。</p>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>合作簡述 *</div>
                <textarea className="fl-input" value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} style={areaStyle} placeholder="請說明目標、時程與既有資料" />
              </label>
              {formError ? <div style={{ color: "#B4533C", margin: "10px 0" }}>{formError}</div> : null}
              <button className="fl-btn fl-primary" disabled={busy} style={{ ...btn("primary", true), width: "100%", marginTop: 12 }} onClick={() => void submitOrder()}>{busy ? "送出中…" : "送出訂單"}</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 8 }}>訂單已建立</div>
              <h3 style={{ fontSize: 22, marginBottom: 12 }}>等待人才確認</h3>
              <p style={{ color: C.ink2, marginBottom: 18 }}>付款功能尚未開放，目前不會向你收費。</p>
              <div style={{ border: `1px dashed ${C.sage}`, borderRadius: 18, padding: "20px 22px", background: C.ivory, marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>付款（即將開放）</div>
                <div style={{ fontSize: 14, color: C.ink3, marginTop: 6, marginBottom: 14 }}>台灣金流稍後接入，這一階段不會出現信用卡欄位。</div>
                <button type="button" className="fl-btn fl-ghost" disabled aria-disabled="true" style={{ ...btn("ghost"), opacity: 0.55, cursor: "not-allowed" }} onClick={() => { void startPayment(orderId || undefined); }}>付款（即將開放）</button>
              </div>
              <button className="fl-btn fl-primary" style={{ ...btn("primary", true), width: "100%" }} onClick={() => { setOrderOpen(false); navigate("/dashboard"); }}>前往工作台</button>
            </>
          )}
        </Modal>
      ) : null}

      {contactOpen ? (
        <Modal onClose={() => !busy && setContactOpen(false)}>
          <h3 style={{ fontSize: 22, marginBottom: 8 }}>聯絡 {page.talent.name}</h3>
          <p style={{ color: C.ink2, marginBottom: 16 }}>系統會建立邀請與對話，人才可在工作台回覆。</p>
          <textarea className="fl-input" value={note} onChange={(e) => setNote(e.target.value)} rows={4} style={areaStyle} placeholder="想詢問的重點（選填）" />
          {formError ? <div style={{ color: "#B4533C", margin: "10px 0" }}>{formError}</div> : null}
          <button className="fl-btn fl-primary" disabled={busy} style={{ ...btn("primary", true), width: "100%", marginTop: 12 }} onClick={() => void submitContact()}>{busy ? "送出中…" : "送出邀請"}</button>
        </Modal>
      ) : null}

      <SiteFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,38,32,.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 24 }}>
      <div role="dialog" onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 24, padding: 32, width: "min(520px, 100%)", border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(31,61,43,.18)" }}>
        {children}
      </div>
    </div>
  );
}

const areaStyle = {
  width: "100%" as const,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 15,
  color: C.ink,
  background: C.white,
  fontFamily: "inherit",
  resize: "vertical" as const,
};
