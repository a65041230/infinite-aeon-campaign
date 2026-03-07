# 嘖嘖群募企劃 (ZecZec Campaign) - 防災概念包 (Nexus Shield)

這是從研香室主專案（SaaS 白牌系統）中獨立抽離出來的專案模組。
基於指揮官確保主系統純粹性的戰略指示，我們將該企劃相關檔案統一存放於此，以便未來能直接匯入全新的 Next.js 專案中使用。

## 包含檔案

- `generate_disaster_kit_report.py`: 防災包 Excel 報表產生器（利用 `pandas` 和 `openpyxl` 生成有圖文的清單）。
- `drive_structure_setup.py`: Google Drive 資料夾自動初始化腳本，包含 "防災包專屬討論區" 的創建。
- `防災概念包.json`: 原始的防災概念與企劃設定。

## 使用方式

未來若是開啟一個新的 Next.js 或獨立企劃專案，可直接將這裡的資源導入。由於原本的 UI 還未深度實作入 SaaS 版，因此這包主要為企劃雛形與資料處理腳本。

## 系統瘦身確認
主專案 (`yanxiang-lab`) 中有關此專案的痕跡已徹底清除，確保 SaaS 系統不受客製化群募方案的干擾。
