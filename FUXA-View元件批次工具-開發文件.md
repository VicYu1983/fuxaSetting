# FUXA View 元件批次工具 — 開發文件

> 對應需求：[FUXA-Tag匯入工具需求說明.md](./FUXA-Tag匯入工具需求說明.md)
> 範例配置：[旭峰建設.json](./旭峰建設.json)
> 狀態：第一版已開始實作。實際程式為本資料夾的 `index.html`、`styles.css`、`domain.js`、`app.js`；未安裝第三方 runtime 套件。下文標示「**假設**」的項目尚未由使用者確認。

### 實作狀態補充

- 採免安裝、免伺服器的原生 JavaScript 網頁，而非原提案的 TypeScript/Vite；可用 Edge 或 Chrome 直接開啟 `index.html`。
- 已包含 JSON 載入、View 清單、既有 Tag 搜尋／批次新增、Tag／Label／樣式編輯、排序／刪除、Grid 預覽、Undo/Redo、另存新檔及資料驗證。
- 已支援建立空白 View、刪除選取 View；新增時會建立一個左上角 View 名稱 Label，不會自動加入 FUXA 導覽列。
- 已支援修改 View 名稱；名稱變更納入 dirty check 與 Undo/Redo，不改變 View ID 或導覽連結。
- 已實作 `items` 與 SVG 同步、保留未管理元件、原檔逐字複製、Bool 狀態配色及本機資料處理。
- 自動化測試使用 Node.js 內建測試執行器；實際匯入 FUXA 的相容性仍需現場驗證。

## 1. 目標與範圍

### 1.1 目標

純前端、本機執行的網頁工具：載入 FUXA 配置 JSON → 以 View 為單位管理「Tag 元件」清單（新增／檢視／修改／刪除）→ 依 Grid 規則自動排列並即時預覽 → 另存為新的 JSON，匯入 FUXA 後再於 FUXA 編輯器微調。

### 1.2 範圍內（第一版）

- 載入 FUXA JSON、列出 `hmi.views`。
- 新增空白 View（含左上角名稱 Label）、刪除選取的 View，至少保留一個 View。
- 對選定 View 的「Tag 元件」清單做 CRUD。
- 每個 Tag 元件 = 1 個圖形元件（綁定 Tag）+ 1 個 Label（文字）。
- 新 View 標題為 FUXA 原生文字元件（`svg-ext-shapes-text`），文字與 View 名稱一致；修改 View 名稱會同步更新該 Label。
- Grid 自動排列、View 預覽（唯讀，不可拖曳）。
- 同步寫入 `items` 與 `svgcontent`，輸出新 JSON。

### 1.3 範圍外

- 建立／修改 Tag 與 Device（**假設**第一版只選用既有 Tag；見 §13）。
- 事件、互動、腳本、ranges 以外的動態設定。
- 預覽中拖曳、縮放、手動改位置。
- 覆蓋原檔、任何網路傳輸。
- 修改 `scripts`、`devices` 等非 View 區塊（必須原樣保留）；`hmi.layout` 僅在刪除 View 時清理必要引用。

> 新增 View 不會自動建立導覽項目，需在 FUXA 編輯器中自行加入導覽。刪除 View 時會自動更新 `hmi.layout`：移除導覽項目中指向該 View 的項目；若起始頁指向該 View，改指向剩餘 Views 中相鄰的一個。

## 2. 技術選型建議

| 項目 | 建議 | 理由 |
| --- | --- | --- |
| 語言 | 原生 JavaScript | 不需編譯步驟，符合本機離線開啟需求 |
| 執行 | `index.html` 載入同目錄 classic scripts | 避免 `file://` 下 ES Module 的 CORS 限制 |
| UI | 原生 DOM 與 CSS | 不需框架或網路載入資源 |
| 測試 | Node.js 內建 `node:test` | 不需安裝第三方測試套件 |
| 瀏覽器 | 最新版 Chrome / Edge | 以 Blob 下載另存新檔 |

不得引入任何會對外發送資料的套件或 CDN（離線可用）。

## 3. 配置結構分析（來自範例 JSON）

### 3.1 頂層

`devices`、`hmi`（`views`、`layout`）、`scripts`、`server`、`version` 等。工具只改 `hmi.views[*]`。

### 3.2 Device 與 Tag

- `devices` 以 device id（如 `d_3a3e4c9d-2b004cc9`、FUXA 內建伺服器為 `"0"`）為鍵；共 35 個，類型含 `FuxaServer`、`ModbusTCP`、`ModbusRTU`。
- 每個 device 有 `tags` 物件，鍵與 `tag.id` 相同（`t_xxxxxxxx-xxxxxxxx`）。
- **Tag 名稱不保證全域唯一**（多個樓層設備可能有同名點位），Tag **ID 唯一**。因此：連結一律以 Tag ID，UI 顯示「設備名／Tag 名」。
- Modbus Tag 例：`{ id, name, type:"Bool", memaddress, address, divisor, daq, ... }`；FuxaServer 的 Tag 型別為 `number`／`string` 等，欄位不同。工具只讀取 `id`、`name`、`type`，不改寫。

### 3.3 View

`hmi.views[]` 的每個元素：

```jsonc
{
  "id": "v_...",
  "name": "電力設備及發電機_B2F",
  "profile": { "width": 1024, "height": 768, "bkcolor": "#ffffffff", ... },
  "items": { "<itemId>": { id, type, name, property, label, hide, lock } },
  "variables": {},
  "svgcontent": "<svg ...>...</svg>",   // 字串
  "type": "svg",
  "property": { "events": [...], "actions": [] }   // 部分 View 才有（例如 onopen 事件）
}
```

- 畫布尺寸取自 `profile.width/height`（範例皆為 1024×768）。
- `items` 與 `svgcontent` 用**同一個 id** 對應：`items[id]` ↔ `svgcontent` 內 `id="<id>"` 的元素。**兩邊必須同步增刪。**
- 部分 View 層級有 `property.events`（如 `onopen` 執行腳本）——工具不得動它。

### 3.4 兩種需要的元件寫法（取自範例）

**狀態圖形元件（綁 Tag）**，以 `svg-ext-shapes-rectangle` 為例：

`items`：

```jsonc
"SHE_455209fa-2d564070": {
  "id": "SHE_455209fa-2d564070",
  "type": "svg-ext-shapes-rectangle",
  "name": "shape_1",
  "property": {
    "variableId": "t_3e02b442-c00c462b",      // ← Tag 連結
    "ranges": [
      { "min": 1, "max": 1, "color": "#20ff00ff", "type": 2, "stroke": "" },
      { "min": 0, "max": 0, "color": "#ff0000ff", "type": 2, "stroke": "" }
    ],
    "events": [], "actions": []
  },
  "label": "Shapes", "hide": false, "lock": false
}
```

`svgcontent`：

```xml
<g data-name="shape_1" id="SHE_455209fa-2d564070" type="svg-ext-shapes-rectangle"
   fill="#FFFFFF" stroke="#000000" font-size="14" font-family="sans-serif" text-anchor="middle">
  <rect id="SHE_c8006a9b-07744651" width="40" height="40" y="113" x="197"/>
</g>
```

- `<g>` 的 id 即 item id；內層 `rect/path` 有**另一組**獨立 id（FUXA 編輯器自行產生）。
- `svg-ext-shapes-cylinder` 為 `<g>` + 兩個絕對座標 `<path>`；範例顯示 `ranges` 在 Bool Tag 上是「1 → 一種顏色、0 → 另一種顏色」，且**不同點位顏色相反**（運轉：1 綠／0 紅；過載、低油位：1 紅／0 綠）。因此「狀態配色」必須是每項可選的欄位。

**Label（純文字）**：

`items`：

```jsonc
"svg_e5d9d9df-d371f7c8": { "id": "svg_e5d9d9df-d371f7c8", "type": "svg-ext-shapes-text",
  "name": "shape_4", "property": null, "label": "Shapes", "hide": false, "lock": false }
```

`svgcontent`：

```xml
<text data-name="shape_4" id="svg_e5d9d9df-d371f7c8" x="308" y="154"
      fill="#000000" stroke="#000000" stroke-width="0"
      font-size="14" font-family="sans-serif" text-anchor="middle" xml:space="preserve">一氧化碳偵測器1</text>
```

### 3.5 範例中的「雜訊」item

`items` 內可能出現 `svg-ext-shapes-path` 這類 item，其 id 對應的是**群組內層的 path**（如泵浦圖形），並非獨立元件。載入時一律視為「其他元件」，原樣保留，不可因為不認得就刪除或重排。

### 3.6 序列化保真度（已驗證）

對範例檔執行 `JSON.parse` → `JSON.stringify(obj, null, 4)` → 換行改為 `\r\n`，結果與原檔**逐字相同**（檔案為 CRLF、4 空白縮排、無結尾換行）。因此：

- 輸出使用 `JSON.stringify(data, null, 4)`，並依「原檔偵測到的換行」還原（原檔含 `\r\n` 就轉換為 `\r\n`；不補結尾換行）。
- 未修改的區塊因此不會產生 diff。
- 注意：JS 物件會將「整數字串鍵」（如 device `"0"`）排到最前面；範例中 `"0"` 本來就在最前，無影響，但需在測試中固定檢查。

## 4. 核心概念：什麼是「Tag 元件」

配置中沒有「圖形元件與 Label 屬於同一組」的資訊，需要自訂辨識規則。

### 4.1 辨識與配對（假設）

- **工具建立**的元件使用固定命名（寫入 `items[*].name` 與 SVG `data-name`，兩者在範例中皆保留）：
  - 圖形：`tc_<n>`
  - Label：`tc_<n>_label`
  - `<n>` 在同一 View 內遞增且不重用（以現有最大值 +1）。
- 載入時：
  - 名稱符合上述規則者 → **受管理項目**（managed），可在清單中修改／刪除，且參與自動排列。
  - 其他有 `property.variableId` 的元件 → 顯示在清單，標示「非工具管理（唯讀）」，不參與排列、不可編輯／刪除。
  - 其他元件（文字、路徑、按鈕…）→ 不顯示於清單，預覽中以淡色顯示其外框，原樣保留。
- 理由：避免以位置猜測配對而誤改使用者在 FUXA 中手工調整過的畫面。使用者在 FUXA 中改了位置後再匯回此工具，受管理項目會在下次排列時被重新套用 Grid（需在 UI 提示，見 §9.5）。

> 風險：FUXA 編輯器是否保留 `data-name` 已由範例證實（`data-name="shape_1"` 等存在於已存檔 SVG）；若使用者在 FUXA 中改名，該項目即變成非管理項目，這是預期行為。

### 4.2 資料模型（執行期）

```ts
type TagComponent = {            // 清單中的一列
  key: string;                   // 工具內部 uuid，僅供 UI
  seq: number;                   // 對應 tc_<seq>
  tagId: string;                 // t_xxxx
  label: string;                 // Label 文字（獨立於 tag 名稱）
  template: TemplateId;          // 'rect' | 'cylinder' ... （見 §7）
  palette: PaletteId;            // 'normal' | 'alarm' | 'custom'（見 §7.3）
  managed: boolean;
};

type GridSettings = {
  originX: number; originY: number;   // 左上起點（預設 §8）
  columns: number;
  gapX: number; gapY: number;
  labelPosition: 'above' | 'below' | 'left' | 'right';
  labelOffset: number;
  labelFontSize: number;
};

type ViewModel = {
  viewId: string;
  components: TagComponent[];     // 順序 = Grid 排列順序
  grid: GridSettings;
};
```

`GridSettings` 與 `components` 順序為工具狀態。重新載入既有 JSON 時無法從配置還原，因此預設值載入後重新套用（**假設**：Grid 設定不寫入配置；若要記住，可寫入 View 以外的獨立 sidecar 檔，列為後續功能）。

## 5. 模組架構

```
index.html               // 本機開啟的介面骨架與 CSP
styles.css               // 介面樣式
domain.js                // 設定檢查、Tag 索引、managed item 讀取、Grid、ID、JSON 序列化
app.js                   // 載入、CRUD、SVG 產生／安全預覽、驗證、另存
tests/domain.test.cjs    // Node.js 內建測試
旭峰建設.json             // 使用者配置；僅作輸入，不作為測試輸出
```

`domain.js` 的資料邏輯使用純函式；瀏覽器 DOM API 僅用於 SVG 解析與建立。

## 6. 主要流程

### 6.1 載入

1. 使用者選檔（`<input type="file">` 或 `showOpenFilePicker`）。
2. 讀入文字，記錄：原始文字、換行型態（含 `\r\n` 與否）、是否有結尾換行。
3. `JSON.parse`；檢查必要結構（§10.1）。失敗 → 顯示錯誤，不進入編輯。
4. 建立 Tag 索引（遍歷全部 `devices[*].tags`，含 FuxaServer）。
5. 對每個 View 執行 `viewReader`，得到 `ViewModel`（受管理項目＋唯讀項目＋其他元件外框）。
6. 記錄初始 View ID 清單及 `hmi.layout`，供 dirty check 使用。
7. 配置作為記憶體工作副本；來源檔案文字保持不變。

### 6.2 編輯

- 所有編輯只改 `ViewModel`（記憶體）。
- 每次變更觸發：`layout` 重算座標 → 預覽重繪（不寫入配置）。
- 可提供 undo/redo：以 `ViewModel` 快照堆疊實作（小型資料，成本低）。

### 6.3 儲存

1. 對每個「有變更」的 View，呼叫 `applyView(viewModel, viewInWorkingCopy)`（§6.4）。
2. 序列化整份工作副本（§3.6）。
3. 另存新檔，預設檔名 `<原檔名>.generated.json`，**不允許選擇原檔路徑時靜默覆蓋**（若 File System Access API 取得的 handle 與原檔相同，顯示確認或阻擋）。
4. 顯示摘要：各 View 新增／修改／刪除筆數、警告。

### 6.4 `applyView`（核心）

輸入：該 View 的工作副本、`ViewModel`。步驟：

1. 以 `DOMParser` 解析 `view.svgcontent`（`image/svg+xml`）。
2. 找到主要圖層：`svg > g` 中含 `<title>Layer 1</title>` 的 `g`；找不到則取第一個 `g`；都沒有則報錯（不自行發明結構）。
3. **移除**：先刪除原始配置載入時記錄的受管理項目及目前清單項目，在 `svgcontent` 與 `items` 中的對應記錄。必須保留原始 managed 清單，否則使用者刪除一筆後，新清單已不包含該 ID，無法從輸出中移除舊元件。
4. 依清單順序與 `layout` 結果，**重新產生**每個項目的圖形與 Label：
   - 新項目產生不重複 id；既有項目沿用原 id，避免破壞 FUXA 後續設定。
   - 寫入 `items[id]` 與 `svgcontent` 節點。
5. 非受管理的元素不動（包含其在 DOM 中的相對順序）。
6. 序列化 `svgcontent`（§6.5），回寫 `view.svgcontent`。

雖然重繪時重建 SVG 節點，既有受管理 item 與 Label 的 id 仍沿用原值。刪除動作以載入時的 original managed IDs 為基準，確保已從 UI 清單刪除的元件也會從輸出移除。

> 注意：沿用 id 時，若使用者已在 FUXA 為受管理元件加了事件，不可丟失。因此只更新 `variableId`、`ranges`、幾何及 Tag 標籤欄位，保留 item 的其他設定（含 events、actions）。

### 6.5 SVG 序列化

- 使用 `XMLSerializer`，輸出後需檢查：根為 `<svg ...>`、保留原本 `width/height` 及命名空間屬性（範例中有 `xmlns:svg`、部分有 `xmlns:html`）。
- 範例 `svgcontent` 為 1 空白縮排、`\n` 換行；序列化後格式不同於原字串屬可接受（FUXA 會重新解析）。**只對有變更的 View 回寫**，未變更的 View 字串保持逐字不變。
- 文字內容需 XML 轉義（`& < >`）；Label 含中文可直接寫入。

## 7. 元件樣板

### 7.1 樣板介面

```ts
interface Template {
  id: TemplateId;
  label: string;                            // UI 名稱
  itemType: string;                         // 'svg-ext-shapes-rectangle' ...
  size: { w: number; h: number };           // 預設外框尺寸，供 layout 使用
  buildSvg(x: number, y: number, ids: { group: string; inner: string[] }, name: string): Element;
  buildItem(id: string, name: string, tagId: string, palette: Palette): ItemObject;
}
```

### 7.2 第一版內建樣板（**假設**）

| id | itemType | 說明 |
| --- | --- | --- |
| `rect` | `svg-ext-shapes-rectangle` | 預設；`<g>` + `<rect>`，預設 40×40 |
| `cylinder` | `svg-ext-shapes-cylinder` | 範例中發電機狀態使用；兩條 `path`，座標需由 (x,y,w,h) 重新計算；預設約 60×80 |

樣板的 `<g>` 屬性（`fill="#FFFFFF" stroke="#000000" font-size="14" font-family="sans-serif" text-anchor="middle"`）與範例一致。`items[*]` 固定帶 `"label":"Shapes"`、`"hide":false`、`"lock":false`。

> 若日後要支援更多元件類型，優先採「從現有 View 中複製一個元件為樣板」的方式（讀取其 `items` + SVG 片段、替換座標與 id），可涵蓋 FUXA 自帶的各種 ext 元件而不必逐一手寫。此為後續擴充，不在第一版。

### 7.3 狀態配色（palette）

Bool Tag 使用 `ranges`（`type: 2` 為填色，沿用範例）：

| palette | 1 | 0 | 備註 |
| --- | --- | --- | --- |
| `normal` | `#00ff07ff` 綠 | `#f80000ff` 紅 | 運轉類 |
| `alarm` | `#ff0000ff` 紅 | `#00ff07ff` 綠 | 過載、低油位等警報類 |

範例的 `ranges` 項目結構：`{ min, max, color, type: 2, stroke: "" }`，Bool 的 1 與 0 各一筆（`min == max`）。非 Bool（數值型）Tag 的 ranges 設計第一版不處理：選到非 Bool Tag 時顯示警告，仍可建立但 `ranges` 使用 `normal` 配色並提示使用者到 FUXA 修正（**假設**）。顏色字串格式為 `#RRGGBBAA`。

### 7.4 ID 產生

- 沿用 FUXA 命名：群組 `SHE_<8hex>-<8hex>`；Label／其他 `svg_<8hex>-<8hex>`（範例中的格式）。
- 產生後必須檢查**整份配置**（所有 View 的 `items` 鍵與其 `svgcontent` 中所有 `id`）沒有衝突，衝突則重新產生。
- 使用 `crypto.getRandomValues`。

## 8. Grid 排列演算法

`layout(components, grid, templates) → Placement[]`，純函式，可單元測試。

```ts
type Placement = {
  key: string;
  shape: { x: number; y: number; w: number; h: number };
  label: { x: number; y: number; anchor: 'start'|'middle'|'end' };
};
```

目前實作規則：

1. 第 `i` 個元件：`col = i % columns`、`row = floor(i / columns)`。
2. Cell 寬度 = 圖形寬度 + `gapX`；Cell 高度 = 圖形高度 + `gapY` + Label 字體大小 + Label 間距。
3. Cell 起點為 `(originX + col*cellWidth, originY + row*cellHeight)`；矩形使用 40×40，圓柱使用 60×64。
4. Label 依 `labelPosition` 放置，文字錨點依方向設定；目前不估算長文字寬度，也不自動避讓其他元件。

預設（**假設**，皆可調整）：`columns=4`、`originX=60`、`originY=80`（避開頂部標題，範例標題 y≈32）、`gapX=40`、`gapY=40`、`labelPosition='above'`（與範例發電機頁一致：文字在圖形上方）、`labelOffset=10`、`labelFontSize=14`。

目前預覽會在圖形本身超出畫布時顯示警告，不自動縮放；元件重疊與 Label 長度尚無自動警告。

## 9. UI 設計

### 9.1 版面

三欄：左 **Views 列表** ／ 中 **元件清單與 Grid 設定** ／ 右 **預覽**。頂部：開啟檔案、另存、Undo/Redo、變更摘要。

### 9.2 Views 列表

- 顯示 `view.name`、受管理項目數、非管理綁 Tag 項目數、是否有未儲存變更（●）。
- 選取後載入右側內容。
- 清單標題列提供「新增」、「改名」與「刪除」；新增透過名稱對話框建立空白 View，改名編輯選取 View 的名稱。名稱不可空白且不得與其他 View 重複（忽略大小寫）。
- 新增的 View 在畫布左上方顯示 View 名稱 Label；使用工具改名時同步變更 Label 文字。
- 刪除前顯示確認對話框及導覽引用影響；至少保留一個 View。

### 9.3 元件清單（CRUD）

| 欄 | 說明 |
| --- | --- |
| # | 順序（可上下移動或拖曳排序，影響 Grid 位置） |
| Label | 可行內編輯 |
| Tag | 顯示「設備名／Tag 名（型別）」，點擊開啟 TagPicker |
| 樣式 | 樣板 + palette 下拉 |
| 操作 | 刪除；「在下方插入」 |

- **新增**：單筆新增，以及「批次新增」——選取多個 Tag（TagPicker 多選，可依設備展開／搜尋），Label 預設帶 Tag 名稱，可事後逐列改。
- 唯讀（非管理）項目以灰底顯示且不可操作。
- 若 Tag ID 在 `devices` 中不存在（配置被手動改壞）→ 該列標紅，顯示「Tag 不存在」。

### 9.4 Tag 選取器

- 資料來源：Tag 索引（§6.1 步驟 4）。
- 以設備分組，支援名稱模糊搜尋（中英）；同名 Tag 顯示設備名以區分。
- 已被此 View 使用的 Tag 以標記顯示（允許重複使用，**假設**；例如同一 Tag 在同頁做兩個元件並不違反 FUXA 規則，只給提示）。

### 9.5 預覽與提示

- 預覽以 `<svg>` 渲染，viewBox 為 `0 0 profile.width profile.height`，背景色取 `profile.bkcolor`；受管理項目用實色，其他元件用淡色。使用與輸出完全相同的 `buildSvg`，確保所見即所得。
- 不提供拖曳／縮放修改位置（可提供檢視縮放）。
- 固定提示：「受管理項目每次儲存會依 Grid 重新排列；若已在 FUXA 中手動調整位置，重新排列會覆蓋位置。事件、動作設定會被保留。」
- 當載入的受管理項目位置與 Grid 預期明顯不同時（代表曾在 FUXA 手動調整），在 View 標記黃色警示。

## 10. 驗證與錯誤處理

### 10.1 載入時

- 必須為 JSON 物件，且 `hmi.views` 為陣列，`devices` 為物件；否則提示「不是 FUXA 配置」並拒絕。
- 每個 View 需有字串型 `id`、`items`（物件）與 `svgcontent`（字串）；缺漏的 View 在列表標紅並**禁止編輯**，但保留原樣。
- `svgcontent` 無法被 `DOMParser` 解析（出現 `parsererror`）→ 該 View 禁止編輯。

### 10.2 編輯時

| 規則 | 處理 |
| --- | --- |
| Tag 不存在 | 該列錯誤，禁止儲存 |
| Label 為空 | 警告（允許，但預設用 Tag 名稱） |
| 非 Bool Tag | 警告（§7.3） |
| 超出畫布／與既有元件重疊 | 警告 |
| 同一 View 重複使用同一 Tag | 提示 |

### 10.3 儲存時

- 若任一受管理項目有「錯誤」級別問題 → 阻擋並指出列。
- View ID 清單或 `hmi.layout` 與載入時不同，也視為未儲存變更。
- 儲存後**自我驗證**：重新解析輸出字串，檢查：
  1. 各 View 的 `items` 鍵與 `svgcontent` 中對應 id 一一存在（受管理項目）。
  2. 每個受管理元件的 `variableId` 都存在於 Tag 索引，且與清單一致。
  3. 本次產生的 id 不與現有 SVG id 衝突；範例配置本身有一個跨 View 重複 item id，故不得因既有重複而阻止匯出。
  4. 未修改的 View、`devices`、`scripts`、`hmi.layout` 與原始配置深度相等。
  任何一項失敗 → 不寫檔，顯示診斷。

## 11. 安全與隱私

- 全程在瀏覽器本機；不得有 `fetch`/XHR/WebSocket、不載入外部腳本／字型／圖片。
- 使用 Content-Security-Policy `<meta>` 限制腳本、樣式、連線與表單來源；程式及樣式由本機同目錄檔案載入。
- Label／名稱等使用者輸入寫入 SVG 時用 DOM API（`textContent`、`setAttribute`）而非字串拼接，避免注入；預覽用 DOM 節點渲染，**不**以 `innerHTML` 插入來自檔案的 `svgcontent`（其內含他人編輯的 HTML，如 `foreignObject` 內的 `BUTTON`）。預覽建議：複製 SVG 節點並移除 `script`、`foreignObject` 以及 `on*` 屬性後再顯示。

## 12. 測試計畫

| 層級 | 測試 | 通過標準 |
| --- | --- | --- |
| 單元（已實作） | Node.js `node --test tests/domain.test.cjs` | 範例配置檢查、Tag 索引、Grid、CRLF 往返、ID 碰撞重試全通過 |
| 手動（已執行） | Edge 載入範例、批次新增 1 筆、另存 | UI 載入 8 個 View／220 個 Tag；加入項目並通過匯出前資料驗證 |
| 單元（已實作） | 刪除 View 的 layout 參照處理 | 移除導覽引用並將 `start` 指向指定的保留 View |
| 手動（已執行） | 新增 View 標題與修改名稱 | 預覽顯示左上角文字元件，改名、Undo、Redo 皆同步更新文字 |
| 單元（待補） | `applyView` 與 managed item 刪除 | 新增／刪除／修改後 items 與 SVG 同步，保留非管理內容與 events |
| 整合 | 對範例 `電力設備及發電機_B2F` 重建 | 產生結果可被 `JSON.parse`、通過 §10.3 自我驗證 |
| 手動 | 匯入 FUXA（實機） | 新元件在 FUXA 編輯器可選取、屬性面板顯示正確 Tag、執行時顏色隨 Tag 值變化；Label 位置如預覽 |

**手動匯入驗證必須在實作早期（樣板完成後）就做一次**，用以確認 `svgcontent` 序列化後 FUXA 仍能正確載入——這是整個專案最大的相容性風險。

## 13. 待確認事項與目前假設

| # | 問題 | 本文假設 | 影響 |
| --- | --- | --- | --- |
| 1 | 是否在工具中建立新 Tag | 否，只選用既有 Tag | 若需要：新增 Tag 表單、Tag id 產生、device 選擇、地址等欄位（Modbus 與 FuxaServer 不同） |
| 2 | 同名 Tag 的顯示 | 「設備名／Tag 名」 | UI |
| 3 | 元件樣式 | 內建 `rect`、`cylinder`＋兩種 palette | 擴充為「複製現有元件」需新增 `viewReader` 取樣功能 |
| 4 | Grid 預設值 | §8 預設 | 設定面板 |
| 5 | CRUD 是否可改樣式 | 可 | — |
| 6 | CSV 匯入 | 第一版不做；保留「批次新增」介面，後續可加 `csvImport.ts` 產生 `TagComponent[]`（欄位：Tag、Label、樣式） | 需另定欄位格式與 Tag 比對規則 |
| 7 | id／名稱規則 | §4.1、§7.4 | 命名衝突處理 |
| 8 | Grid 設定是否持久化 | 否（僅工作階段） | 若需要，加 sidecar 檔 |
| 9 | 受管理項目被手動改位置後的處理 | 重新套用 Grid，保留 events/actions | 需 §9.5 提示 |
| 10 | 非受管理的綁 Tag 元件 | 唯讀顯示 | 若希望也能管理，需定義「轉為受管理」的操作 |

## 14. 開發里程碑

1. **M1 基礎**：已完成載入／序列化、Tag 索引、View 列表、新增／刪除 View 與 roundtrip 測試。
2. **M2 寫入核心**：已完成 SVG 元件建立、ID、Tag 綁定與匯出自我驗證；待以實際 FUXA 匯入驗證。
3. **M3 排列與預覽**：已完成 Grid、自動預覽與設定面板。
4. **M4 清單 CRUD**：已完成單筆／批次新增、編輯、刪除、排序、Undo/Redo。
5. **M5 收尾**：本機 CSP、錯誤訊息、單元測試與使用文件已建立；仍需補 `applyView` 自動測試與 FUXA 實機驗證。

M2 完成後若實機匯入有相容性問題，需先修正再往下做（其餘功能皆依賴此寫入結果）。

## 15. 驗收標準

- 載入範例後不做任何修改直接另存，輸出與原檔逐字相同。
- 新增空白 View 後另存，既有 Views 與非相關配置保持不變；刪除被導覽引用的 View 後，不留下其 layout 參照，起始頁指向仍存在的 View。
- 新增空白 View 後，`items` 與 `svgcontent` 均包含位於左上方、文字等於 View 名稱的 FUXA 原生 Label；改名後兩者同步更新。
- 在任一 View 批次新增 N 個 Tag 元件：預覽依 Grid 顯示，匯入 FUXA 後每個元件綁定正確 Tag、Label 文字正確、位置與預覽一致。
- 刪除／修改後 `items` 與 `svgcontent` 無孤兒項目。
- 未編輯的 View、`devices`、`scripts`、`hmi.layout` 與原檔深度相等。
- 全程無網路請求；原檔不被改動。
