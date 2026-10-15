# FUXA View Editor

新版 FUXA 配置編輯工具，使用 React、TypeScript、Ant Design 與 Vite。此專案目前處於分階段遷移初期；既有原生版仍保留在上一層目錄，作為行為與輸出格式的參考。

## 目前功能

- 在瀏覽器本機開啟 FUXA JSON，不上傳配置。
- 驗證配置需包含 `devices` 與 `hmi.views`。
- 顯示 View 清單，以及選取 View 的基本資訊。
- 保留原始配置物件與輸入文字，未修改時可依原始位元組另存。
- 修改配置時的 JSON 序列化工具會保留來源換行格式與結尾換行策略。

目前仍為唯讀配置載入切片；View/Tag 編輯、預覽、Undo/Redo 與修改後匯出尚未遷移。

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
