import type { BillingPeriod, ServiceType } from "./supabase";
import { fmt } from "./theme";

export const SERVICE_TYPES: { id: ServiceType; label: string; hint: string }[] = [
  { id: "consult", label: "90 分鐘諮詢", hint: "與專案包相同，需填 Basic、Standard、Premium 三個一次性方案。建議 Basic 為單次 90 分鐘。" },
  { id: "package", label: "標準專案包", hint: "三個一次性方案：Basic、Standard、Premium。" },
  { id: "retainer", label: "月費顧問", hint: "只有一個每月方案，沿用 Basic 方案欄位，價格以月計費。" },
];

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  consult: "90 分鐘諮詢",
  package: "專案包",
  retainer: "月費顧問",
};

export function serviceTypeOf(value: unknown): ServiceType {
  if (value === "consult" || value === "package" || value === "retainer") return value;
  return "package";
}

export function billingOf(value: unknown): BillingPeriod {
  return value === "monthly" ? "monthly" : "one_time";
}

/** Card and list price. A monthly retainer is a single plan, so it drops「起」. */
export function formatStartingPrice(price: number | null | undefined, period: BillingPeriod | undefined): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return "查看方案";
  if (period === "monthly") return `${fmt(price)} /月`;
  return `${fmt(price)} 起`;
}

export function formatPlanPrice(price: number, period: BillingPeriod | undefined): string {
  if (period === "monthly") return `${fmt(price)} /月`;
  return fmt(price);
}
