# FUXA View Editor

新版 FUXA 配置編輯工具，使用 React、TypeScript、Ant Design 與 Vite。此專案目前處於分階段遷移初期；既有原生版仍保留在上一層目錄，作為行為與輸出格式的參考。

## 目前功能

- 在瀏覽器本機開啟 FUXA JSON，不上傳配置。
- 驗證配置需包含 `devices` 與 `hmi.views`。
- 顯示 View 清單及選取 View 的基本資訊。
- 新增空白 View、重新命名及刪除 View；刪除時會清理起始頁與導覽引用，並保留至少一個 View。
- 在選取的 View 批次加入既有 Tag，支援搜尋、全選搜尋結果，並沿用 Tag 已設定的樓層。
- 新增、修改、刪除 ModbusTCP 設備；管理 addressCount 補位及整台設備 Tag 位址 ±1，越界時整批取消。
- 編輯可管理元件的標籤、Tag 綁定、狀態配色，或移除元件。
- 調整每個 View 的 Grid 排版設定。
- 預覽目前 View 與編輯後的佈局；預覽為唯讀，排版超出畫布時會提示，並移除危險 SVG 元素、事件處理器與外部資源連結。
- Undo/Redo 編輯，載入新檔與成功匯出後清空編輯歷程。
- 未匯出修改時，重新載入檔案及離開頁面會提示確認。
- 匯出前套用 SVG 變更並驗證輸出；無修改時保留原始配置文字另存。
- 保留原始配置物件與輸入文字，未修改時可依原始位元組另存。
- 修改配置時的 JSON 序列化工具會保留來源換行格式與結尾換行策略。

其他設備通訊類型與進階 Tag 維護功能及完整應用 Store 尚未遷移；已遷移的配置變更均支援 Undo/Redo。

## 開發

使用 Yarn（專案已提交 `yarn.lock`）：

```powershell
yarn install
yarn dev
```

## 驗證與建置

```powershell
yarn lint
yarn test
yarn typecheck
yarn build
```

建置輸出位於 `dist/`。Vite 使用相對資產路徑，部署方式及直接以 `file://` 開啟的支援狀況仍待確認。
