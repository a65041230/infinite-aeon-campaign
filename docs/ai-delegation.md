# AI 分工:Claude 主管 + DeepSeek 外包

Claude(你的訂閱)負責規劃、驗收、合併;大量雜活外包給 DeepSeek,額度不夠時也能讓 DeepSeek 頂上。

```
Claude Code(訂閱)── 規劃、寫任務規格、審查、合併
  ├─ haiku-worker 子代理 ── 小任務(仍算訂閱,但很省)
  └─ scripts/ds-task.mjs → OpenCode → DeepSeek ── 大量雜活(DeepSeek 儲值,不吃訂閱)
```

## 一次性設定(在你的電腦)

1. 安裝 Node.js 20 以上,再裝 OpenCode:
   ```bash
   npm install -g opencode-ai
   ```
2. 到 DeepSeek 開放平台建立 API key,然後登入:
   ```bash
   opencode providers login      # 選 DeepSeek,貼上 key
   ```
   **只儲值小額(例如 US$5–10)**:DeepSeek 是預付制,儲值多少就是你的花費上限。
3. 測試(在這個 repo 裡執行):
   ```bash
   opencode run -m deepseek/deepseek-flash "回覆 PONG"
   ```
4. 拉下這個分支,Claude Code 就會自動載入 `delegate` skill 和 `haiku-worker` 子代理。

## 平常怎麼用

直接跟 Claude 交代工作即可,它會依 `.claude/skills/delegate/SKILL.md` 判斷要不要外包。也可以明講:

- 「這批交給 DeepSeek 做」→ 強制外包
- 「額度快不夠了,開省額度模式」→ Claude 只寫規格和審查,實作全部丟給 DeepSeek

每個外包任務都在 `.worktrees/ds-<名稱>`(分支 `ds/<名稱>`)裡進行,**Claude 審過才會合併**,不會直接動你的工作目錄。

手動操作:
```bash
node scripts/ds-task.mjs run add-tests task.md     # 派一個任務
node scripts/ds-task.mjs status                    # 看目前有哪些外包任務
node scripts/ds-task.mjs clean add-tests           # 審完或放棄後清掉
```

## Claude 額度用完時

在 repo 裡直接開 OpenCode:
```bash
opencode
```
- 預設用 `deepseek-flash` 動手做;按 Tab 切到 plan 模式會用 `deepseek-v4-pro` 規劃。
- 它會讀 `AGENTS.md`,把改動放在 `ds/...` 分支,不會自己合併。
- 額度恢復後跟 Claude 說:「幫我審 ds/ 開頭的分支」。

## 安全設計

| 風險 | 怎麼擋 |
|---|---|
| 金鑰外流 | OpenCode 設定禁止讀 `.env*`、`*.pem`、`*.key`、`secrets/`;外包任務的 worktree 本來就沒有 `.env`;任務檔含疑似金鑰會被拒絕 |
| 亂下指令 | 外包 worker 只能跑 lint / 型別檢查 / git 查詢,其他指令一律禁止;互動模式下其他指令要你按同意 |
| 推送、刪檔 | `git push`、`git reset`、`git clean`、`rm -rf`、`curl`、`wget` 全部禁止 |
| 改壞程式 | 每個任務獨立 worktree,Claude 審查通過才合併;同一任務被退兩次就由 Claude 自己做 |
| 花太多錢 | DeepSeek 預付制,只儲值小額 |

免費模型(`opencode/deepseek-v4.1-flash-free`)只用在不敏感的草稿:免費期間提供者可能收集資料。

## 已知限制

- 設定檔與派工流程已在雲端環境驗證(權限解析、worktree 隔離、金鑰攔截、合併、清除),
  但雲端環境連不到 DeepSeek,**第一次實際呼叫請在你的電腦上用上面第 3 步測試**。
- 模型名稱 `deepseek/deepseek-flash`、`deepseek/deepseek-v4-pro` 來自 OpenCode 1.19.5 的模型清單;
  若日後改名,用 `opencode models deepseek` 查新名稱並更新 `opencode.json` 和 `.opencode/agents/worker.md`。
