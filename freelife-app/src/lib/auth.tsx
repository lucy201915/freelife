import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { C, btn, wrap, FONT, CSS } from "./theme";
import { getSb, startPayment, type FlProfile } from "./supabase";
import { Leaf, Icon } from "../components/ui";
import { trackEvent } from "./analytics";

type AuthMode = "login" | "signup" | null;

type AuthCtx = {
  sb: ReturnType<typeof getSb>;
  profile: FlProfile | null;
  notice: string;
  setNotice: (s: string) => void;
  openAuth: (mode: "login" | "signup", role?: "talent" | "business") => void;
  handleSignOut: () => Promise<void>;
  openRequest: (prefill?: { title?: string; brief?: string; tags?: string }) => void;
  savedTalentNames: string[];
  setSavedTalentNames: (names: string[]) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sb] = useState(() => getSb());
  const [profile, setProfile] = useState<FlProfile | null>(null);
  const [notice, setNotice] = useState("");
  const [savedTalentNames, setSavedTalentNames] = useState<string[]>([]);
  const [authOpen, setAuthOpen] = useState<AuthMode>(null);
  const [authRole, setAuthRole] = useState<"talent" | "business">("business");
  const [authName, setAuthName] = useState("");
  const [authCompany, setAuthCompany] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [reqStep, setReqStep] = useState<"form" | "payment">("form");
  const [reqTitle, setReqTitle] = useState("");
  const [reqBrief, setReqBrief] = useState("");
  const [reqTags, setReqTags] = useState("");
  const [reqMin, setReqMin] = useState("10000");
  const [reqMax, setReqMax] = useState("50000");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqId, setReqId] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    const loadProfile = async (userId: string) => {
      const { data, error } = await sb.from("profiles").select("id, name, username, role, company").eq("id", userId).maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[FREELI] profile load failed", error);
        setProfile(null);
        return;
      }
      if (data) setProfile(data as FlProfile);
      else setProfile(null);
    };
    sb.auth.getSession().then(({ data }) => {
      const user = data?.session?.user;
      if (user?.id) loadProfile(user.id);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) loadProfile(session.user.id);
      else {
        setProfile(null);
        setSavedTalentNames([]);
      }
    });
    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [sb]);

  const openAuth = (mode: "login" | "signup", role?: "talent" | "business") => {
    setAuthOpen(mode);
    setAuthError("");
    setAuthInfo("");
    setAuthPassword("");
    if (role) setAuthRole(role);
  };

  const handleSignOut = async () => {
    if (sb) await sb.auth.signOut();
    setProfile(null);
    setSavedTalentNames([]);
    setNotice("你已登出");
  };

  const handleAuthSubmit = async () => {
    if (!sb) { setAuthError("尚未連上資料庫"); return; }
    setAuthBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      if (authOpen === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        setAuthOpen(null);
        setNotice("登入成功");
      } else {
        const name = authName.trim();
        if (!name) throw new Error("請填寫姓名");
        if (!authEmail.trim()) throw new Error("請填寫電子郵件");
        if (authPassword.length < 6) throw new Error("密碼至少 6 個字元");
        const { data, error } = await sb.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              name,
              role: authRole,
              company: authRole === "business" ? authCompany.trim() : "",
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthInfo("註冊成功。請至信箱點擊驗證信後再登入。");
        } else {
          setAuthOpen(null);
          setNotice("註冊成功，已為你登入");
        }
      }
    } catch (err: unknown) {
      setAuthError((err as Error)?.message || "操作失敗，請再試一次");
    } finally {
      setAuthBusy(false);
    }
  };

  const openRequest = (prefill?: { title?: string; brief?: string; tags?: string }) => {
    if (!profile) {
      setNotice("請先登入企業雇主帳號後再送出需求");
      openAuth("login", "business");
      return;
    }
    if (profile.role !== "business") {
      setNotice("需求發布僅限企業雇主帳號。人才帳號無法送出預約需求。");
      return;
    }
    setReqTitle(prefill?.title || "");
    setReqBrief(prefill?.brief || "");
    setReqTags(prefill?.tags || "");
    setReqMin("10000");
    setReqMax("50000");
    setReqError("");
    setReqId(null);
    setReqStep("form");
    setReqOpen(true);
  };

  const handleRequestSubmit = async () => {
    if (!sb || !profile) return;
    setReqBusy(true);
    setReqError("");
    try {
      const title = reqTitle.trim();
      const brief = reqBrief.trim();
      if (title.length < 4 || title.length > 120) throw new Error("需求標題請介於 4 到 120 字");
      if (!brief) throw new Error("請填寫需求簡述");
      const budget_min = Number(reqMin);
      const budget_max = Number(reqMax);
      if (!Number.isFinite(budget_min) || !Number.isFinite(budget_max)) throw new Error("請輸入預算數字");
      if (budget_min < 1000) throw new Error("最低預算需至少 NT$1,000");
      if (budget_max < budget_min) throw new Error("最高預算不可低於最低預算");
      const tags = reqTags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      const { data, error } = await sb.from("requests").insert({
        business_id: profile.id,
        title,
        brief,
        tags,
        budget_min,
        budget_max,
        status: "open",
      }).select("id").single();
      if (error) throw error;
      setReqId(data?.id || null);
      setReqStep("payment");
    } catch (err: unknown) {
      setReqError((err as Error)?.message || "送出失敗，請再試一次");
    } finally {
      setReqBusy(false);
    }
  };

  const value = useMemo<AuthCtx>(() => ({
    sb, profile, notice, setNotice, openAuth, handleSignOut, openRequest, savedTalentNames, setSavedTalentNames,
  }), [sb, profile, notice, savedTalentNames]);

  return (
    <Ctx.Provider value={value}>
      <div className="fl" lang="zh-Hant-TW" style={{ background: C.ivory, color: C.ink, fontFamily: FONT, lineHeight: 1.6, minHeight: "100%" }}>
        <style>{CSS}</style>
        {notice ? (
          <div style={{ background: C.sageMist, color: C.forest, fontSize: 14, textAlign: "center", padding: "10px 16px" }}>
            {notice}　<span className="fl-link" style={{ fontWeight: 600 }} onClick={() => setNotice("")}>關閉</span>
          </div>
        ) : null}
        {children}

        {authOpen ? (
          <div onClick={() => !authBusy && setAuthOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,38,32,.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 24 }}>
            <div role="dialog" aria-labelledby="auth-title" onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 24, padding: 32, width: "min(440px, 100%)", border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(31,61,43,.18)" }}>
              <h3 id="auth-title" style={{ margin: "0 0 20px", fontSize: 24, color: C.ink }}>{authOpen === "login" ? "登入" : "免費註冊"}</h3>
              {authOpen === "signup" ? (
                <>
                  <label style={{ display: "block", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>姓名</div>
                    <input className="fl-input" value={authName} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuthName(e.target.value)} style={inputStyle} />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <button type="button" className="fl-chip" onClick={() => setAuthRole("business")} style={{ border: `1px solid ${authRole === "business" ? C.forest : C.line}`, background: authRole === "business" ? C.forest : C.white, color: authRole === "business" ? C.ivory : C.ink2, borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 500 }}>我是企業雇主</button>
                    <button type="button" className="fl-chip" onClick={() => setAuthRole("talent")} style={{ border: `1px solid ${authRole === "talent" ? C.forest : C.line}`, background: authRole === "talent" ? C.forest : C.white, color: authRole === "talent" ? C.ivory : C.ink2, borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 500 }}>我是專業人才</button>
                  </div>
                  {authRole === "business" ? (
                    <label style={{ display: "block", marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>公司名稱（選填）</div>
                      <input className="fl-input" value={authCompany} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuthCompany(e.target.value)} style={inputStyle} />
                    </label>
                  ) : null}
                </>
              ) : null}
              <label style={{ display: "block", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>電子郵件</div>
                <input className="fl-input" type="email" value={authEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuthEmail(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: "block", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>密碼</div>
                <input className="fl-input" type="password" value={authPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuthPassword(e.target.value)} style={inputStyle} />
              </label>
              {authError ? <div style={{ color: "#B4533C", fontSize: 14, marginBottom: 12 }}>{authError}</div> : null}
              {authInfo ? <div style={{ color: C.forest2, fontSize: 14, marginBottom: 12 }}>{authInfo}</div> : null}
              <button className="fl-btn fl-primary" disabled={authBusy} style={{ ...btn("primary", true), width: "100%" }} onClick={handleAuthSubmit}>{authBusy ? "請稍候…" : (authOpen === "login" ? "登入" : "建立帳號")}</button>
              <div style={{ marginTop: 16, fontSize: 14, textAlign: "center" }}>
                {authOpen === "login" ? (
                  <span className="fl-link" style={{ color: C.forest2, fontWeight: 600 }} onClick={() => { trackEvent("sign_up_click"); setAuthOpen("signup"); setAuthError(""); setAuthInfo(""); }}>還沒有帳號？免費註冊</span>
                ) : (
                  <span className="fl-link" style={{ color: C.forest2, fontWeight: 600 }} onClick={() => { setAuthOpen("login"); setAuthError(""); setAuthInfo(""); }}>已有帳號？改為登入</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {reqOpen ? (
          <div onClick={() => !reqBusy && setReqOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,38,32,.45)", zIndex: 80, display: "grid", placeItems: "center", padding: 24 }}>
            <div role="dialog" aria-labelledby="req-title" onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 24, padding: 32, width: "min(520px, 100%)", border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(31,61,43,.18)", maxHeight: "90vh", overflow: "auto" }}>
              {reqStep === "form" ? (
                <>
                  <h3 id="req-title" style={{ margin: "0 0 20px", fontSize: 24, color: C.ink }}>留下需求</h3>
                  <label style={{ display: "block", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>需求標題</div>
                    <input className="fl-input" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ display: "block", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>需求簡述</div>
                    <textarea className="fl-input" value={reqBrief} onChange={(e) => setReqBrief(e.target.value)} rows={5} style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>標籤（逗號分隔）</div>
                    <input className="fl-input" value={reqTags} onChange={(e) => setReqTags(e.target.value)} style={inputStyle} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>最低預算</div>
                      <input className="fl-input" value={reqMin} onChange={(e) => setReqMin(e.target.value)} style={inputStyle} />
                    </label>
                    <label>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>最高預算</div>
                      <input className="fl-input" value={reqMax} onChange={(e) => setReqMax(e.target.value)} style={inputStyle} />
                    </label>
                  </div>
                  {reqError ? <div style={{ color: "#B4533C", fontSize: 14, margin: "12px 0" }}>{reqError}</div> : null}
                  <button className="fl-btn fl-primary" disabled={reqBusy} style={{ ...btn("primary", true), width: "100%", marginTop: 16 }} onClick={handleRequestSubmit}>{reqBusy ? "送出中…" : "送出需求"}</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 8 }}>需求已送出</div>
                  <h3 id="req-title" style={{ margin: "0 0 16px", fontSize: 24, color: C.ink }}>我們已收到你的需求</h3>
                  <p style={{ margin: "0 0 24px", fontSize: 15, color: C.ink2, lineHeight: 1.7 }}>顧問會依你的說明進行配對。付款功能尚未開放，目前不會向你收費。</p>
                  <div style={{ border: `1px dashed ${C.sage}`, borderRadius: 18, padding: "20px 22px", background: C.ivory, marginBottom: 20 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>付款（即將開放）</div>
                    <div style={{ fontSize: 14, color: C.ink3, marginTop: 6, marginBottom: 14 }}>台灣金流（綠界 / 藍新等）稍後接入，這一階段不會出現信用卡欄位。</div>
                    <button type="button" className="fl-btn fl-ghost" disabled aria-disabled="true" style={{ ...btn("ghost"), opacity: 0.55, cursor: "not-allowed" }} onClick={() => { void startPayment(reqId || undefined); }}>付款（即將開放）</button>
                  </div>
                  <button className="fl-btn fl-primary" style={{ ...btn("primary", true), width: "100%" }} onClick={() => setReqOpen(false)}>完成</button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

const inputStyle = {
  width: "100%" as const,
  border: `1px solid ${C.line}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 15,
  color: C.ink,
  background: C.white,
  fontFamily: "inherit",
};

export function SiteHeader({ extraNav }: { extraNav?: { label: string; on: () => void }[] }) {
  const { profile, openAuth, handleSignOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);

  const navItems = [
    { label: "探索服務", on: () => { setMenu(false); navigate("/services"); } },
    { label: "尋找人才", on: () => { setMenu(false); navigate("/#talent"); } },
    { label: "成為人才", on: () => { setMenu(false); navigate("/#join"); } },
    ...(profile ? [{ label: "工作台", on: () => { setMenu(false); navigate("/dashboard"); } }] : []),
    ...(extraNav || []),
  ];

  const linkFor = (label: string) => label === "探索服務" ? "/services" : label === "尋找人才" ? "/#talent" : label === "成為人才" ? "/#join" : label === "工作台" ? "/dashboard" : null;

  return (
    <header style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(250,246,238,.96)", position: "sticky", top: 0, zIndex: 40 }}>
      <nav aria-label="主要" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 76, flexWrap: "wrap" }}>
        <Link to="/" aria-label="Freeli 首頁" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Leaf />
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: ".14em", color: C.forest }}>FREELI</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="fl-navlinks" style={{ display: "flex", alignItems: "center", gap: 34 }}>
            {navItems.map((n) => {
              const href = linkFor(n.label);
              const style = { fontSize: 15, color: location.pathname.startsWith("/services") && n.label === "探索服務" ? C.forest : C.ink2, fontWeight: 500, textDecoration: "none" as const };
              return href ? (
                <Link key={n.label} to={href} className="fl-link" style={style} onClick={() => { setMenu(false); n.on(); }}>{n.label}</Link>
              ) : (
                <span key={n.label} className="fl-link" onClick={n.on} style={style}>{n.label}</span>
              );
            })}
          </div>
          {profile ? (
            <>
              <span className="fl-hide-sm" style={{ fontSize: 14, color: C.ink2, fontWeight: 500 }}>{profile.name}{profile.role === "business" ? "・企業" : "・人才"}</span>
              <button className="fl-btn fl-ghost" style={{ ...btn("ghost"), border: "none" }} onClick={() => { setMenu(false); void handleSignOut(); }}>登出</button>
            </>
          ) : (
            <>
              <button className="fl-btn fl-ghost fl-hide-sm" style={{ ...btn("ghost"), border: "none" }} onClick={() => openAuth("login")}>登入</button>
              <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => { trackEvent("sign_up_click"); openAuth("signup", "business"); }}>免費註冊</button>
            </>
          )}
          <button className="fl-btn fl-ghost fl-menu-btn" aria-label="選單" style={{ ...btn("ghost"), padding: 10, border: `1px solid ${C.line}` }} onClick={() => setMenu(!menu)}><Icon name="menu" /></button>
        </div>
      </nav>
      {menu ? (
        <div style={{ ...wrap, paddingBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map((n) => {
            const href = linkFor(n.label);
            const style = { padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink, textDecoration: "none" as const };
            return href ? (
              <Link key={n.label} to={href} className="fl-link" style={style} onClick={() => { setMenu(false); n.on(); }}>{n.label}</Link>
            ) : (
              <span key={n.label} className="fl-link" onClick={n.on} style={style}>{n.label}</span>
            );
          })}
          {profile ? (
            <span className="fl-link" onClick={() => { setMenu(false); void handleSignOut(); }} style={{ padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink }}>登出（{profile.name}）</span>
          ) : (
            <span className="fl-link" onClick={() => { setMenu(false); openAuth("login"); }} style={{ padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 16, color: C.ink }}>登入</span>
          )}
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  const cols: { h: string; l: { label: string; href?: string }[] }[] = [
    {
      h: "探索服務",
      l: ["行銷公關", "品牌設計", "B2B 業務開發", "網站與數位開發"].map((label) => ({ label, href: `/services?category=${encodeURIComponent(label)}` })),
    },
    { h: "關於 FREELI", l: [{ label: "我們的承諾" }, { label: "人才認證" }, { label: "企業合作" }] },
    { h: "幫助", l: [{ label: "常見問題", href: "/faq" }, { label: "合作保障", href: "/faq" }, { label: "聯繫我們" }] },
  ];
  return (
    <footer style={{ borderTop: `1px solid ${C.line}`, background: C.ivory2, padding: "48px 0 28px" }}>
      <div style={{ ...wrap, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 32 }}>
        <div>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, textDecoration: "none" }}>
            <Leaf size={28} />
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: ".14em", color: C.forest }}>FREELI</span>
          </Link>
          <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.7, maxWidth: 260 }}>專業不設限，工作有選擇。</p>
        </div>
        {cols.map((col) => (
          <div key={col.h}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{col.h}</div>
            {col.l.map((item) => item.href ? (
              <Link key={item.label} to={item.href} className="fl-link" style={{ display: "block", fontSize: 14, color: C.ink2, padding: "4px 0", textDecoration: "none" }}>{item.label}</Link>
            ) : (
              <div key={item.label} style={{ fontSize: 14, color: C.ink2, padding: "4px 0" }}>{item.label}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ ...wrap, marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 13, color: C.ink3 }}>© FREELI</div>
    </footer>
  );
}
