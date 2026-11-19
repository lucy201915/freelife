import { taipeiDate } from "./text";

export type ContractMilestone = {
  title: string;
  deliverable: string;
  amount: number;
  due_on: string;
};

export type ContractDraft = {
  title: string;
  scope: string;
  deliverables: string[];
  price: number;
  currency: "TWD";
  start_on: string;
  end_on: string;
  milestones: ContractMilestone[];
  source: "template" | "ai";
};

export type ContractDraftInput = {
  projectTitle?: string;
  clientName?: string;
  clientCompany?: string;
  talentName?: string;
  description?: string;
  skills?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeline?: string;
};

/**
 * AI_PROVIDER_HOOK
 * This is the only function that should talk to an AI provider.
 * Do not add API keys, tokens, or a provider SDK in this file or in Vite env.
 * When a provider is chosen, replace the body with a call to a Supabase Edge
 * Function that holds the key and returns a ContractDraft. Example:
 *
 *   const { data, error } = await supabase.functions.invoke("contract-draft", { body: input });
 *   if (error) throw error;
 *   return data as ContractDraft;
 *
 * Until that function exists, drafts are built from the template below.
 */
export async function generateContractDraft(input: ContractDraftInput): Promise<ContractDraft> {
  return buildTemplateDraft(input);
}

function agreedPrice(min: number | null | undefined, max: number | null | undefined): number {
  const low = Number(min);
  const high = Number(max);
  const hasLow = Number.isFinite(low) && low > 0;
  const hasHigh = Number.isFinite(high) && high > 0;
  if (hasLow && hasHigh) return Math.round((Math.min(low, high) + Math.max(low, high)) / 2);
  if (hasHigh) return Math.round(high);
  if (hasLow) return Math.round(low);
  return 0;
}

export function buildTemplateDraft(input: ContractDraftInput): ContractDraft {
  const client = [input.clientCompany, input.clientName].filter(Boolean).join("・") || "委託方";
  const talent = input.talentName || "受託方";
  const title = (input.projectTitle || `${talent}合作合約`).trim().slice(0, 120);
  const skills = (input.skills || []).map((skill) => skill.trim()).filter(Boolean);
  const price = agreedPrice(input.budgetMin, input.budgetMax);
  const start = taipeiDate(0);
  const end = taipeiDate(30);
  const deliverables = skills.length
    ? skills.map((skill) => `完成與「${skill}」相關、並經甲方確認的交付`)
    : ["依合作範圍完成約定交付", "依驗收意見提供一次合理修改"];
  const scope = [
    `${client}（甲方，委託方）委託 ${talent}（乙方，受託方）執行「${title}」。`,
    input.description?.trim() || "合作範圍依雙方在對話中確認的內容為準。",
    input.timeline?.trim() ? `期望時程：${input.timeline.trim()}。` : "若未另定時程，依本合約的起始日與完成日執行。",
    "款項於測試模式不會實際扣款。正式合作的付款須經雙方同意本合約後，於平台付款頁處理。",
    "本草稿由 Freeli 範本產生，供雙方審閱，不構成法律意見。",
  ].join("\n");
  const first = Math.floor(price * 0.4);
  const second = price - first;
  const milestones: ContractMilestone[] = price > 0
    ? [
        { title: "開工確認", deliverable: "確認範圍、時程與驗收方式", amount: first, due_on: start },
        { title: "完成驗收", deliverable: deliverables[0] || "交付約定成果", amount: second, due_on: end },
      ]
    : [];

  return {
    title: title.length >= 2 ? title : "合作合約",
    scope,
    deliverables,
    price,
    currency: "TWD",
    start_on: start,
    end_on: end,
    milestones,
    source: "template",
  };
}
