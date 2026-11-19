import { Link, useLocation } from "react-router-dom";
import { Seo } from "../components/Seo";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { BRAND_WORDMARK } from "../lib/site";
import { C, btn, wrap } from "../lib/theme";

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <>
      <Seo
        title={`找不到這個頁面｜${BRAND_WORDMARK}`}
        description="這個網址沒有對應的公開頁面。請回到 Freeli 服務列表。"
        path={pathname}
        noindex
      />
      <SiteHeader />
      <main style={{ ...wrap, padding: "80px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 32, color: C.ink, marginBottom: 12 }}>找不到這個頁面</h1>
        <p style={{ color: C.ink2, marginBottom: 24 }}>連結可能已失效，或服務已下架。</p>
        <Link to="/services" className="fl-btn fl-primary" style={{ ...btn("primary"), textDecoration: "none" }}>回到服務列表</Link>
      </main>
      <SiteFooter />
    </>
  );
}
