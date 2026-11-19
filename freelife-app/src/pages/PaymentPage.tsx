import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import type { ContractDraft, ContractMilestone } from "../lib/contractDraft";
import { confirmTestPayment, startHostedCheckout, type CheckoutSnapshot } from "../lib/payment";
import { getSb, rpcMessage } from "../lib/supabase";
import { C, btn, card, fmt, wrap } from "../lib/theme";
import { UUID_RE, firstOf } from "../lib/text";

export type PaymentSummary = {
  contractId: string;
  title: string;
  scope: string;
  client: string;
  talent: string;
  price: number;
  agreed: boolean;
  businessId: string;
  milestones: ContractMilestone[];
};

type PreviewState = {
  summary?: PaymentSummary;
};

export default function PaymentPage() {
  const { contractId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { sb, profile, openAuth } = useAuth();
  const preview = (location.state || {}) as PreviewState;
  const [summary, setSummary] = useState<PaymentSummary | null | undefined>(contractId === "preview" ? preview.summary || null : undefined);
  const [choice, setChoice] = useState<string>("all");
  const [payment, setPayment] = useState<CheckoutSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.title = "付款（測試模式）｜FREELI";
  }, []);

  useEffect(() => {
    if (contractId === "preview") {
      setSummary(preview.summary || null);
      return;
    }
    if (!UUID_RE.test(contractId)) {
      setSummary(null);
      setError("找不到這筆付款");
      return;
    }
    const client = sb || getSb();
    if (!client || !profile) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await client.from("contracts").select("id, title, scope, price, status, business_agreed_at, talent_agreed_at, milestones, business_id, talent_id").eq("id", contractId).maybeSingle();
      if (cancelled) return;
      if (loadError || !data) {
        setError(loadError ? rpcMessage(loadError) : "找不到這份合約，或你不是當事人。");
        setSummary(null);
        return;
      }
      const row = data as Record<string, unknown>;
      const [business, talent] = await Promise.all([
        client.from("profiles").select("name, company").eq("id", String(row.business_id)).maybeSingle(),
        client.from("profiles").select("name, company").eq("id", String(row.talent_id)).maybeSingle(),
      ]);
      if (cancelled) return;
      const businessProfile = firstOf(business.data as { name?: string; company?: string } | null);
      const talentProfile = firstOf(talent.data as { name?: string; company?: string } | null);
      const milestones = asMilestones(row.milestones);
      setSummary({
        contractId,
        businessId: String(row.business_id || ""),
        title: String(row.title || "合約"),
        scope: String(row.scope || ""),
        client: [businessProfile?.company, businessProfile?.name].filter(Boolean).join("・") || "委託方",
        talent: talentProfile?.name || "受託方",
        price: Number(row.price || 0),
        agreed: row.status === "agreed" && !!row.business_agreed_at && !!row.talent_agreed_at,
        milestones,
      });
      const { data: payments } = await client.from("payments").select("id, status, amount, currency, provider, milestone_index").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(1);
      const latest = (payments || [])[0] as CheckoutSnapshot | undefined;
      if (latest) setPayment(latest);
    })();
    return () => { cancelled = true; };
  }, [contractId, profile?.id, sb]);

  const selectedAmount = summary
    ? choice === "all"
      ? summary.price
      : summary.milestones[Number(choice)]?.amount || 0
    : 0;
  const isClient = !!summary && !!profile && profile.id === summary.businessId;
  const canPay = !!summary && summary.agreed && isClient && contractId !== "preview" && selectedAmount > 0;

  const pay = async () => {
    if (!summary) return;
    if (!profile || !sb) {
      openAuth("login", "business");
      return;
    }
    if (contractId === "preview" || !summary.contractId) {
      setNotice("請先在對話中儲存合約，並等雙方同意後再付款。");
      return;
    }
    if (summary && !summary.agreed) {
      setNotice("雙方都同意合約後才能付款。");
      return;
    }
    setBusy(true);
    setNotice("");
    const started = await startHostedCheckout(sb, {
      contractId: summary.contractId,
      milestoneIndex: choice === "all" ? null : Number(choice),
    });
    if (!started.ok) {
      setNotice(started.message);
      setBusy(false);
      return;
    }
    if (started.mode === "redirect") {
      window.location.assign(started.url);
      return;
    }
    setPayment(started.payment);
    if (started.payment.status === "test_paid") {
      setNotice("這筆測試付款先前已完成，沒有再次扣款。");
      setBusy(false);
      return;
    }
    const confirmed = await confirmTestPayment(sb, started.payment.id);
    setBusy(false);
    if (!confirmed.ok) {
      setNotice(confirmed.message);
      return;
    }
    if (confirmed.mode === "test") setPayment(confirmed.payment);
    setNotice("已記錄測試付款。沒有向綠界或 TapPay 請款，也沒有收集卡號。");
  };

  return (
    <>
      <SiteHeader />
      <div style={{ ...wrap, paddingTop: 36, paddingBottom: 88, maxWidth: 860 }}>
        <div style={{ background: C.goldLight, color: "#7A5F2E", borderRadius: 18, padding: "14px 18px", fontWeight: 700, marginBottom: 18 }}>
          測試模式・不會扣款
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 34, color: C.ink }}>付款</h1>
        <p style={{ color: C.ink2, marginTop: 0 }}>
          此頁只顯示訂單摘要。信用卡號不會經過 Freeli。正式環境會導向綠界（ECPay）或 TapPay 的托管付款頁，並由伺服器驗證金流商回傳後才入帳。
        </p>
        {!profile && contractId !== "preview" ? (
          <div style={{ ...card, padding: 28 }}>
            <p style={{ color: C.ink2 }}>請先登入以查看你的合約付款。</p>
            <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => openAuth("login", "business")}>登入</button>
          </div>
        ) : null}
        {summary === undefined ? <p style={{ color: C.ink3 }}>載入訂單中…</p> : null}
        {summary === null ? (
          <div style={{ ...card, padding: 28, color: C.ink2 }}>
            {error || "這份結帳沒有帶入合約。請從對話中的合約重新進入。"}
          </div>
        ) : null}
        {summary ? (
          <div className="fl-gig" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(240px, 0.8fr)", gap: 20 }}>
            <div style={{ ...card, padding: 24 }}>
              <div style={{ fontSize: 13, color: C.forest2, fontWeight: 700, marginBottom: 8 }}>訂單摘要</div>
              <h2 style={{ margin: "0 0 12px", fontSize: 24 }}>{summary.title}</h2>
              <Row label="委託方" value={summary.client} />
              <Row label="受託方" value={summary.talent} />
              <Row label="合約狀態" value={summary.agreed ? "雙方已同意" : "尚未雙方同意"} />
              <p style={{ color: C.ink2, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{summary.scope}</p>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>付款項目</div>
              <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input type="radio" checked={choice === "all"} onChange={() => setChoice("all")} />
                整筆合約・{fmt(summary.price)}
              </label>
              {summary.milestones.map((milestone, index) => (
                <label key={`${milestone.title}-${index}`} style={{ display: "flex", gap: 8, marginBottom: 8, color: C.ink2 }}>
                  <input type="radio" checked={choice === String(index)} onChange={() => setChoice(String(index))} />
                  {milestone.title}・{fmt(milestone.amount)}{milestone.due_on ? `・${milestone.due_on}` : ""}
                </label>
              ))}
              {!summary.milestones.length ? <p style={{ color: C.ink3 }}>這份合約沒有拆分里程碑。</p> : null}
            </div>
            <div style={{ ...card, padding: 24 }}>
              <div style={{ fontSize: 14, color: C.ink3 }}>本次付款</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.forest }}>{fmt(selectedAmount)}</div>
              <div style={{ fontSize: 13, color: C.ink3, margin: "8px 0 18px" }}>幣別 TWD・測試金流</div>
              {payment ? <p style={{ color: C.forest }}>付款狀態：{payment.status === "test_paid" ? "測試付款已記錄" : payment.status === "test_pending" ? "測試付款待完成" : payment.status}</p> : null}
              {notice ? <p style={{ color: C.ink2 }}>{notice}</p> : null}
              {!summary.agreed ? <p style={{ color: C.ink2 }}>雙方同意合約後，委託方才能按下付款。</p> : null}
              {contractId === "preview" ? <p style={{ color: C.ink2 }}>這是尚未儲存的草稿預覽，不會建立付款。</p> : null}
              <button className="fl-btn fl-primary" disabled={busy || (!canPay && contractId !== "preview")} style={{ ...btn("primary", true), width: "100%" }} onClick={() => void pay()}>
                {busy ? "處理中…" : "以測試模式完成付款"}
              </button>
              {!isClient && summary.businessId && profile ? <p style={{ color: C.ink2 }}>這筆款項由委託方付款。你可以在這裡核對金額。</p> : null}
              <p style={{ fontSize: 13, color: C.ink3, lineHeight: 1.7 }}>
                按鈕不會跳出卡號欄位。日後接入時，只改 src/lib/payment.ts 的付款掛點，改為導向金流商托管頁。
              </p>
              <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={() => navigate(-1)}>返回</button>
            </div>
          </div>
        ) : null}
      </div>
      <SiteFooter />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ color: C.ink3 }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function asMilestones(value: unknown): ContractMilestone[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      title: String(row.title || "里程碑"),
      deliverable: String(row.deliverable || ""),
      amount: Number(row.amount || 0),
      due_on: String(row.due_on || ""),
    };
  });
}

export function summaryFromDraft(draft: ContractDraft, client: string, talent: string): PaymentSummary {
  return {
    contractId: "",
    businessId: "",
    title: draft.title,
    scope: draft.scope,
    client,
    talent,
    price: draft.price,
    agreed: false,
    milestones: draft.milestones,
  };
}
