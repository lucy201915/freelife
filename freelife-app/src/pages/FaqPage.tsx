import { Link } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Seo, breadcrumbJsonLd, faqPageJsonLd, graph, organizationJsonLd, websiteJsonLd } from "../components/Seo";
import { SiteFooter, SiteHeader } from "../lib/auth";
import { SERVICE_CATEGORIES, SITE_FAQS } from "../lib/public-copy";
import { BRAND_WORDMARK, FAQ_DESCRIPTION, catalogPath } from "../lib/site";
import { C, card, wrap } from "../lib/theme";

export default function FaqPage() {
  return (
    <>
      <Seo
        title={`常見問題｜${BRAND_WORDMARK}`}
        description={FAQ_DESCRIPTION}
        path="/faq"
        jsonLd={graph(
          organizationJsonLd(),
          websiteJsonLd(),
          breadcrumbJsonLd([
            { name: "首頁", path: "/" },
            { name: "常見問題", path: "/faq" },
          ]),
          faqPageJsonLd(SITE_FAQS),
        )}
      />
      <SiteHeader />
      <main style={{ ...wrap, paddingTop: 48, paddingBottom: 88 }}>
        <Breadcrumbs items={[{ name: "首頁", to: "/" }, { name: "常見問題" }]} />
        <p style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 12 }}>支援中心</p>
        <h1 className="fl-h2" style={{ color: C.ink, fontWeight: 800, marginBottom: 12 }}>常見問題</h1>
        <p style={{ color: C.ink2, fontSize: 16, lineHeight: 1.8, maxWidth: 680, marginBottom: 28 }}>
          Freeli 如何媒合企業與認證專業人才、方案如何標價，以及款項何時撥付。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SITE_FAQS.map((faq) => (
            <section key={faq.question} style={{ ...card, padding: "22px 24px" }}>
              <h2 style={{ fontSize: 18, color: C.ink, marginBottom: 8 }}>{faq.question}</h2>
              <p style={{ color: C.ink2, fontSize: 16, lineHeight: 1.85 }}>{faq.answer}</p>
            </section>
          ))}
        </div>
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 20, color: C.ink, marginBottom: 12 }}>依分類瀏覽服務</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            {SERVICE_CATEGORIES.map((category) => (
              <li key={category.name}>
                <Link to={catalogPath(category.name)} style={{ color: C.forest, fontWeight: 600 }}>{category.name}</Link>
                <span style={{ color: C.ink2 }}>：{category.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
