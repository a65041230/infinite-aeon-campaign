# DDX 考題庫（ddx-eval）

醫師出題的去識別化病例，加上自動跑題的腳本。每題把病例填進線上的鑑別工作台（https://doubt-ddx.vercel.app/ddx），
執行分析，等反方審查完成後，檢查指定的診斷有沒有出現、有沒有被標成「必須排除」。用來當回歸測試，比較不同模型的表現。

## 檔案

- `cases.json`：題庫，一個陣列，每題一個物件。
- `run.cjs`：執行腳本（Node 22 + Playwright）。
- 結果會寫到 `ddx-eval-results/`（預設在執行時的目前資料夾下），已列在 `.gitignore`，不會被 commit。

## 病例欄位對應

| cases.json 的 `case` 欄位 | 網站欄位 | 形式 |
|---|---|---|
| `age` | 年齡 `#f-age` | 輸入 |
| `sex` | 性別 `#f-sex` | 下拉（用選項文字選） |
| `setting` | 就診場景 `#f-setting` | 下拉 |
| `reliability` | 病史可靠度 `#f-rel` | 下拉 |
| `cc` | 主訴 `#f-cc` | 文字（必填） |
| `hpi` | 現病史 `#f-hpi` | 文字 |
| `pmh` | 過去病史、用藥、過敏 `#f-pmh` | 文字 |
| `pe` | 理學檢查、生命徵象 `#f-pe` | 文字 |
| `labs` | 檢驗、影像 `#f-labs` | 文字 |
| `thoughts` | 你目前的想法 `#f-thoughts` | 文字 |

沒有的欄位直接省略即可。`id` 是題目代號（也是結果檔名的一部分），`source` 是出處，`note` 是出題說明。

## 通過標準

- **`expect.must_rule_out`**：每一項有 `label` 與 `pattern`（正規表示式，不分大小寫）。
  在鑑別清單中找到第一個名稱符合 `pattern` 的診斷；**找到且被標為「必須排除」才算 PASS**。
  輸出會附上它在必須排除清單中的排名（例如 `2/5`），以及是否來自反方審查新增（`from critic`）。
- **`expect.bedside`**（選填）：一個正規表示式，只要任一張診斷卡或任一個檢查步驟的文字符合即為 yes。
  這一項**只做參考，不計入 PASS/FAIL**。
- 另外會統計 `#reasonOut` 裡的簡體字數量（只是粗略的檢查，看有沒有混入簡體字）。
- 每次執行的 `problems` 會列出「沒有完成」的通知、頁面錯誤或執行錯誤；執行錯誤的一次嘗試視為 FAIL。

## 怎麼跑

```
node scripts/ddx-eval/run.cjs --runs 3
node scripts/ddx-eval/run.cjs --runs 3 --models default,anthropic/claude-opus-5.5
```

其他選項：`--cases id1,id2`（只跑部分題目）、`--site URL`、`--out DIR`、`--concurrency N`（預設 6）、`--help`。

- `--models` 的 `default` 表示不送 `x-ddx-model` 標頭，由網站決定用哪個模型。
- 除了 `default` 以外的模型，必須已列在網站的 `DDX_LAB_MODELS` 設定裡，否則網站不會使用。
- 每一行輸出是一次執行；最後的 Summary 是每題、每個模型的通過數。
- 結束代碼：就算題目沒通過也是 0；只有腳本本身當掉才是 1。

## 費用

**每一次執行都會花真實的 API 費用。** 不要在 CI 或背景排程裡跑。
- DeepSeek V4 Pro：約幾美分一題。
- Claude Opus 5.5：約 0.3–0.5 美元一題。

例如 `--runs 3 --models default,anthropic/claude-opus-5.5` 跑兩題，就是 2 × 3 × 2 次分析。
