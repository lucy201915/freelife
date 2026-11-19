export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function taipeiDate(offsetDays = 0): string {
  const when = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

export function missingSchema(err: unknown, token: string): boolean {
  const message = String((err as { message?: string })?.message || err || "");
  return message.toLowerCase().includes(token.toLowerCase())
    || message.includes("PGRST204")
    || message.includes("PGRST202")
    || message.includes("schema cache")
    || message.includes("does not exist");
}
