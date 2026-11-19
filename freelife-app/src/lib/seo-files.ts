import { BUSINESS_STEPS, ENGLISH_SUMMARY, SERVICE_CATEGORIES, SITE_FAQS, TALENT_STEPS, WHY_POINTS } from "./public-copy";
import { AI_CRAWLERS, BRAND_NAME, BRAND_WORDMARK, PRIVATE_PATH_PREFIXES, SITE_ORIGIN, summarize } from "./site";

export type SitemapEntry = { loc: string; changefreq: string; priority: string };
export type LlmsService = { slug: string; title: string; category: string; description: string };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function robotGroup(userAgent: string): string {
  const lines = [
    `User-agent: ${userAgent}`,
    "Allow: /",
    ...PRIVATE_PATH_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
  ];
  return lines.join("\n");
}

export function buildRobotsTxt(): string {
  const groups = ["*", ...AI_CRAWLERS].map((ua) => robotGroup(ua));
  return `${groups.join("\n\n")}\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function serviceLines(services: LlmsService[], full: boolean): string[] {
  if (!services.length) {
    return ["- 服務詳情網址於建置時若能連上公開目錄，會自動列在這裡。請先看 [探索服務](" + SITE_ORIGIN + "/services)。"];
  }
  return services.map((service) => {
    const blurb = summarize(service.description || service.category, full ? 360 : 120);
    return `- [${service.title}](${SITE_ORIGIN}/services/${service.slug}): ${service.category}。${blurb}`;
  });
}

export function buildLlmsTxt(services: LlmsService[]): string {
  return `# ${BRAND_NAME}

> ${BRAND_WORDMARK} 是台灣的雙邊自由工作市集。平台匯聚經過認證的資深專業人才，以透明定價的標準化服務，協助中小企業與新創彈性取得行銷、設計、業務與營運的專業力。

## English summary

${ENGLISH_SUMMARY}

## 公開頁面

- [首頁](${SITE_ORIGIN}/): 品牌主張、服務分類、合作方式與成功故事
- [探索服務](${SITE_ORIGIN}/services): 可搜尋的標準化服務列表，支援 \`?q=\` 與 \`?category=\`
- [常見問題](${SITE_ORIGIN}/faq): 平台是什麼、如何合作、如何定價、付款保障

## 服務分類

${SERVICE_CATEGORIES.map((c) => `- [${c.name}](${SITE_ORIGIN}/services?category=${encodeURIComponent(c.name)}): ${c.description}`).join("\n")}

## 服務詳情

${serviceLines(services, false).join("\n")}

## 不公開

工作台、訊息、合約、訂單與付款含有私人資料，禁止抓取，也不應被索引或當作模型資料。路徑前綴包括 ${PRIVATE_PATH_PREFIXES.join("、")}。
`;
}

export function buildLlmsFullTxt(services: LlmsService[]): string {
  const faqs = SITE_FAQS.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n");
  const biz = BUSINESS_STEPS.map((s, i) => `${i + 1}. ${s.title}：${s.body}`).join("\n");
  const talent = TALENT_STEPS.map((s, i) => `${i + 1}. ${s.title}：${s.body}`).join("\n");
  const why = WHY_POINTS.map((s) => `- ${s.title}：${s.body}`).join("\n");
  return `# ${BRAND_NAME}（完整說明）

> ${BRAND_WORDMARK} 匯聚經過認證的資深專業人才，以透明定價的標準化服務，陪伴台灣中小企業與新創。

## English summary

${ENGLISH_SUMMARY}

公開網站：${SITE_ORIGIN}/

## 公開頁面

- [首頁](${SITE_ORIGIN}/)
- [探索服務](${SITE_ORIGIN}/services)
- [常見問題](${SITE_ORIGIN}/faq)

## 為什麼選擇 ${BRAND_WORDMARK}

${why}

## 企業如何合作

${biz}

## 人才如何合作

${talent}

## 服務分類

${SERVICE_CATEGORIES.map((c) => `- ${c.name}：${c.description}`).join("\n")}

## 服務詳情

${serviceLines(services, true).join("\n")}

## 常見問題

${faqs}

## 給爬蟲與模型的使用範圍

可以抓取並使用首頁、服務列表、服務詳情與常見問題的公開內容。不要抓取或收錄登入後的工作台、對話、合約、訂單、付款與個人聯絡資料。這些路徑已在 robots.txt 禁止，頁面也標示 noindex。

網站地圖：${SITE_ORIGIN}/sitemap.xml
`;
}
