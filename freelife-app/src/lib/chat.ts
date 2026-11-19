import { getSb, rpcMessage } from "./supabase";
import { missingSchema } from "./text";

const inflight = new Map<string, Promise<string>>();

export async function ensureConversation(input: {
  businessId: string;
  talentId: string;
  subject: string;
  requestId?: string | null;
}): Promise<string> {
  const key = `${input.businessId}:${input.talentId}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = openConversation(input).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function openConversation(input: {
  businessId: string;
  talentId: string;
  subject: string;
  requestId?: string | null;
}): Promise<string> {
  const sb = getSb();
  if (!sb) throw new Error("尚未連上資料庫");
  const subject = input.subject.trim().slice(0, 120) || "合作洽詢";
  const { data, error } = await sb.rpc("ensure_conversation", {
    p_business_id: input.businessId,
    p_talent_id: input.talentId,
    p_subject: subject,
    p_request_id: input.requestId || null,
  });
  if (!error && data) return String(data);
  if (error && !missingSchema(error, "ensure_conversation")) throw new Error(rpcMessage(error));

  const { data: existing, error: selectError } = await sb
    .from("conversations")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("talent_id", input.talentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(rpcMessage(selectError));
  if (existing?.id) return String(existing.id);

  const withRequest = {
    business_id: input.businessId,
    talent_id: input.talentId,
    subject,
    request_id: input.requestId || null,
  };
  let inserted = await sb.from("conversations").insert(withRequest).select("id").single();
  if (inserted.error && missingSchema(inserted.error, "request_id")) {
    inserted = await sb.from("conversations").insert({
      business_id: input.businessId,
      talent_id: input.talentId,
      subject,
    }).select("id").single();
  }
  if (inserted.error) throw new Error(rpcMessage(inserted.error));
  return String(inserted.data.id);
}
