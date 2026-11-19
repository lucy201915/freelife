import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SiteFooter, SiteHeader, useAuth } from "../lib/auth";
import { ensureConversation } from "../lib/chat";
import { generateContractDraft, type ContractDraft, type ContractMilestone } from "../lib/contractDraft";
import { getSb, rpcMessage } from "../lib/supabase";
import { C, btn, capsule, fmt, pageWrap, panel } from "../lib/theme";
import { UUID_RE, asStringList, firstOf, formatWhen, missingSchema } from "../lib/text";
import { Badge } from "../components/ui";
import { summaryFromDraft } from "./PaymentPage";

type Conv = {
  id: string;
  subject: string;
  business_id: string;
  talent_id: string;
  request_id: string | null;
};

type Msg = { id: string; body: string; sender_id: string; created_at: string };

type SavedContract = {
  id: string;
  title: string;
  scope: string;
  deliverables: unknown;
  price: number;
  start_on: string | null;
  end_on: string | null;
  milestones: unknown;
  status: string;
  source: string;
  business_agreed_at: string | null;
  talent_agreed_at: string | null;
  business_id: string;
  talent_id: string;
};

type RequestContext = {
  id: string;
  title: string;
  brief: string;
  tags: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string;
  businessId: string;
  clientName: string;
  clientCompany: string;
};

export default function ConversationPage() {
  const { conversationId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { sb, profile, openAuth, setNotice } = useAuth();
  const isNew = conversationId === "new";
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [contracts, setContracts] = useState<SavedContract[]>([]);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [request, setRequest] = useState<RequestContext | null>(null);
  const [talentName, setTalentName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const requestId = params.get("request") || "";
  const talentKey = params.get("talent") || "";
  const needsContext = Boolean(requestId || talentKey);
  const [contextReady, setContextReady] = useState(!needsContext);

  useEffect(() => {
    document.title = "對話與合約｜FREELI";
  }, []);

  useEffect(() => {
    const client = getSb();
    if (!client) {
      setContextReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      if (requestId) {
        const loaded = await loadRequest(requestId);
        if (!cancelled && loaded) {
          setRequest(loaded);
          setClientName(loaded.clientName);
          setClientCompany(loaded.clientCompany);
        }
      }
      if (talentKey) {
        const person = await loadTalentName(talentKey);
        if (!cancelled && person) setTalentName(person.name);
      }
      if (!cancelled) setContextReady(true);
    })();
    return () => { cancelled = true; };
  }, [requestId, talentKey]);

  useEffect(() => {
    if (!isNew || !profile || !sb) return;
    let cancelled = false;
    setOpening(true);
    (async () => {
      try {
        const req = requestId ? await loadRequest(requestId) : request;
        const talent = talentKey ? await loadTalentName(talentKey) : null;
        const businessId = profile.role === "business" ? profile.id : req?.businessId || "";
        const talentId = profile.role === "talent" ? profile.id : talent?.id || "";
        if (!businessId || !talentId || businessId === talentId) {
          if (!cancelled) setError("請從人才檔案或專案頁進入，才能開始這段對話。");
          return;
        }
        if (profile.role === "business" && profile.id !== businessId) {
          if (!cancelled) setError("請使用這位委託方的帳號，或改由人才主動聯絡。");
          return;
        }
        const id = await ensureConversation({
          businessId,
          talentId,
          subject: req?.title || (talent ? `與${talent.name}的合作洽詢` : "合作洽詢"),
          requestId: req?.id || null,
        });
        if (!cancelled) navigate(`/messages/${id}`, { replace: true });
      } catch (err) {
        if (!cancelled) setError(rpcMessage(err));
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, profile?.id, sb, requestId, talentKey]);

  useEffect(() => {
    if (isNew || !sb || !profile || !UUID_RE.test(conversationId)) return;
    let cancelled = false;
    (async () => {
      let res = await sb.from("conversations").select("id, subject, business_id, talent_id, request_id").eq("id", conversationId).maybeSingle();
      if (res.error && missingSchema(res.error, "request_id")) {
        res = await sb.from("conversations").select("id, subject, business_id, talent_id").eq("id", conversationId).maybeSingle();
      }
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error ? rpcMessage(res.error) : "找不到這段對話，或你不是參與者。");
        setConv(null);
        return;
      }
      const row = res.data as Conv;
      const next = { ...row, request_id: row.request_id || null };
      setConv(next);
      const [messages, people, saved] = await Promise.all([
        sb.from("messages").select("id, body, sender_id, created_at").eq("conversation_id", next.id).order("created_at"),
        sb.from("profiles").select("id, name, company, role").in("id", [next.business_id, next.talent_id]),
        sb.from("contracts").select("*").eq("conversation_id", next.id).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setMsgs((messages.data || []) as Msg[]);
      for (const person of (people.data || []) as { id: string; name: string; company: string; role: string }[]) {
        if (person.id === next.business_id) {
          setClientName(person.name);
          setClientCompany(person.company || "");
        }
        if (person.id === next.talent_id) setTalentName(person.name);
      }
      if (saved.error && missingSchema(saved.error, "contracts")) setContracts([]);
      else setContracts((saved.data || []) as SavedContract[]);
      const linked = next.request_id || requestId;
      if (linked) {
        const loaded = await loadRequest(linked);
        if (!cancelled && loaded) setRequest(loaded);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, isNew, profile?.id, sb]);

  useEffect(() => {
    if (!sb || isNew || !UUID_RE.test(conversationId)) return;
    const channel = sb.channel(`messages:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = payload.new as Msg;
        setMsgs((prev) => prev.some((item) => item.id === row.id) ? prev : [...prev, row]);
      })
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [sb, conversationId, isNew]);

  const send = async () => {
    if (!sb || !profile || !conv) return;
    const text = body.trim();
    if (!text || text.length > 2000) {
      setNotice("訊息請介於 1 到 2000 字");
      return;
    }
    const { error: insertError } = await sb.from("messages").insert({ conversation_id: conv.id, body: text, sender_id: profile.id });
    if (insertError) {
      setNotice(insertError.message);
      return;
    }
    setBody("");
    const { data } = await sb.from("messages").select("id, body, sender_id, created_at").eq("conversation_id", conv.id).order("created_at");
    setMsgs((data || []) as Msg[]);
  };

  const latest = contracts[0] || null;
  const locked = !!latest && !!latest.business_agreed_at && !!latest.talent_agreed_at;

  const makeDraft = async () => {
    setBusy(true);
    setDraftNote("");
    try {
      const req = request || (requestId ? await loadRequest(requestId) : null);
      if (req && req !== request) {
        setRequest(req);
        setClientName(req.clientName);
        setClientCompany(req.clientCompany);
      }
      const namedTalent = talentName || (talentKey ? (await loadTalentName(talentKey))?.name || "" : "");
      if (namedTalent && namedTalent !== talentName) setTalentName(namedTalent);
      const generated = await generateContractDraft({
        projectTitle: req?.title || conv?.subject || "合作合約",
        clientName: req?.clientName || clientName || "委託方",
        clientCompany: req?.clientCompany || clientCompany,
        talentName: namedTalent || "受託方",
        description: req?.brief || "",
        skills: req?.tags || [],
        budgetMin: req?.budgetMin,
        budgetMax: req?.budgetMax,
        timeline: req?.timeline || "",
      });
      setDraft(generated);
      if (!generated.price) setDraftNote("預算尚未填寫，草稿金額為 0。可先在對話中確認價格。");
      if (!sb || !profile || !conv) {
        setDraftNote("目前沒有接入 AI，已用範本產生預覽。登入並進入對話後才會儲存。");
        return;
      }
      if (locked) {
        setDraftNote("這份合約雙方已同意，不能再覆蓋。");
        return;
      }
      const { data, error: insertError } = await sb.from("contracts").insert({
        conversation_id: conv.id,
        request_id: request?.id || conv.request_id,
        business_id: conv.business_id,
        talent_id: conv.talent_id,
        title: generated.title,
        scope: generated.scope,
        deliverables: generated.deliverables,
        price: generated.price,
        currency: "TWD",
        start_on: generated.start_on,
        end_on: generated.end_on,
        milestones: generated.milestones,
        status: "proposed",
        source: "template",
        created_by: profile.id,
      }).select("*").single();
      if (insertError) {
        setDraftNote(missingSchema(insertError, "contracts")
          ? "草稿已用範本產生，但合約資料表尚未建立。請先套用 migration 後再儲存。"
          : rpcMessage(insertError));
        return;
      }
      setContracts((prev) => [data as SavedContract, ...prev]);
      setDraftNote("已用範本產生並儲存。AI 供應商之後可接到 src/lib/contractDraft.ts 的 AI_PROVIDER_HOOK，不需把金鑰放進前端。");
    } catch (err) {
      setDraftNote(rpcMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const agree = async () => {
    if (!sb || !profile || !latest) return;
    const patch = profile.id === latest.business_id
      ? { business_agreed_at: new Date().toISOString(), status: "proposed" }
      : { talent_agreed_at: new Date().toISOString(), status: "proposed" };
    const { data, error: updateError } = await sb.from("contracts").update(patch).eq("id", latest.id).select("*").single();
    if (updateError) {
      setDraftNote(rpcMessage(updateError));
      return;
    }
    setContracts((prev) => prev.map((item) => item.id === latest.id ? data as SavedContract : item));
    setNotice("已記錄你的同意");
  };

  const openPay = () => {
    if (latest) {
      navigate(`/pay/${latest.id}`);
      return;
    }
    if (!draft) {
      setDraftNote("請先產生合約草稿，再進入測試付款。");
      return;
    }
    navigate("/pay/preview", {
      state: {
        summary: summaryFromDraft(
          draft,
          [clientCompany, clientName].filter(Boolean).join("・") || "委託方",
          talentName || "受託方",
        ),
      },
    });
  };

  const shown = latest ? contractFromSaved(latest) : draft;
  const viewerAgreed = !!latest && !!profile && (profile.id === latest.business_id ? !!latest.business_agreed_at : !!latest.talent_agreed_at);

  return (
    <>
      <SiteHeader />
      <div style={pageWrap}>
        <div style={{ fontSize: 14, color: C.ink3, marginBottom: 28 }}>
          <span className="fl-link" onClick={() => navigate(profile ? "/dashboard" : "/projects")}>{profile ? "工作台" : "找專案"}</span>
          <span> ／ 對話與合約</span>
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ ...capsule, marginBottom: 16 }}>
            <Badge>對話</Badge>
            <span>{[clientCompany, clientName].filter(Boolean).join("・") || "委託方"}・{talentName || "受託方"}</span>
          </div>
          <h1 className="fl-h2" style={{ margin: 0, fontWeight: 800, color: C.ink }}>{conv?.subject || request?.title || "對話"}</h1>
        </div>
        {error ? <div style={{ ...panel, padding: 20, marginBottom: 20, color: "#B4533C" }}>{error}</div> : null}
        {opening ? <p style={{ color: C.ink3, marginBottom: 16 }}>正在開啟對話…</p> : null}
        {!profile && isNew ? (
          <div style={{ ...panel, padding: "16px 20px", marginBottom: 22, background: C.sageMist, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ color: C.ink2, fontSize: 15, lineHeight: 1.7 }}>你還沒有登入。可以先預覽合約草稿；登入後才能傳送訊息、儲存合約與表示同意。</span>
            <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => openAuth("login")}>登入</button>
          </div>
        ) : null}
        <div className="fl-gig" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(300px, 0.85fr)", gap: 24, alignItems: "start" }}>
          <div style={{ ...panel, padding: 22, minHeight: 480, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {!conv && isNew ? <div style={{ color: C.ink3 }}>登入後，這裡會顯示你與對方的訊息。</div> : null}
              {conv && !msgs.length ? <div style={{ color: C.ink3 }}>這段對話還沒有訊息，先打個招呼吧。</div> : null}
              {msgs.map((message) => {
                const mine = message.sender_id === profile?.id;
                return (
                  <div key={message.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", background: mine ? C.forest : C.ivory2, color: mine ? C.ivory : C.ink, borderRadius: 16, padding: "10px 14px" }}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.body}</div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{formatWhen(message.created_at)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input className="fl-input" value={body} disabled={!conv} placeholder={conv ? "輸入訊息" : "登入並進入對話後即可傳送"} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void send(); }} style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", fontSize: 15 }} />
              <button className="fl-btn fl-primary" disabled={!conv} style={btn("primary")} onClick={() => void send()}>送出</button>
            </div>
          </div>
          <div style={{ ...panel, padding: 26 }}>
            <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 12 }}>合約</div>
            <h2 className="fl-h2" style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 700, color: C.ink }}>合作草稿</h2>
            {contracts.length > 1 ? <p style={{ color: C.ink3, fontSize: 13 }}>這段對話有 {contracts.length} 份草稿，以下是最新一份。</p> : null}
            {latest ? (
              <p style={{ color: C.ink2 }}>
                委託方{latest.business_agreed_at ? "已同意" : "尚未同意"}・受託方{latest.talent_agreed_at ? "已同意" : "尚未同意"}
              </p>
            ) : <p style={{ color: C.ink3 }}>還沒有儲存的合約。可依這個專案產生一份範本草稿。</p>}
            <button className="fl-btn fl-primary" disabled={busy || locked || !contextReady} style={{ ...btn("primary"), width: "100%", marginBottom: 10 }} onClick={() => void makeDraft()}>
              {busy ? "產生中…" : contextReady ? "AI 產生合約草稿" : "讀取專案中…"}
            </button>
            {draftNote ? <p style={{ color: C.ink2, fontSize: 14 }}>{draftNote}</p> : null}
            {shown ? <ContractView draft={shown} sourceLabel={latest?.source === "ai" ? "AI 草稿" : "範本草稿"} /> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {latest && profile ? (
                <button className="fl-btn fl-ghost" disabled={viewerAgreed || locked} style={btn("ghost")} onClick={() => void agree()}>
                  {viewerAgreed ? "你已同意這份合約" : "我同意這份合約"}
                </button>
              ) : null}
              <button className="fl-btn fl-ghost" style={btn("ghost")} onClick={openPay}>前往付款（測試模式）</button>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function ContractView({ draft, sourceLabel }: { draft: ContractDraft; sourceLabel: string }) {
  return (
    <div style={{ background: C.ivory, borderRadius: 18, padding: 18, border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 12, color: C.forest2, fontWeight: 700 }}>{sourceLabel}</div>
      <div style={{ fontWeight: 800, fontSize: 18, margin: "6px 0" }}>{draft.title}</div>
      <div style={{ color: C.forest, fontWeight: 800, fontSize: 22 }}>{fmt(draft.price)}</div>
      <div style={{ fontSize: 13, color: C.ink3, marginBottom: 8 }}>{draft.start_on} – {draft.end_on}</div>
      <p style={{ whiteSpace: "pre-wrap", color: C.ink2, fontSize: 14, lineHeight: 1.7 }}>{draft.scope}</p>
      <div style={{ fontWeight: 700, fontSize: 14 }}>交付項目</div>
      <ul style={{ marginTop: 6, color: C.ink2, paddingLeft: 18 }}>
        {draft.deliverables.length ? draft.deliverables.map((item) => <li key={item}>{item}</li>) : <li>尚未列出交付項目</li>}
      </ul>
      <div style={{ fontWeight: 700, fontSize: 14 }}>里程碑</div>
      {draft.milestones.length ? draft.milestones.map((milestone) => (
        <div key={`${milestone.title}${milestone.due_on}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, color: C.ink2, padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
          <span>{milestone.title}{milestone.due_on ? `・${milestone.due_on}` : ""}</span>
          <b>{fmt(milestone.amount)}</b>
        </div>
      )) : <p style={{ color: C.ink3 }}>尚未設定里程碑。</p>}
    </div>
  );
}

function contractFromSaved(row: SavedContract): ContractDraft {
  return {
    title: row.title,
    scope: row.scope,
    deliverables: asStringList(row.deliverables),
    price: Number(row.price || 0),
    currency: "TWD",
    start_on: row.start_on || "",
    end_on: row.end_on || "",
    milestones: asMilestones(row.milestones),
    source: row.source === "ai" ? "ai" : "template",
  };
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

async function loadRequest(id: string): Promise<RequestContext | null> {
  const sb = getSb();
  if (!sb || !UUID_RE.test(id)) return null;
  let res = await sb.from("requests").select("id, business_id, title, brief, tags, budget_min, budget_max, timeline, profiles!requests_business_id_fkey(name, company)").eq("id", id).maybeSingle();
  if (res.error && /timeline/i.test(res.error.message)) {
    res = await sb.from("requests").select("id, business_id, title, brief, tags, budget_min, budget_max, profiles!requests_business_id_fkey(name, company)").eq("id", id).maybeSingle();
  }
  if (res.error || !res.data) return null;
  const row = res.data as Record<string, unknown>;
  const client = firstOf(row.profiles as { name?: string; company?: string } | { name?: string; company?: string }[] | null);
  return {
    id: String(row.id),
    title: String(row.title || ""),
    brief: String(row.brief || ""),
    tags: asStringList(row.tags),
    budgetMin: row.budget_min == null ? null : Number(row.budget_min),
    budgetMax: row.budget_max == null ? null : Number(row.budget_max),
    timeline: String(row.timeline || ""),
    businessId: String(row.business_id || ""),
    clientName: String(client?.name || ""),
    clientCompany: String(client?.company || ""),
  };
}

async function loadTalentName(id: string): Promise<{ id: string; name: string } | null> {
  const sb = getSb();
  if (!sb) return null;
  if (UUID_RE.test(id)) {
    const { data } = await sb.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
    if (!data || data.role !== "talent") return null;
    return { id: data.id, name: data.name };
  }
  const { data } = await sb.from("profiles").select("id, name, role").eq("username", id).maybeSingle();
  if (!data || data.role !== "talent") return null;
  return { id: data.id, name: data.name };
}
