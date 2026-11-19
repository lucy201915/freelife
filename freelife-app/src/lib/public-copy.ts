/** Public marketing copy shared by the FAQ page, JSON-LD, and llms.txt. */

export const SERVICE_CATEGORIES: { name: string; description: string }[] = [
  { name: "行銷公關", description: "社群策略、媒體關係、活動企劃" },
  { name: "品牌設計", description: "品牌識別、包裝、視覺系統" },
  { name: "B2B 業務開發", description: "開發信、名單建置、通路談判" },
  { name: "營運流程優化", description: "SOP 建置、專案管理、效率診斷" },
  { name: "財務法務", description: "合約健檢、記帳報稅、募資規劃" },
  { name: "網站與數位開發", description: "形象網站、電商、App 原型" },
  { name: "內容與文案", description: "品牌故事、新聞稿、SEO 文章" },
  { name: "數據分析", description: "GA4 追蹤、儀表板、市場研究" },
];

export const BUSINESS_STEPS: { title: string; body: string }[] = [
  { title: "搜尋服務或留下需求", body: "直接瀏覽標準化服務包，或用簡短描述留下需求，由顧問協助配對。" },
  { title: "比較人才與透明報價", body: "年資認證、交付物、天數與價格一目了然，評價來自真實訂單。" },
  { title: "安心付款、啟動合作", body: "款項由平台保管，雙方在專案工作區確認時程與交付內容。" },
  { title: "驗收交付、完成撥款", body: "確認成果後才撥款給人才，並留下評價。" },
];

export const TALENT_STEPS: { title: string; body: string }[] = [
  { title: "建立專業檔案", body: "整理經歷與作品，呈現可被企業理解的實戰亮點。" },
  { title: "通過資歷認證", body: "平台審核年資與作品，取得認證後才能上架。" },
  { title: "上架標準化服務包", body: "自訂交付物、天數與固定報價，並決定每週可接案時數。" },
  { title: "接案交付、準時收款", body: "可遠端合作。驗收完成後，款項依平台流程撥付。" },
];

export const WHY_POINTS: { title: string; body: string }[] = [
  { title: "嚴選認證人才", body: "人才需經過年資、作品與推薦審核，取得認證才能上架。" },
  { title: "透明定價", body: "服務包明列交付物、天數與固定價格，預算可以一次看懂。" },
  { title: "安心付款保障", body: "款項由平台代管，驗收完成才撥款；未如期交付可申請全額退款。" },
  { title: "彈性合作模式", body: "單次諮詢、專案包到階段性陪跑，依需求組合。" },
];

export const SITE_FAQS: { question: string; answer: string }[] = [
  {
    question: "Freeli 是什麼？",
    answer:
      "Freeli（字標 FREELI）是台灣的雙邊自由工作市集。平台匯聚經過認證的資深專業人才，包含數位遊牧、資深自由工作者與重返職場的專業人士，以透明定價的標準化服務，協助中小企業與新創取得行銷、設計、業務與營運等專業力。",
  },
  {
    question: "企業如何開始合作？",
    answer:
      "可以先在「探索服務」瀏覽標準化服務，依類別或關鍵字篩選；也可以留下需求，由顧問協助配對。每個方案會列出交付內容、工作天數與固定價格。確認合作後，款項由平台代管，驗收完成才撥款給人才。",
  },
  {
    question: "專業人才如何加入？",
    answer:
      "建立專業檔案並通過年資與作品審核，取得認證後即可上架服務包。人才自行決定交付物、天數、固定報價與每週可接案時數，並可遠端完成合作。",
  },
  {
    question: "價格需要另外議價嗎？",
    answer:
      "服務頁以 Basic、Standard、Premium 等方案標示固定價格、交付天數、修訂次數與交付項目。下單時價格由系統依所選方案寫入，頁面上看到的就是方案價格。",
  },
  {
    question: "付款如何保障？目前可以刷卡嗎？",
    answer:
      "合作款項由平台代管，確認成果後才撥款；未如期交付可申請全額退款。線上金流尚未開放，這個階段的付款畫面不會收集信用卡資料，也不會向你收費。",
  },
  {
    question: "有哪些服務類型？",
    answer: `目前的服務分類包括${SERVICE_CATEGORIES.map((c) => c.name).join("、")}。實際可預約的方案以服務列表為準。`,
  },
  {
    question: "哪些內容不會提供給搜尋引擎？",
    answer:
      "工作台、訊息、合約、訂單與付款等登入後頁面只供當事人使用。這些網址設為 noindex，並在 robots.txt 禁止抓取，不會放進網站地圖。",
  },
];

export const ENGLISH_SUMMARY =
  "Freeli (wordmark FREELI) is a Taiwan two-sided freelance marketplace. Vetted senior independents — digital nomads, experienced freelancers, and professionals returning to work — offer packaged services with listed deliverables, timelines, and fixed prices in TWD. Businesses browse the catalog or leave a brief for a match. Funds are held by the platform until delivery is accepted; a full refund can be requested if work is not delivered on time. Card checkout is not live yet, and payment screens do not collect card numbers. Public pages (home, service catalog, service details, FAQ) may be crawled, including by AI training crawlers. Dashboards, messages, contracts, orders, and payments are private and must not be indexed.";
