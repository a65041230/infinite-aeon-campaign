# Doubt-Driven 鑑別工作台：網站版上線步驟

網站版讓醫師**不用 Claude 帳號**，打開連結就能用。分析由網站後端用你的 Anthropic API 金鑰處理，費用算在你的 API 帳戶。

- 網頁：`public/ddx/index.html`（網址 `/ddx`）
- 後端：`app/api/ddx/route.ts`（Edge runtime，串流回傳，最長約 5 分鐘）
- 模型：預設 Claude `claude-opus-5-5`（推理與反方審查用 high effort，溝通建議用 medium；被安全機制拒答時自動改由備援模型回答）。也可改用 DeepSeek `deepseek-flash`

## 1. 取得 API 金鑰並設定花費上限

1. 到 console.anthropic.com 登入，在 **Billing** 儲值。
2. 在 **API Keys** 建立一把金鑰（只會顯示一次，先複製下來）。
3. 在 workspace 的 **Limits** 設定每月花費上限，避免連結外流時被大量使用。

## 2. 在 Vercel 設定環境變數

Vercel 專案 → **Settings → Environment Variables**，在 **Production** 新增：

| 名稱 | 值 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 的金鑰（platform.claude.com）。用 Claude 時填 |
| `DEEPSEEK_API_KEY` | DeepSeek 的金鑰（platform.deepseek.com）。沒填 Claude 金鑰時改用 DeepSeek |
| `DDX_ACCESS_KEY` | 自己決定的通行碼，例如 20 個英數字。要發給多位醫師、之後想單獨停用時，用逗號分隔多組 |
| `DDX_PROVIDER`（選填） | 兩把金鑰都填時指定用哪家：`anthropic` 或 `deepseek` |
| `DDX_MODEL`（選填） | Claude 想省一半費用可設 `claude-sonnet-5-5`；DeepSeek 可試 `deepseek-v4-pro` |

還沒接 Vercel 的話：vercel.com → **Add New → Project** → 匯入這個 GitHub repo → Deploy。

## 3. 部署並把連結給醫師

1. 把這個分支合併到 main（Production 部署才會用到上面的環境變數；Preview 部署預設需要 Vercel 登入，醫師打不開）。
2. 設定或修改環境變數後，到 **Deployments** 對最新一筆按 **Redeploy**。
3. 給醫師的連結：`https://你的網域/ddx?k=你的通行碼`

醫師用這個連結打開一次後，那台裝置會記住通行碼，網址上的通行碼也會自動消失。

## 停用或更換

- 換掉 `DDX_ACCESS_KEY` 再 Redeploy，舊連結就失效。
- 多組通行碼時，刪掉其中一組即可只停用那位醫師。

## 費用估算

依 2026 年 10 月的官方價格：Opus 5.5 每百萬輸入 token US$4、輸出 US$20；Sonnet 5.5 為 US$2 / US$10。

- 一次臨床推理（含反方審查）：約 US$0.2–0.4（Opus 5.5）
- 一次溝通建議：約 US$0.05–0.1

實際依病例長度與思考量而定，以 Console 的用量報表為準。

## 用 DeepSeek 要注意

- DeepSeek 的資料存放在中國的伺服器；台灣數位部已禁止公部門使用 DeepSeek。醫師若在公立醫院服務，院方規定可能也不允許。
- 醫療推理的品質與安全性仍建議以 Claude 為主，DeepSeek 適合用額度先試用。

## 隱私與責任

- 後端不記錄、不保存病例內容；請求只轉送到 Anthropic API。
- 網站由你營運，等於你在提供處理健康資料的服務：請提醒使用者只輸入去識別化資料，並遵守個資法與醫療機構規定。
- 內容僅供醫師參考；若要對外推廣成診斷用產品，可能落入食藥署醫療器材軟體的管理範圍。
