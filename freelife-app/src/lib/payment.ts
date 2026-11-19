import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMessage } from "./supabase";

export type CheckoutSnapshot = {
  id: string;
  status: "test_pending" | "test_paid" | "cancelled";
  amount: number;
  currency: string;
  provider: string;
  milestone_index: number | null;
};

export type CheckoutStart =
  | { ok: true; mode: "test"; payment: CheckoutSnapshot }
  | { ok: true; mode: "redirect"; url: string }
  | { ok: false; reason: string; message: string };

/**
 * PAYMENT_PROVIDER_HOOK
 * Card data must never be collected on this site.
 * To plug in ECPay (綠界) or TapPay, replace this function with a call to a
 * Supabase Edge Function that:
 *   1. reads the contract amount on the server,
 *   2. creates a hosted payment page at the provider,
 *   3. returns { ok: true, mode: "redirect", url }.
 * The browser should only navigate to that URL.
 * Do not put HashKey, HashIV, partner keys, or merchant secrets in Vite env.
 * Payment success must be recorded by that function after it verifies the
 * provider callback. confirmTestPayment below is for provider = "test" only.
 */
export async function startHostedCheckout(
  sb: SupabaseClient,
  input: { contractId: string; milestoneIndex: number | null },
): Promise<CheckoutStart> {
  try {
    const { data, error } = await sb.rpc("create_test_payment", {
      p_contract_id: input.contractId,
      p_milestone_index: input.milestoneIndex,
    });
    if (error) throw error;
    return { ok: true, mode: "test", payment: asSnapshot(data) };
  } catch (err) {
    return { ok: false, reason: "error", message: rpcMessage(err) };
  }
}

export async function confirmTestPayment(sb: SupabaseClient, paymentId: string): Promise<CheckoutStart> {
  try {
    const { data, error } = await sb.rpc("confirm_test_payment", { p_payment_id: paymentId });
    if (error) throw error;
    return { ok: true, mode: "test", payment: asSnapshot(data) };
  } catch (err) {
    return { ok: false, reason: "error", message: rpcMessage(err) };
  }
}

function asSnapshot(data: unknown): CheckoutSnapshot {
  const row = (data || {}) as Record<string, unknown>;
  const status = String(row.status || "test_pending");
  return {
    id: String(row.id || ""),
    status: status === "test_paid" || status === "cancelled" ? status : "test_pending",
    amount: Number(row.amount || 0),
    currency: String(row.currency || "TWD"),
    provider: String(row.provider || "test"),
    milestone_index: row.milestone_index == null ? null : Number(row.milestone_index),
  };
}
