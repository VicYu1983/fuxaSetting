# FUXA View 元件批次工具

本工具在本機瀏覽器中讀取 FUXA 配置 JSON，讓你選擇 View、管理 Tag 元件清單，批次連接既有 Tag、設定 Label，並依 Grid 自動排列。產生的 JSON 另存為新檔，原始檔不會被覆蓋。預覽不可拖曳；細部位置與互動請在 FUXA 編輯器中調整。

## 開始使用

1. 在 Windows 檔案總管中開啟本資料夾。
2. 雙擊 `index.html`，建議使用最新版 Microsoft Edge 或 Google Chrome。
3. 按「開啟 JSON」，選取 FUXA 配置。
4. 可用 View 清單上方的「新增」建立空白畫布；新 View 會自動在畫布左上方放置顯示 View 名稱的 Label。選取 View 後按「改名」可修改名稱及該 Label 文字；名稱不可空白或與其他 View 重複。按「刪除」可移除選取的 View（至少保留一個 View）。若被刪 View 是起始頁，工具會將起始頁改為剩餘 View；導覽列中指向該 View 的項目會自動移除。
5. 選擇左側 View；新增一筆或批次選取 Tag。
6. 編輯每列的 Label、Tag、圖形樣式與狀態色；設定 Grid 後確認右側預覽。
7. 按「另存新 JSON」。輸出檔名為 `<原檔名>.generated.json`。
8. 將輸出檔匯入 FUXA，後續再以 FUXA 編輯器調整位置與互動。

既有非本工具建立的 Tag 元件以唯讀方式列出並在預覽淡化顯示，不會被工具管理或重排。若配置含有無法解析的 View，該 View 會唯讀保留。

## 支援範圍

- 只選用 JSON 中已存在的 Tag；第一版不建立或修改 Tag，也不提供 CSV 匯入。
- 每個受管理項目包含一個綁定 Tag 的矩形或圓柱狀態圖形，以及一個獨立文字 Label。
- Bool 狀態配色可選「運轉：綠／紅」或「警報：紅／綠」。
- 每次儲存受管理元件會重新套用當前 Grid。匯回 FUXA 後手動調整的位置不會被此工具記錄；重新載入後再次儲存可能重排。
- 刪除 View 會一併處理 `hmi.layout` 中指向該 View 的導覽項目；若該 View 是起始頁，起始頁改指向剩下的第一個 View。工具禁止刪除最後一個 View。
- 載入、編輯與下載均在瀏覽器本機完成；不需安裝套件、不需啟動伺服器或連線網路。

## 開發與測試

```powershell
npm test
```

工具使用原生 JavaScript 與瀏覽器 API，無第三方 runtime 套件。`domain.js` 放置純資料處理函式，`app.js` 負責介面、SVG 建立、預覽與匯出。

## 重要注意事項

- 本工具產生的 FUXA SVG 尚需在實際 FUXA 環境匯入驗證；匯入前請保留備份。
- 元件配色只為 Bool Tag 設計。其他型別仍可連結，但需在 FUXA 中確認狀態範圍與顯示方式。
- 工具會保留 JSON 中其他設定，但只在修改 View 時重寫該 View 的 SVG 字串。
