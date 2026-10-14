# FUXA View 元件批次工具

本工具在本機瀏覽器中讀取 FUXA 配置 JSON，讓你選擇 View、管理 Tag 元件清單，批次連接既有 Tag、設定 Label，並依 Grid 自動排列。產生的 JSON 另存為新檔，原始檔不會被覆蓋。預覽不可拖曳；細部位置與互動請在 FUXA 編輯器中調整。

## 開始使用

1. 在 Windows 檔案總管中開啟本資料夾。
2. 雙擊 `index.html`，建議使用最新版 Microsoft Edge 或 Google Chrome。
3. 按「開啟 JSON」，選取 FUXA 配置。
4. 可用 View 清單上方的「新增」建立空白畫布；新 View 會自動在畫布左上方放置顯示 View 名稱的 Label。選取 View 後按「改名」可修改名稱及該 Label 文字；名稱不可空白或與其他 View 重複。按「刪除」可移除選取的 View（至少保留一個 View）。若被刪 View 是起始頁，工具會將起始頁改為剩餘 View；導覽列中指向該 View 的項目會自動移除。
5. 可按上方「Tag 樓層分組」為既有 Tag 設定樓層；支援搜尋、多選批次設定，並可切換分組／清單檢視。
6. 選擇左側 View；可新增一筆或批次選取 Tag 加入 View。
7. 可按「匯入圖片」將 PNG、JPEG 或 GIF 加入圖示庫；圖片以 Base64 資料 URI 儲存在 `extra.fuxaSetting.icons`，並可從元件的圖形選單選用。輸出時會將圖示內嵌為 SVG `<image xlink:href="data:image/...;base64,...">`；GIF 動畫會保留。仍被元件使用的圖示不能刪除。Bool Tag 的運轉／警報狀態色會以圖示右下角的小矩形提示。
8. 工具建立的元件可編輯 Label、Tag、圖形樣式與狀態色；既有 FUXA Tag 元件會依 Tag 樓層納入分組並自動移動，原有 SVG 外觀、Tag 綁定、事件及範圍色彩均保留。設定 Grid 後確認右側預覽。
9. 批次新增 Tag 時可指定共用預設樓層，也可在貼上資料的第 6 欄為個別 Tag 指定樓層。
10. 按「另存新 JSON」。輸出檔名為 `<原檔名>.generated.json`。
11. 將輸出檔匯入 FUXA，後續再以 FUXA 編輯器調整位置與互動。

可安全量測及移動的既有 FUXA SVG Tag 元件會列在所屬樓層，工具只平移原 SVG 元件，不重建圖形或改寫其 FUXA item 設定。與 Tag 水平置中、位於圖形上方 80 個 SVG 單位內的獨立文字，會視為該 Tag 的標籤一起移動；其他獨立文字及非 Tag 元件維持原位。若 SVG 元件已有自身或上層 `transform`、無法量測外框或結構不受支援，會在唯讀清單顯示原因並保留原位。若配置含有無法解析的 View，該 View 會唯讀保留。

## 支援範圍

- Tag 樓層儲存在 Tag 的 `extra.floor`，作為分組依據；既有 Tag 管理僅修改樓層欄位並保留其他額外資料。Grid 設定依 View ID 儲存在配置最外層的 `extra.fuxaSetting.viewGrids`；圖示資料儲存在 `extra.fuxaSetting.icons`，所有 View 共用的樓層 Group 圓角底框樣式儲存在 `extra.fuxaSetting.floorGroupFrames`，各 View 的標題／底框 ID 索引儲存在 `extra.fuxaSetting.floorGroupArtifacts`。標題與底框是可重複整理的 SVG 輸出元件，不依賴 SVG 自訂樓層屬性來辨識；儲存時合併同樓層重複元件，每組只保留一組，並保留 `extra` 及工具設定中的其他欄位。
- 每個樓層 Group 的底框會包住標題、Tag 圖形與 Label，範圍依內容及內距自動計算；可調整底色、透明度、邊框、圓角與內距。
- 每個受管理項目包含一個綁定 Tag 的矩形或圓柱狀態圖形，以及一個獨立文字 Label。
- Bool 狀態配色可選「運轉：綠／紅」或「警報：紅／綠」。
- 每次儲存 Tag 元件會依樓層重新套用當前 Grid；既有 FUXA Tag 元件只移動 SVG 位置並保留原 item 設定。匯回 FUXA 後手動調整的位置不會被此工具記錄；重新載入後再次儲存可能重排。
- 刪除 View 會一併處理 `hmi.layout` 中指向該 View 的導覽項目；若該 View 是起始頁，起始頁改指向剩下的第一個 View。工具禁止刪除最後一個 View。
- 載入、編輯與下載均在瀏覽器本機完成；不需安裝套件、不需啟動伺服器或連線網路。

## 開發與測試

```powershell
npm test
```

工具使用原生 JavaScript 與瀏覽器 API，無第三方 runtime 套件。`domain.js` 放置純資料處理函式，`app.js` 負責介面、SVG 建立、預覽與匯出。

## 重要注意事項

- 本工具產生的 FUXA SVG 尚需在實際 FUXA 環境匯入驗證；匯入前請保留備份。
- GIF 會以原始動畫資料內嵌；FUXA 對 SVG 內嵌動畫的實際顯示效果仍須在目標環境確認。
- 元件配色只為 Bool Tag 設計。其他型別仍可連結，但需在 FUXA 中確認狀態範圍與顯示方式。
- 工具會保留 JSON 中其他設定，但只在修改 View 時重寫該 View 的 SVG 字串。
