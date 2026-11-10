# Doubt-Driven 鑑別工作台：網站版上線步驟

網站版讓醫師**不用 Claude 帳號**，打開連結就能用。分析由網站後端用你設定的 AI 金鑰（Claude 或 DeepSeek）處理，費用算在你的 API 帳戶。

- 網頁：`public/ddx/index.html`（網址 `/ddx`）
- 後端：`app/api/ddx/route.ts`（Edge runtime，串流回傳，最長約 5 分鐘）
- 模型：預設 Claude `claude-opus-5-5`（推理與反方審查用 high effort，溝通建議用 medium；被安全機制拒答時自動改由備援模型回答）。也可改用 DeepSeek `deepseek-flash`

## 1. 取得 API 金鑰並設定花費上限

兩家擇一即可。

**Claude（建議）**

1. 到 platform.claude.com（原 console.anthropic.com）登入，在 **Billing** 儲值。
2. 在 **API Keys** 建立一把金鑰（只會顯示一次，先複製下來）。
3. 在 workspace 的 **Limits** 設定每月花費上限，避免連結外流時被大量使用。

**DeepSeek**

1. 到 platform.deepseek.com 登入，確認帳戶還有餘額（預付制，餘額用完就停，不會超支）。
2. 在 **API Keys** 建立一把金鑰（只會顯示一次，先複製下來）。

## 2. 在 Vercel 設定環境變數

Vercel 專案 → **Settings → Environment Variables**，在 **Production** 新增：

| 名稱 | 值 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 的金鑰（platform.claude.com）。用 Claude 時填 |
| `DEEPSEEK_API_KEY` | DeepSeek 的金鑰（platform.deepseek.com）。沒填 Claude 金鑰時改用 DeepSeek |
| `DDX_ACCESS_KEY` | 自己決定的通行碼，例如 20 個英數字。要發給多位醫師、之後想單獨停用時，用逗號分隔多組 |
| `DDX_PUBLIC`（選填） | 設 `1` 就不用通行碼，任何知道網址的人都能用。花費只剩 API 帳戶的上限在保護；要恢復通行碼就刪掉它再重新部署 |
| `DDX_PROVIDER`（選填） | 兩把金鑰都填時指定用哪家：`anthropic` 或 `deepseek` |
| `DDX_MODEL`（選填） | Claude 想省一半費用可設 `claude-sonnet-5-5`；DeepSeek 可試 `deepseek-v4-pro`。金鑰是 OpenRouter 的（`sk-or-` 開頭）時，設 `anthropic/claude-opus-5.5` 就改用 Claude（經 OpenRouter，沒有拒答時的自動備援） |

還沒接 Vercel 的話：vercel.com → **Add New → Project** → 匯入這個 GitHub repo → Deploy。

## 3. 部署並把連結給醫師

**用 Vercel CLI 部署成獨立專案（不影響既有網站）**

```bash
vercel link --yes --project doubt-ddx   # 建立並連結新專案
vercel env add DDX_ACCESS_KEY production
vercel deploy --prod --yes
```

權杖在 vercel.com/account/tokens 建立（Scope 選團隊、All Projects）。在 Claude 雲端工作階段裡，權杖存在環境的 Network secrets（主機 `api.vercel.com`）；CLI 的 `--token` 填任意不含 `-` 的字串，代理會換成真的權杖。專案建立後，到它的 **Settings → Environment Variables** 加上 AI 金鑰，再重新部署。

**或在 Vercel 網頁操作**：把這個分支合併到 main 再部署（Preview 部署預設需要 Vercel 登入，醫師打不開，要用 Production）。

之後：

1. 設定或修改環境變數後，到 **Deployments** 對最新一筆按 **Redeploy**（或再跑一次 `vercel deploy --prod`）。
2. 到專案的 **Settings → Deployment Protection** 關掉 **Vercel Authentication**。這個帳號的新專案預設連 `.vercel.app` 正式網域都要登入 Vercel，醫師會打不開（API：`PATCH /v9/projects/<專案>`，內容 `{"ssoProtection": null}`）。
3. 給醫師的連結：`https://你的網域/ddx?k=你的通行碼`，例如 `https://doubt-ddx.vercel.app/ddx?k=...`。

醫師用這個連結打開一次後，那台裝置會記住通行碼，網址上的通行碼也會自動消失。

## 停用或更換

- 換掉 `DDX_ACCESS_KEY` 再 Redeploy，舊連結就失效。
- 多組通行碼時，刪掉其中一組即可只停用那位醫師。

## 費用估算

依 2026 年 10 月的官方價格：Opus 5.5 每百萬輸入 token US$4、輸出 US$20；Sonnet 5.5 為 US$2 / US$10。

- 一次臨床推理（含反方審查）：約 US$0.2–0.4（Opus 5.5）
- 一次溝通建議：約 US$0.05–0.1

實際依病例長度與思考量而定，以 Claude Console 的用量報表為準。DeepSeek 便宜很多，價格以 platform.deepseek.com 公告為準。

## 主訴安全網、PubMed 與考題庫

- **主訴安全網**：`public/ddx/safety-net.js`，26 個成人主訴各自必須排除的診斷與床邊檢查，加上 11 條每個病例都要檢查的高風險條件。分析與反方審查都會對照；病例裡出現的主訴給完整內容，其他只給名稱。醫師審閱頁：`/ddx/safety-net.html`。目前是**醫師審核中的草稿**，改內容只要改這個檔案。
- **PubMed**：`app/api/pubmed/route.ts` 用 AI 寫的英文關鍵字查 NCBI，「需要查證」底下列出前三篇文獻。不會送出病例內容。
- **考題庫**：`scripts/ddx-eval/`，`cases.json` 放題目，`node scripts/ddx-eval/run.cjs --runs 2` 在正式網站上跑並計分（會花 API 額度），說明見該資料夾的 README。

## 看診前問診（病人用）

- 網址：`https://你的網域/ddx/intake`（`public/ddx/intake.html`）。沒開公開模式時，用 `?k=通行碼` 打開一次，裝置會記住。
- 流程：病人填年齡、性別、主訴與病史，AI 依主訴最多問 3 組問題（是／否、0–10 分、簡短文字），最後整理成給醫師的紀錄。每位病人最多 4 次 AI 呼叫。全程不對病人說出診斷或治療建議。
- 急症：主訴或回答出現胸痛冒冷汗、單側無力、說話不清等字詞時，畫面立刻出現提醒。AI 在每一組問題與最後整理時也會判斷，需要時畫面變紅，請病人告訴櫃台或護理人員。
- 交給醫師（名單）：工作台病例欄位上方的「今日看診前問診」列出今天填好的病人，依當天號碼排列，按「帶入」就填進表單並自動開始分析（可在名單下方關閉；病人自答的「沒有」會標成未經確認，不當排除依據）。病人要用「給病人的連結與 QR code」裡的連結（網址帶 `?c=`）填寫，填完畫面會顯示號碼。看名單要輸入通行碼（`DDX_ACCESS_KEY` 的其中一組），每組通行碼是一間診所、各自一份名單。
- 交給醫師（同一台裝置）：用一般連結時，在同一台裝置按「帶入醫師工作台」，紀錄會填進 `/ddx` 的表單，原始問答附在現病史後面。暫存的那份隨即刪除，超過 12 小時也不會帶入。換裝置時按「複製紀錄」再貼上。
- 病人不要填姓名、身分證字號、電話或病歷號。頁面會擋下身分證字號、電話號碼與電子郵件；姓名與病歷號認不出來，只能靠畫面上的提醒。

**名單的設定**（`app/api/intake-queue/route.ts`）

- 資料庫：Vercel Storage 的 Neon（免費方案，`doubt-ddx-queue`），連到專案後會自動有 `DATABASE_URL`。資料表第一次使用時自動建立。
- `DDX_QUEUE_SECRET`：隨機字串（至少 16 字，設成 Sensitive）。紀錄用它和通行碼加密後才存進資料庫，病人連結裡的代碼也由它算出來。
- 紀錄送出 12 小時後就不再顯示，並在下一次有人送出問診或打開名單時從資料庫刪除。號碼每天（台灣時間）從 001 重新開始，每間診所每天最多 300 號。
- 換掉某組通行碼或 `DDX_QUEUE_SECRET` 後，那間診所的病人連結與 QR code 會失效，要重新印，名單上未過期的紀錄也讀不到了。
- 病人頁本身要能呼叫 AI，所以名單功能要在公開模式（`DDX_PUBLIC=1`）下用；病人連結裡沒有通行碼，只能新增紀錄、不能看名單。

## 用 DeepSeek 要注意

- DeepSeek 的資料存放在中國的伺服器；台灣數位部已禁止公部門使用 DeepSeek。醫師若在公立醫院服務，院方規定可能也不允許。
- 醫療推理的品質與安全性仍建議以 Claude 為主，DeepSeek 適合用額度先試用。

## 隱私與責任

- 後端不記錄、不保存病例內容；請求只轉送到你設定的 AI 服務（Anthropic 或 DeepSeek）。
- 網站由你營運，等於你在提供處理健康資料的服務：請提醒使用者只輸入去識別化資料，並遵守個資法與醫療機構規定。
- 內容僅供醫師參考；若要對外推廣成診斷用產品，可能落入食藥署醫療器材軟體的管理範圍。
