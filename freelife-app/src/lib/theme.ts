import type { CSSProperties } from "react";

export const C = {
  forest: "#2E6A4C",
  forest2: "#255E44",
  sage: "#9CAF88",
  sageLight: "#C9D5BC",
  sageMist: "#F2F6EC",
  ivory: "#FDFCFA",
  ivory2: "#F6F3EC",
  white: "#FFFFFF",
  ink: "#1C2620",
  ink2: "#4A574E",
  ink3: "#76827A",
  line: "#E4DDCE",
  gold: "#B8975A",
  goldLight: "#F1E6CF",
};

export const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export const fmt = (n: number): string => "NT$" + Number(n || 0).toLocaleString("en-US");

export const grid = (min: number, gap = 24): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  gap,
});

export const wrap: CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: "0 24px" };

export const CSS = `
.fl, .fl * { box-sizing: border-box; }
.fl button { font-family: inherit; }
.fl-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
.fl-card:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(31,61,43,.12); border-color: ${C.sageLight}; }
.fl-btn { cursor: pointer; transition: background .2s ease, color .2s ease, transform .15s ease, box-shadow .2s ease; }
.fl-btn:active { transform: scale(.98); }
.fl-btn:disabled { cursor: not-allowed; }
.fl-primary:hover { background: ${C.forest2} !important; box-shadow: 0 8px 20px rgba(46,106,76,.24); }
.fl-ghost:hover { background: ${C.sageMist} !important; }
.fl-light:hover { background: ${C.ivory2} !important; }
.fl-link { cursor: pointer; transition: color .2s ease; }
.fl-link:hover { color: ${C.forest2} !important; text-decoration: underline; text-underline-offset: 5px; }
.fl-chip { cursor: pointer; transition: all .2s ease; }
.fl-chip:hover { border-color: ${C.sage} !important; color: ${C.forest} !important; }
.fl-tile { cursor: pointer; transition: all .22s ease; }
.fl-tile:hover { border-color: ${C.sage} !important; background: ${C.white} !important; transform: translateY(-3px); }
.fl-tile:hover .fl-tile-ic { background: ${C.forest} !important; }
.fl-h1 { font-size: clamp(34px, 5.6vw, 60px); line-height: 1.15; letter-spacing: .01em; }
.fl-h2 { font-size: clamp(26px, 3.6vw, 38px); line-height: 1.25; }
.fl-sr { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
.fl-input:focus { outline: none; }
.fl-search:focus-within { box-shadow: 0 0 0 3px ${C.sageLight}, 0 18px 40px rgba(31,61,43,.10) !important; }
.fl-menu-btn { display: none !important; }
@media (max-width: 860px) { .fl-navlinks { display: none !important; } .fl-menu-btn { display: inline-flex !important; } }
@media (max-width: 520px) { .fl-hide-sm { display: none !important; } .fl-sec { padding-top: 64px !important; padding-bottom: 64px !important; } }
@media (max-width: 900px) {
  .fl-gig { grid-template-columns: 1fr !important; }
  .fl-pkg-col { position: static !important; }
  .fl-mobile-cta { display: flex !important; }
  .fl-desktop-cta { display: none !important; }
}
@media (min-width: 901px) {
  .fl-mobile-cta { display: none !important; }
}
`;

export const btn = (kind: "primary" | "ghost" | "light", big = false): CSSProperties => ({
  border: kind === "ghost" ? `1.5px solid ${C.forest}` : "none",
  background: kind === "primary" ? C.forest : kind === "light" ? C.ivory : "transparent",
  color: kind === "primary" ? C.ivory : C.forest,
  borderRadius: 999,
  padding: big ? "15px 30px" : "10px 20px",
  fontSize: big ? 16 : 15,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 44,
  whiteSpace: "nowrap",
});

export const card: CSSProperties = {
  background: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 22,
  overflow: "hidden",
};

export const CATEGORIES = [
  "行銷公關",
  "品牌設計",
  "B2B 業務開發",
  "網站與數位開發",
  "營運流程優化",
  "內容與文案",
  "數據分析",
  "財務法務",
] as const;

export const TIER_LABEL: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待確認",
  accepted: "已接受",
  in_progress: "進行中",
  delivered: "已交付",
  completed: "已完成",
  cancelled: "已取消",
  declined: "已婉拒",
};

export type IconName =
  | "megaphone" | "pen" | "handshake" | "gear" | "scale" | "code" | "doc" | "chart"
  | "shield" | "tag" | "lock" | "flex" | "search" | "star" | "check" | "clock" | "menu" | "arrow";
