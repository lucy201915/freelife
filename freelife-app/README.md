# Freeli 應用程式

台灣雙邊自由工作市集。本專案由既有首頁匯出（`/workspace/freelife-export/`）擴充為可部署的 Vite + React 應用，並接上現有 Supabase 專案 `zutptboedajchpbvfijn`。首頁、品牌、導覽、頁尾、登入／註冊視窗與「付款（即將開放）」行為均予保留。

## 新增及修改檔案清單

### 專案骨架
- `package.json` / `package-lock.json` / `vite.config.ts` / `tsconfig*.json` — Vite + React + TypeScript
- `index.html` — 繁體中文語系、字型、預設 SEO
- `.env` / `.env.example` — `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- `public/_redirects` — Netlify SPA 後備（`/* /index.html 200`）
- `vercel.json` — Vercel SPA rewrite
- `public/images/`、`public/favicon.svg` — 首頁既有圖片與品牌圖示
- `dist/` — 生產建置（可直接拖放到 Netlify）

### 應用程式原始碼
- `src/main.tsx` — `BrowserRouter` 入口
- `src/App.tsx` — 路由：`/`、`/services`、`/services/:slug`、`/faq`、`/dashboard`
- `src/index.css` — 與畫布相同的 host reset
- `src/lib/theme.ts` — Freeli 色票與共用樣式（森林／鼠尾草／象牙）
- `src/lib/supabase.ts` — npm `supabase-js` 用戶端、公開目錄查詢、`startPayment()` 空實作
- `src/lib/auth.tsx` — 登入／註冊、需求表單、付款佔位、共用頁首頁尾
- `src/components/ui.tsx` — Image shim、圖示、表單元件
- `src/pages/HomePage.tsx` — 1:1 首頁，導覽「探索服務」連到 `/services`，服務卡在資料存在時連到真實 slug
- `src/pages/ServicesPage.tsx` — 服務列表（搜尋＋類別）
- `src/pages/ServiceDetailPage.tsx` — Fiverr 式服務詳情
- `src/pages/DashboardPage.tsx` — 人才／企業工作台
- `src/pages/NotFoundPage.tsx` — 404

### 資料庫
- `supabase/migrations/202611190000_grant_anon_select_projects_invites.sql` — **僅存檔**。已在線上以名稱 `grant_anon_select_projects_invites` 套用，**請勿再執行**。
- `supabase/migrations/202611190001_create_marketplace_services.sql` — 新資料表、RLS、RPC、`service-media` 儲存桶（已套用）
- `supabase/migrations/202611190002_seed_sample_services.sql` — 為既有人才新增示範服務（已套用；未改寫既有列）
- `supabase/tests/rls_rpc_isolation.sql` — 以現有角色模擬 RLS／RPC 的測試腳本（測試後已刪除資料）

## 資料庫 migrations

採 **只新增、不刪改** 既有資料表／欄位／政策／資料。

1. `grant_anon_select_projects_invites`（已套用，本倉僅存檔）  
   `GRANT SELECT ON public.projects, public.invites TO anon;`  
   讓既有 `profiles` 市集政策不再因缺少 table grant 而對匿名讀者回 42501。RLS 仍會隱藏不該公開的列。

2. `create_marketplace_services`（已套用）  
   新增：`services`、`service_packages`、`service_faqs`、`service_portfolios`、`orders`、`order_deliveries`、`service_reviews`、`service_favorites`；並在既有 `invites` 加上可空的 `service_id`。  
   訂單的價格與狀態沒有用戶端 INSERT／UPDATE 政策，只能經 SECURITY DEFINER RPC 寫入。  
   新增公開儲存桶 `service-media`，寫入僅限自己的 `{uid}/` 資料夾。

3. `seed_sample_services`（已套用）  
   為既有人才新增 5 筆可下架的示範服務（固定 UUID，前綴 `a0000000-` / `b0000000-` / `c0000000-` / `d0000000-`）。刪除這些 id 即可撤回種子，不必動到既有 profiles。

### 公開人才／服務的讀取路徑

使用者後來已核准對 `projects`、`invites` 的 anon SELECT。因此：

- 首頁精選人才改為直接讀取 `talent_profiles` + `profiles`（不再因 42501 退回「陳思妤」等示意卡片）。仍只展示 4 位既有人才以維持首頁版型。
- `list_public_talents`、`list_public_services`、`get_public_service_page` 仍保留，作為不需 join 敏感表的安全讀取路徑，服務列表與詳情頁使用這組 RPC。

**沒有**使用 `service_role` 於前端。

### get_advisors（security）

套用新物件後已執行。新資料表均有 RLS。剩餘警告為：

- `anon`／`authenticated` 可執行 SECURITY DEFINER 函式 — 這是公開目錄與下單 RPC 的預期行為（已限制回傳欄位，並 `REVOKE` 後只 `GRANT EXECUTE` 給需要的角色）。說明見 [Supabase lint 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) 與 [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)。
- `is_role` 與「外洩密碼防護未開啟」為既有項目，本次未改動。

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 專案 URL，例如 `https://zutptboedajchpbvfijn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 公開 anon／publishable key（不可放入 `service_role`） |

複製 `.env.example` 為 `.env` 後填入。建置時會寫進 `dist/`，因此 Netlify 拖放 `dist/` 即可連線，不必再設環境變數。

## API／RPC 清單

| 名稱 | 誰能呼叫 | 用途 |
| --- | --- | --- |
| `list_public_talents()` | anon、authenticated | 公開人才摘要 |
| `list_public_services(p_query, p_category)` | anon、authenticated | 公開服務列表 |
| `get_public_service_page(p_slug)` | anon、authenticated | 服務詳情（方案、FAQ、作品、評價、相關服務、人才介紹） |
| `create_order(p_service_id, p_tier, p_brief)` | authenticated（企業雇主） | 從 `service_packages` 快照價格／天數／修訂後建立 `pending` 訂單 |
| `update_order_status(p_order_id, p_status)` | 當事人才或雇主 | 依角色允許的狀態流轉 |
| `submit_order_delivery(p_order_id, p_message, p_file_paths)` | 接案人才 | 寫入 `order_deliveries` 並將狀態設為 `delivered` |
| `create_service_review(p_order_id, p_rating, p_comment)` | 完成訂單的雇主 | 1–5 星，每筆訂單一次 |
| `start_service_contact(p_service_id, p_kind, p_note)` | 企業雇主 | 建立或沿用對話並寫入 `invites`（quote／meeting） |

前端直接讀寫（受 RLS 限制）：`services`（人才自己的草稿／上架）、`service_packages`／`faqs`／`portfolios`、`service_favorites`、`favorites`、`requests`、`conversations`、`messages`、`invites` 讀取、`service-media` 上傳。  
**不能**由用戶端直接寫入 `orders.price` 或 `orders.status`。

訂單狀態流轉：

- 雇主：`pending` → `cancelled`；`delivered` → `completed`
- 人才：`pending` → `accepted`／`declined`；`accepted` → `in_progress`；`accepted`／`in_progress` → `delivered`（建議走 `submit_order_delivery`）

付款仍為空實作：`startPayment()` 回傳 `{ ok: false, reason: "not_enabled" }`，介面只有停用的「付款（即將開放）」按鈕。

## 安裝及啟動

```bash
cd freelife-app
cp .env.example .env   # 填入 URL 與 anon key
npm install
npm run dev            # 本機開發，預設 http://localhost:5173
npm run build          # 型別檢查、打包，並預渲染公開頁與 robots／sitemap／llms
npm run preview        # 預覽生產建置
```

## SEO

公開頁（首頁、服務列表、服務詳情、常見問題）在 `npm run build` 時預先渲染成靜態 HTML，搜尋引擎與不執行 JavaScript 的 AI 爬蟲可以直接讀到標題、內文與 JSON-LD。`robots.txt` 允許一般爬蟲與 GPTBot、Google-Extended、ClaudeBot、CCBot、PerplexityBot 等；工作台、訊息、合約、訂單與付款路徑為 `noindex` 且 Disallow。

目前標準網址是 `https://freelife-tau.vercel.app`，寫在 `src/lib/site.ts` 的 `SITE_ORIGIN`。換成自訂網域時改這個常數，並把舊網址轉址過去。新的公開頁面使用 `src/components/Seo.tsx` 的 `<Seo>`。建置要列出服務詳情，環境需有 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`（公開 anon／publishable key，不可放 service role）。

### 部署到 Netlify（拖放）

1. 執行 `npm run build`
2. 將 `dist/` 資料夾拖放到 Netlify Drop／網站部署區  
   （`dist/_redirects` 已含 SPA 後備，直接開 `/services/:slug` 不會 404）

部署整個 repo 到 Vercel 時，根目錄的 `vercel.json` 會做同樣的 rewrite。

## 測試結果（13 項驗收）

測試環境為 Vite `build` + `preview`，Headless Chromium 1280 與 390；資料庫測試以既有 `profiles` 模擬 `authenticated`（`SET LOCAL ROLE` + `request.jwt.claims`），**沒有建立任何 auth 測試帳號**。測試寫入的訂單／評價／收藏／邀請已全部刪除，確認殘留為 0。

| # | 項目 | 結果 |
| --- | --- | --- |
| 1 | 首頁 `/` 視覺與文案與既有首頁一致（品牌、導覽、頁尾、色票） | 通過。桌面全頁 1280×7249。搜尋、熱門標籤、付款佔位皆在。 |
| 2 | 首頁精選人才改讀真實 `profiles` + `talent_profiles`，不再回退示意卡片 | 通過。載入吳沛慈、林可恩、陳子謙、張書維 4 位既有人才（log：`loaded live talents 4`）。 |
| 3 | 登入／註冊視窗可用 | 通過。點「登入」出現電子郵件＋密碼表單，可切換免費註冊。未實際登入（信箱驗證仍為開啟）。 |
| 4 | 導覽「探索服務」與首頁服務卡連到真實服務 | 通過。相符標題（例如「品牌社群經營健檢・90 分鐘策略諮詢」）按鈕改為「查看方案」並進入 `/services/:slug`。 |
| 5 | `/services` 列表：搜尋＋類別，資料來自資料庫 | 通過。5 筆種子服務皆出現，含搜尋框與類別篩選。 |
| 6 | `/services/:slug` 讀資料庫，Fiverr 雙欄布局 | 通過。標題、人才（吳沛慈）、輪播、說明、方案、FAQ、作品、相關服務皆來自 DB。 |
| 7 | Basic／Standard／Premium 即時更新價格、天數、修訂、項目 | 通過。Standard NT$12,800／10 天／2 次；Basic NT$4,800／5／1；Premium NT$24,800／14／3。 |
| 8 | 桌面「立即合作」「聯絡人才」與收藏愛心；行動版底部固定 CTA | 通過。390 寬度底部列為 `position: fixed; display: flex`，含價格、聯絡、立即合作。 |
| 9 | 載入／錯誤／空狀態與 SEO（title、description、OG） | 通過。不存在的 slug 顯示「找不到這個服務」。詳情頁 title／og:title 為服務名稱｜FREELI。 |
| 10 | 價格與訂單狀態由伺服器驗證；RLS 禁止前端改價改狀態 | 通過。21 項 SQL  isolation 全數通過：企業下單快照 standard＝12800；直接 UPDATE 被拒；人才不可下單；他方看不見訂單；非法流轉被拒；完成前不能評價；重複評價被拒；收藏隔離。 |
| 11 | 種子資料可識別、未修改既有列 | 通過。5 筆服務掛在既有人才 id 上，固定 UUID，migration 名稱 `seed_sample_services`。 |
| 12 | 未把 `service_role` 放入前端；付款維持空實作 | 通過。前端僅有 anon／publishable key。下單後仍顯示停用的「付款（即將開放）」。 |
| 13 | 建置產物可部署：`dist/` 含 `_redirects` 與圖片 | 通過。`npm run build` 成功。測試後已刪除所有 `[TEST-Freeli-APP]` 列，且沒有新增 auth 使用者。 |

螢幕截圖見 `/workspace/freelife-app-shots/`（桌面首頁、登入、列表、詳情 Basic／Standard／Premium、空狀態；行動首頁、詳情與底部 CTA）。

## 尚未完成功能及原因

- **金流尚未接入**：依需求保留停用的「付款（即將開放）」與 `startPayment()` 註解。後續需以 Edge Function 保管 HashKey／HashIV，不可把金流密鑰放進前端。
- **無法用真實登入做完整 UI 下單驗收**：Auth 仍為 `mailer_autoconfirm: false`。本次未建立測試帳號，改以 SQL 角色模擬驗證 RLS／RPC。工作台（上架、接受／交付、評價、訊息、收藏、邀請）程式已完成，需在信箱驗證後的真實帳號上點選操作。
- **種子服務沒有評價**：避免偽造訂單。無評價時詳情頁顯示「尚無評價」。
- **Security advisor 對公開 SECURITY DEFINER RPC 的警告**：屬預期，未改成會讓匿名目錄失效的 INVOKER。
- **首頁服務卡部分文案仍用設計稿賣家名／價格**：版型維持不變；有對應真實服務時按鈕會連到資料庫的 slug，詳情頁顯示真實價格。

## 技術備註

- 狀態流轉與價格都以資料庫為準，不信任前端傳入的金額。
- 收藏服務使用新表 `service_favorites`（既有 `favorites` 主鍵為 `(user_id, talent_id)`，不便直接擴充）。
- 公開評價以 `reviewer_name` 快照寫入，避免再 join `profiles`。
