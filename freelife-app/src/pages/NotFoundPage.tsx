import { useNavigate } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { C, btn, wrap } from "../lib/theme";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <>
      <SiteHeader />
      <div style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 32, color: C.ink, marginBottom: 12 }}>找不到這個頁面</h1>
        <p style={{ color: C.ink2, marginBottom: 24 }}>連結可能已失效，或服務已下架。</p>
        <button className="fl-btn fl-primary" style={btn("primary")} onClick={() => navigate("/services")}>回到服務列表</button>
      </div>
      <SiteFooter />
    </>
  );
}
