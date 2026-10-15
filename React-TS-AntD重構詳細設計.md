# React + TypeScript + Ant Design 重構詳細設計（工程師版）

> 依據：[React-TS-AntD重構大綱.md](./React-TS-AntD重構大綱.md)
> 現況參考：[README.md](./README.md)、[FUXA-View元件批次工具-開發文件.md](./FUXA-View元件批次工具-開發文件.md)、[tests/domain.test.cjs](./tests/domain.test.cjs)
> 狀態：草案。標示「**待決策**」的項目需在對應階段開始前確認。

---

## 1. 目標與硬性約束

### 1.1 目標
1. 以 React + TypeScript + Ant Design 取代原生 DOM 操作的 UI。
2. 將 FUXA 資料規則、SVG 生成、應用狀態、UI 四層分離。
3. 逐階段遷移，每階段皆可驗證、可回退。

### 1.2 硬性約束（驗收的底線）
| # | 約束 | 說明 |
|---|------|------|
| C1 | **輸出 JSON 位元組級等價** | 未修改配置時直接輸出原始文字；有修改時，新舊版在相同操作下輸出內容必須相同（見 §9 黃金檔測試）。 |
| C2 | 保留未知欄位 | 工具不認得的 FUXA 欄位、`extra`、未管理 SVG 元素原樣保留。 |
| C3 | 序列化策略不變 | 未修改時保留來源 JSON 原始文字（包含局部格式）；修改後使用 `JSON.stringify(data, null, 4)`，依原檔還原 CRLF/LF 與結尾換行。 |
| C4 | 本機離線 | 不使用 CDN、不對外傳送資料；字型與圖示隨建置產物一併打包。 |
| C5 | Tag 以 ID 識別 | 不假設名稱唯一。 |
| C6 | `items` ↔ `svgcontent` 同步 | 兩者以相同 id 對應，增刪必須成對。 |

---

## 2. 現況盤點

### 2.1 檔案與規模
| 檔案 | 大小 | 角色 |
|------|------|------|
| `index.html` | ~21 KB | 靜態版面與全部對話框（`<dialog>`） |
| `styles.css` | ~16 KB | 全域樣式 |
| `domain.js` | ~50 KB | UMD 純資料函式，掛載為 `window.FuxaToolDomain`，Node 以 `require` 載入 |
| `app.js` | ~125 KB（約 3000 行） | 單一 IIFE：全域 `state`、DOM 查詢、事件綁定、渲染、SVG 生成、業務流程 |
| `tests/domain.test.cjs` | ~27 個測試 | 僅覆蓋 `domain.js` |

### 2.2 `app.js` 責任分佈（依現有函式行號歸類）

| 區段（約略行號） | 內容 | 遷移去向 |
|---|---|---|
| 9–40 `state` | 全域可變狀態（config、原始快照、models、baselines、各種 used ID 集合、undo/redo） | `app/store`（§5） |
| 185–360 | 元件序號、樓層簽章、SVG 量測（`measureSvgItem`）、可移動 Tag 判定、既有 Label 配對、ID 配置 | `domain/svg`、`domain/model` |
| 384–470 `loadConfig` | 解析、驗證、建立 models/baselines | `features/config` 的 use-case |
| 469–555 | `modelSnapshot` / undo / redo | store middleware（§5.3） |
| 555–935 | 以 `createElement` 建立 select、row、圖示庫、View 清單 | React 元件 |
| 940–1375 | **SVG 節點生成與 `applyModelToView`**（shape/label/floor frame/icon pair → `items` + `svgcontent`） | `domain/svg`（純函式，不含 React） |
| 1392–1500 | 預覽渲染、`sanitizePreview`、`isDirty` | `features/preview`、store selector |
| 1558–1765 | View 新增/改名/刪除 | `features/views` |
| 1765–1900 | 批次選 Tag 對話框 | `features/components` |
| 1901–2110 | `validateGenerated`、`saveConfig` | `domain/validation`、`features/config` |
| 2111–2310 | 圖示檔讀取（Base64、格式辨識） | `features/icons`、`domain/icons` |
| 2309–2810 | 設備與 Tag 管理、批次建立、位址位移 | `features/devices` |
| 2814–結尾 | 樓層管理 | `features/floors` |

### 2.3 `domain.js` 對外 API（需逐一型別化）
- 驗證／索引：`validateConfig`、`buildTagIndex`、`hasViewShape`
- Grid／樓層：`normalizeGridSettings`、`get/saveViewGridSettings`、`get/saveFloorGroupFrameSettings`、`get/saveFloorGroupArtifacts`、`normalizeFloor`、`get/setTagFloor`、`compareFloors`、`groupByFloor`、`groupComponentsByFloor`
- 圖示：`validateIconLibrary`、`get/saveIconLibrary`、`buildVisibilityActions`
- SVG／版面：`parseSvg`、`findById`、`readManaged`、`layoutComponents`、`layoutFloorComponents`、`measureSvgText`、`getSvgTextBounds`
- 序列化／ID：`serializeConfig`、`generateId`、`removeLayoutViewReferences`
- Modbus／Tag：`createModbusTcpDevice`、`updateModbusTcpDevice`、`normalizeModbusTcpAddressCount`、`getModbusTcpAddressFillPlan`、`getModbusTcpAddressShiftPlan`、`shiftModbusTcpAddresses`、`fillModbusTcpAddressGaps`、`getNextAvailableAddress`、`parseTagBatchInput`、`batchCreateTags`、`syncDeviceConnectionTag`、`removeDevice`

### 2.4 已知結構性問題（重構要解決的點）
1. **UI 與資料規則交織**：SVG 生成（約 450 行）、驗證（約 130 行）都在 `app.js`，只能靠手動測試。
2. **全域可變 `state`**：多個 `Map`／`Set` 彼此需手動同步（`models`、`baselines`、`usedIds`…），易出現不一致。
3. **Undo/Redo 靠整體快照**（`modelSnapshot`，上限 50）：能運作，但哪些欄位納入快照是隱含規則。
4. **dirty 判定分散**：`isDirty()` 需要比對 8 種「original*」快照。
5. **domain 以 `DOMParser` 注入**（`readManaged(view, Parser, …)`），Node 測試需提供解析器；新架構需統一。

---

## 3. 技術選型與專案設定

| 項目 | 選擇 | 備註 |
|------|------|------|
| 建置 | Vite 8（已建立） | 輸出靜態檔；`base: "./"` 以支援相對路徑與子資料夾部署 |
| 語言 | TypeScript（`strict: true`、`noUncheckedIndexedAccess: true`） | FUXA 未知欄位使用 `unknown` + 型別守衛，避免 `any` |
| UI | React 19 + Ant Design 6（專案既有版本） | 搭配 `@ant-design/icons`，全部本機打包；遷移依專案實際版本，不回退 React 18／Ant Design 5 |
| 狀態 | **待決策**：`useReducer` + Context，或 Zustand | 建議先 `useReducer`；若 selector 效能不足再換（見 §5.4） |
| 測試 | Vitest 5（已加入）＋ React Testing Library（元件）＋ Playwright（E2E，選用） | Vitest 用於新版 TS 測試；舊版 `node:test` 暫時保留 |
| XML 解析 | 瀏覽器 `DOMParser`；測試環境用 `happy-dom` 或 `jsdom` | 統一以 `parseSvg()` 包裝（§4.3） |
| Lint／格式 | ESLint（typescript-eslint、react-hooks）＋ Prettier | 與現有程式風格（2 空白、雙引號）對齊 |
| Node | 固定 LTS 版本，寫入 `engines` 與 `.nvmrc` | |

### 3.1 目錄結構

Vite 專案已建立於 `fuxaViewEditor/`，因此該資料夾是新版應用程式根目錄；既有原生版目前留在上一層 `fuxaSetting/`。遷移期間不把舊版檔案移入新版專案，也不與新版的 `index.html` 混淆。舊版先作為對照與回退來源，後續是否封存或移除依階段 6 決策。

```text
fuxaSetting/                         # 工作區／既有原生版所在目錄
  app.js                             # 舊版 UI 與應用流程（遷移參考）
  domain.js                          # 舊版 domain 函式（遷移參考）
  index.html                         # 舊版入口；不是 Vite 入口
  styles.css                         # 舊版樣式
  tests/
    domain.test.cjs                  # 舊版 domain 回歸測試
  React-TS-AntD重構大綱.md
  React-TS-AntD重構詳細設計.md
  fuxaViewEditor/                    # 新版 React + TypeScript + Vite 專案根目錄
    index.html                       # Vite 入口 HTML
    package.json
    yarn.lock
    vite.config.ts
    tsconfig.json
    tsconfig.app.json
    tsconfig.node.json
    eslint.config.js
    public/                          # 不經模組匯入的靜態資產
      favicon.svg
      icons.svg
    src/
      main.tsx                       # React 啟動點
      app/
        App.tsx                      # 全域 Layout、Ant Design ConfigProvider
        store/                       # reducer、actions、selectors、history
        providers/
      domain/                        # 純 TypeScript；不依賴 React／Ant Design
        types/                       # FUXA 與執行期 Model 型別
        config/                      # validate、index、serialize
        tags/                        # floor、batch parse、tag 建立
        devices/                     # Modbus 相關規則
        layout/                      # Grid、floor layout、文字量測
        svg/                         # SVG 解析、節點生成、applyModelToView
        icons/
        ids/
      features/
        config/                      # 開檔、驗證、另存
        views/                       # View 管理
        components/                  # 元件清單與編輯
        preview/                     # 唯讀 SVG 預覽
        devices/                     # 設備與 Tag 管理
        floors/                      # 樓層管理
        icons/                       # 圖示庫管理
      shared/
        ui/                          # 共用 Ant Design 組合元件
        hooks/
        utils/
      assets/                        # 由程式匯入並參與建置的資產
    tests/
      domain/                        # 遷入後的 domain 單元測試
      store/                         # reducer／history 測試
      components/                    # React Testing Library 測試
      fixtures/                      # 測試輸入與黃金輸出
      e2e/                            # Playwright 測試（若採用）
    dist/                            # Vite 建置產物（忽略版本控制）
```

說明：
- `fuxaViewEditor/src/App.tsx`、`App.css`、`index.css` 是目前 Vite 範本檔案；依階段逐步搬入 `src/app/` 與 `src/features/`，不要求一次搬完。
- 測試遷移完成前，舊版測試仍在 `fuxaSetting/tests/domain.test.cjs`；新版測試放在 `fuxaViewEditor/tests/`，避免兩套測試與設定混在一起。
- 舊版 JSON 樣本及需求／開發文件目前也在 `fuxaSetting/`；只有確認需由新版測試使用的 fixture 才複製到 `fuxaViewEditor/tests/fixtures/`，不要直接將使用者配置檔搬進 `public/` 或正式建置產物。
- `node_modules/` 不列入結構，並應加入版本控制忽略清單。

依賴方向（以 ESLint `no-restricted-imports` 強制）：

```text
src/features → src/app/store → src/domain
src/shared   → src/domain（限共用型別／純工具，不依賴 features 或 app）
src/domain   ✗ 不可 import react / antd / features / app
```

---

## 4. Domain 層設計

### 4.1 型別建模原則
- **FUXA 原始結構用「寬鬆已知欄位 + 索引簽名」**，確保 round-trip 不遺失資料：

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface FuxaConfig {
  devices: Record<string, FuxaDevice>;
  hmi: { views: FuxaView[]; layout?: Json; [k: string]: Json | undefined };
  extra?: { fuxaSetting?: FuxaSettingExtra; [k: string]: Json | undefined };
  [k: string]: unknown;            // 其他頂層欄位原樣保留
}
interface FuxaView {
  id: string; name: string;
  profile: { width: number; height: number; [k: string]: unknown };
  items: Record<string, FuxaItem>;
  svgcontent: string;
  [k: string]: unknown;
}
interface FuxaTag { id: string; name: string; type: string; extra?: { floor?: string; [k: string]: unknown }; [k: string]: unknown }
```

- **工具設定命名空間**（`extra.fuxaSetting`）獨立型別：`viewGrids`、`icons`、`floorGroupFrames`、`floorGroupArtifacts`。
- **執行期 Model（工具自己的資料）與 FUXA 原始資料分離**：Model 是「元件清單、Grid、樓層框」；FUXA 原始 JSON 只在載入與 `applyModelToView` 時接觸。

### 4.2 Model 型別（取代目前 `state.models`/`baselines` 隱含結構）

```ts
interface ViewModel {
  viewId: string;
  components: ManagedComponent[];   // 工具建立或已辨識的 Tag 元件
  existingTagComponents: MovableTagComponent[]; // 既有 SVG Tag 元件（只平移）
  grid: GridSettings;
  readOnlyReason?: string;          // 無法解析的 View 唯讀保留
}
```
實作前須先從 `app.js` 的 `makeComponent`、`readManaged`、`prepareMovableTagComponents` 反推欄位，**逐欄位建表並標註來源**（列入階段 2 的產出）。

### 4.3 遷移規則（`domain.js` → `src/domain/**`）
1. **一次搬一個子模組**（見 §3.1 結構），每次搬遷後既有測試必須全綠。
2. 先機械式轉換（只加型別，不改邏輯）；**邏輯修正另開 PR**，避免和型別化混在一起。
3. `parseSvg(svgText, Parser)` 保留注入形式，預設參數使用 `globalThis.DOMParser`；測試環境由 happy-dom 提供。
4. 移除 UMD 包裝，改 ES Module 具名匯出；舊版在 `legacy/` 仍使用原檔，不共用。
5. 隨機 ID 生成維持 `generateId(prefix, usedIds, cryptoObject)` 的可注入設計，以便測試固定結果。

### 4.4 從 `app.js` 抽出的純函式（階段 3 前置）
`measureSvgItem`、`hasSvgTransform`、`prepareMovableTagComponents`、`attachExistingTagLabels`、`build*Node`、`build*Entry`、`insertFloorFrameNode`、`applyModelToView`、`validateGenerated` 均須改寫為「輸入 → 輸出」函式，不得讀取全域 `state` 或 `elements`。目前它們依賴 `state` 的部分（如 `state.tags`、`state.iconLibrary`、`state.floorGroupFrame`）改為**明確參數**。

---

## 5. 應用狀態設計

### 5.1 單一資料來源
```ts
interface AppState {
  source: { fileName: string; text: string; lineEnding: "\n" | "\r\n"; trailingNewline: boolean } | null;
  config: FuxaConfig | null;            // 目前（已含設備／Tag 變更）
  baseline: Baseline | null;            // 載入時的凍結副本，用於 dirty 與 diff
  models: Record<ViewId, ViewModel>;
  tools: { floorGroupFrame: FloorGroupFrame; iconLibrary: IconAsset[] };
  ui: { selectedViewId: string; selectedDeviceId?: string };
  history: { past: Snapshot[]; future: Snapshot[] };
}
```
- `usedIds`／`usedViewIds`／`usedDeviceIds`／`usedTagIds`／`createdIds` **不放入 state**，改為由 `config`＋`models` 以 selector 推導（memoized），消除手動同步。
- 載入時一次性產出 `baseline`，取代現有 `original*` 8 個欄位。

### 5.2 Action 清單（初版）
`config/loaded`、`view/selected`、`view/created|renamed|deleted`、`component/added|updated|moved|removed`、`grid/updated`、`device/created|updated|deleted`、`device/addressesShifted`、`tag/batchCreated`、`tag/floorSet`、`floorFrame/updated`、`icon/added|removed`、`history/undo|redo`。
每個 action 的 reducer 為純函式並有單元測試；失敗（驗證不過）以回傳 `Result` 而非 throw，由 UI 轉為 `message.error`。

### 5.3 Undo/Redo
- 沿用「快照」模型（上限 50），但**明確定義快照範圍**：`config`（devices/tags/views 變更）、`models`、`tools`。**不含** `ui` 與 `history`。
- 以結構共享（immer）降低複製成本；若採 immer 需確認大型 JSON（>600 KB 的範例檔）的效能。
- 將「哪些 action 可 undo」列為表格並測試（View 刪除與設備刪除是否可 undo 需與現況一致，**實作前以現有行為為準**）。

### 5.4 效能注意
- 大型配置（範例檔最大約 640 KB）：`config` 不要放進 React Context 造成全樹重繪；使用 selector 訂閱（Zustand 或 `use-context-selector`）。**待決策**：階段 3 以 profiler 結果決定。
- `svgcontent` 解析結果以 `useMemo`／快取，避免每次輸入都重新解析。

---

## 6. UI 層設計（Ant Design 對映）

### 6.1 版面
`Layout` → `Header`（開檔／另存／Undo／Redo／入口按鈕）＋ `Sider`（View 清單）＋ `Content`（左：元件清單，右：預覽）。狀態訊息使用 `message` / `Alert`，離開頁面防呆使用 `beforeunload`（對應 dirty）。

### 6.2 舊 UI → Ant Design 對映表

| 現有 UI | Ant Design | 備註 |
|---|---|---|
| 檔案載入 `<input type=file>` | `Upload`（`beforeUpload` 回傳 false，自行讀取） | 保留 `accept=".json"` |
| View 清單 | `Menu` 或 `List` ＋ 新增/改名/刪除 `Button` | 刪除用 `Modal.confirm` |
| 新增/改名 View | `Modal` + `Form` | 名稱不可空白、不可重複（同現有規則） |
| 元件清單 `#component-rows` | `Table`（可編輯列）或 `List` | 列數大時啟用 `virtual` |
| 圖形／狀態色／Tag 下拉 | `Select`（`showSearch`） | Tag 選項以「設備名／Tag 名」顯示，值為 Tag ID |
| 批次選 Tag 對話框 | `Modal` + `Table rowSelection` + 搜尋 `Input` | |
| 設備/Tag 管理 | `Modal` + `Tabs` ＋ `Form` | 兩個分頁：設備、批次建立 Tag |
| 批次 Tag 預覽 | `Table` | 對應 `renderBatchTagPreview` |
| 樓層管理 | `Modal` + `Segmented`（分組/清單）＋ `Collapse`/`Table` | 多選批次套用 |
| 圖示庫 | `Modal` + `Form` + `Upload` | Base64 資料來源維持不變 |
| Grid 設定 | `Form`（`InputNumber`、`Select`） | |
| 預覽 | **自訂 SVG 元件**（不使用 Antd） | 見 §6.4 |

### 6.3 表單與驗證
- 驗證規則來自 domain（單一來源），Antd `Form.Item rules` 只呼叫 domain 的驗證函式。
- 危險操作（刪除 View、刪除設備、位址整批位移）保留確認視窗與原有提示文字。
- 繁體中文語系：`ConfigProvider locale={zhTW}`；既有提示文字保持原文，避免行為文件失效。

### 6.4 預覽
- 輸入：`ViewModel` + `config` → `applyModelToView` 產生的 `svgcontent` → `sanitizePreview` → 透過 React 渲染 SVG（優先以 DOM 節點轉 React 元素；若成本過高才使用 `dangerouslySetInnerHTML`，**且必須先經 sanitize**）。
- **沿用現有 `sanitizePreview` 規則**並補測試（移除 script、事件屬性、外部連結等）。
- 預覽唯讀，不加入拖曳。

---

## 7. 遷移計畫（工作拆解）

每階段：**範圍 → 交付物 → 驗收 → 回退**。

### 階段 0：基線凍結
- 建立 `tests/fixtures/`：以現有範例 JSON（`旭峰建設.json`、`測試visible.json`、`圖示用測試.json`…）搭配**舊版**執行代表性操作，產出「黃金輸出」（§9.1）。
- 舊版檔案暫留在 `fuxaSetting/` 根目錄，不移入 `fuxaViewEditor/`；新版與舊版分開執行，舊版作為行為參考及回退來源。完成遷移後再決定是否封存或移除。
- **驗收**：`npm test` 仍全綠；黃金檔產生流程文件化。

### 階段 1：工具鏈
- **已完成基礎建立**：`fuxaViewEditor/` 已有 Vite 8、React 19、TypeScript、Ant Design 6、ESLint；已加入 Vitest 5。
- **目前進行中**：實作 `ConfigProvider` + Layout，完成本機 JSON 載入與 View 摘要顯示；補齊 lint、test、typecheck 與 build 驗證。
- 後續驗證建置產物離線可用：以 `yarn build` 後斷網測試 `vite preview`／靜態伺服器。
- CI（若有）：lint、typecheck、test、build。
- **驗收**：建置產物不含外部網路請求（可用瀏覽器 DevTools Network 檢查）。

### 階段 2：Domain 遷移（無 UI）
- 依 §4.3 逐模組搬遷，優先順序（依賴由少到多）：
  1. `ids`、`config/serialize`、`config/validate`、`tags/floor`
  2. `layout`（grid、floor layout、text measure）
  3. `icons`、`devices`（modbus）、`tags/batch`
  4. `svg`（`parseSvg`、`readManaged`）
- **已完成切片**：`config/validate`、來源文字格式偵測／序列化工具、`tags/floor`（樓層正規化、Tag metadata、排序分組）、`layout/gridSettings`（View Grid 的讀取、正規化與保存）。
- **已完成切片**：`layout/gridLayout` 的元件尺寸、行列定位、四種 Label 位置，以及 SVG 文字近似量測／Bounds 計算。
- **已完成切片**：`layout/floorGroupFrame` 的底框設定正規化、讀取與保存；`layout/floorLayout` 的樓層排序分組、區段排版、底框 bounds 與既有 Tag companion bounds。
- **已完成切片**：`layout/floorGroupArtifacts` 的樓層標題／底框 SVG ID 索引讀取、保存、完整性驗證及已刪除 View 的資料清理。
- **已完成切片**：`ids` 的唯一 ID 產生與碰撞重試；`devices/modbusTcp` 的設備建立／更新、位址補位規劃與執行、位址位移及範圍檢查；`tags/batch` 的批次輸入解析、樓層正規化、Tag 建立與下一位址計算。
- **已完成切片**：`devices/deviceManagement` 的 FuxaServer 連線狀態 Tag 建立／改名同步，以及移除設備時清理其連線狀態 Tag。
- **已完成切片**：`tags/index` 的全域 Tag 索引（含設備與樓層資訊）；`views/view` 的 View 結構驗證，以及刪除 View 時遞迴清理導覽參照並替換起始 View。
- **已完成切片**：`views/viewManagement` 的 View 名稱去空白／不分大小寫重複檢查、改名，以及刪除 View 時選取後續或前一個 View 作為 fallback、保護最後一個 View並清理導覽引用。
- **已完成切片**：`icons/iconLibrary` 的圖示庫讀取、保存、Base64/MIME 與唯一 ID 驗證、一般及正常／告警圖示組，以及 Boolean 可見條件動作產生。
- **已完成切片**：`svg/parseSvg` 的 SVG MIME 解析與根節點／解析錯誤檢查，以及依 ID 查找 SVG 節點；`svg/readFloorArtifacts` 已遷移 Floor Group 標題／底框節點索引、重複 artifact 收集、已保存 ID 優先及未標記底框的座標推斷；`svg/readMovableTags` 已遷移既有 SVG Tag 的可移動性檢查（ID 重複、支援元素、節點／上層 transform）；`svg/readManagedComponents` 已遷移一般元件／圖示／正常告警圖示組與 Label 配對、Palette、內層 SVG ID 及 visibility state 解析；`svg/readManaged` 已整合上述讀取流程，維持 View/SVG 錯誤回傳形狀並合併樓層 artifacts、managed records 與既有可移動 Tag。SVG 節點生成尚未遷移。
- 新版以 Vitest 覆蓋已遷移函式；目前新版 60 項測試及舊版 28 項回歸測試均通過。舊版測試仍保留作為行為參考，尚未整批搬遷。
- 把 `tests/domain.test.cjs` 的測試改寫為 Vitest TS，**不修改斷言內容**；有改動必須在 PR 描述說明原因。
- **驗收**：全部測試通過；`domain/` 無 `react`／`antd` import；型別檢查無錯。

### 階段 3：從 `app.js` 抽出 SVG/驗證邏輯
- 將 §4.4 清單改寫成純函式，補單元測試。
- 以黃金檔比對：新 `applyModelToView` 輸出 ≡ 舊版輸出。
- **驗收**：C1、C6 通過。**這是整個重構風險最高的階段**，建議單獨 PR 系列。

### 階段 4：Store 與主流程垂直切片
- 實作 store（§5）、載入 → 選 View → 元件編輯 → 預覽 → 另存。
- 實作 Undo/Redo 與 dirty。
- **驗收**：從載入到匯出的主流程，輸出等同黃金檔；Undo/Redo 行為與舊版一致。

### 階段 5：管理功能遷移（可平行，每項獨立 PR）
| 項目 | 依賴 | 重點驗收 |
|---|---|---|
| View 新增/改名/刪除 | 階段 4 | 起始頁、`hmi.layout` 清理、至少保留一個 View |
| 批次加入 Tag | 階段 4 | 搜尋、全選、樓層預設 |
| 設備/Tag 管理 | 階段 4 | Modbus 補位、位址 ±1 與邊界整批取消 |
| 樓層管理 | 階段 4 | 多選批次、分組/清單切換、僅改 `extra.floor` |
| 圖示庫 | 階段 4 | 一般／正常告警圖示、GIF 保留、被引用不可刪 |
| Floor Group 框樣式 | 階段 4 | 同樓層重複元件合併 |

### 階段 6：收尾與切換
- 補齊 E2E（開檔→編輯→匯出）、無障礙與鍵盤操作檢查。
- 更新 `README.md`、開發文件（技術選型章節與「免安裝」描述需同步修改）。
- 新舊並行觀察期後移除 `legacy/`。**待決策**：觀察期長度與 fallback 保留方式。

### 7.1 PR 規範
- 一個 PR 一個目的（型別化／搬遷／行為修改不可混合）。
- PR 需附：影響範圍、測試結果、若涉及輸出則附黃金檔比對結果。

---

## 8. 交付與部署（需先決策）

| 方案 | 優點 | 缺點 |
|---|---|---|
| A. `vite build` 輸出 `dist/` + 啟動腳本（Node/PowerShell 起本機靜態伺服器） | 實作單純 | 使用者需啟動伺服器 |
| B. `vite-plugin-singlefile` 打包為單一 HTML | 保持雙擊開啟 | 檔案較大；`file://` 下的限制（ES module、Worker、部分 API）需實測 |
| C. 包成桌面殼（如 Tauri/Electron） | 完整離線體驗 | 額外維護成本 |

**建議**：先以 B 做可行性驗證（Spike，階段 1）：確認 `file://` 下 `DOMParser`、`Blob` 下載、`<dialog>`／Antd Modal、字型載入皆可運作；不可行則採 A。**此決策須在階段 1 結束前定案。**

---

## 9. 測試策略

### 9.1 黃金檔（Golden）測試 — 最重要
- 輸入：`tests/fixtures/*.json`（來自現有範例檔）。
- 情境腳本（以 action 序列描述，而非 UI 操作）：新增元件、批次加入、樓層分組、Grid 變更、圖示庫、新增/改名/刪除 View、設備位址位移、補位。
- 執行：**舊版 domain＋app 邏輯**（階段 0 取得）→ 期望輸出；新版 → 實際輸出；位元組比對。
- 原始檔過大（600 KB）不影響 Git 時，期望輸出可存檔；否則存雜湊並於 CI 重建。**待決策**：大型 fixture 是否使用 Git LFS。

### 9.2 測試層級
| 層級 | 工具 | 目標 |
|---|---|---|
| Domain 單元 | Vitest | 純函式、邊界（位址 0/65535、重複名稱、轉換失敗） |
| Reducer/Store | Vitest | Action → State；Undo/Redo；dirty |
| 元件 | RTL | 表單驗證、對話框流程、選取行為 |
| 整合 | Vitest + happy-dom | 載入 → 編輯 → `saveConfig` 輸出驗證（含 `validateGenerated`） |
| E2E（選用） | Playwright | 真實瀏覽器開檔、下載檔案內容比對 |
| FUXA 相容 | 手動 | 將產生檔匯入實際 FUXA，檢查顯示與 Tag 綁定（每個版本發佈前） |

### 9.3 必測案例清單（節錄）
- 序列化：CRLF/LF、有無結尾換行、整數字串鍵（device `"0"`）排序。
- 保真：未知欄位、`extra` 他方欄位、未管理 SVG 元素、View 層級 `property.events`。
- 既有元件：含 `transform`、量測失敗、無法解析 View → 唯讀原因顯示且原樣輸出。
- 刪除 View：導覽引用清理、起始頁改指、最後一個不可刪。
- 位址位移：任一超界時**整批取消**；無 address 的 Tag 不變。
- 圖示：正常/告警圖示的 `property.actions` 與反轉狀態；被引用不可刪。

---

## 10. 風險登記

| 風險 | 影響 | 因應 |
|---|---|---|
| SVG 生成邏輯搬遷後輸出略有差異 | 匯入 FUXA 顯示異常 | 階段 3 以黃金檔逐位元組比對；失敗即阻擋合併 |
| 型別過窄導致未知欄位遺失 | 資料毀損 | 型別含索引簽名；「保真」測試必備 |
| Antd 表格在大量 Tag 時卡頓 | 操作不順 | 虛擬捲動；分頁；搜尋先過濾 |
| 快照式 Undo 在大檔上記憶體偏高 | 瀏覽器變慢 | immer 結構共享；限制 50 筆；實測 |
| `file://` 環境限制 | 無法雙擊使用 | §8 Spike 先驗證 |
| 遷移期間舊版仍在修 bug | 新舊分歧 | 凍結舊版功能開發；僅收重大 bug 並同步移植 |
| 團隊不熟 TS/React | 進度與品質 | 階段 1 提供範例切片與 lint 規則；Code review 檢查清單 |

---

## 11. 開發規範（摘要）

- TypeScript：禁止 `any`（例外需註解理由）；對外部 JSON 使用型別守衛而非斷言。
- React：元件保持展示性，業務規則進 domain；副作用集中在 `features/*/use*.ts`。
- 命名：domain 函式沿用舊名以便對照（例如 `getModbusTcpAddressShiftPlan`）。
- 註解：只在非顯而易見處（如 FUXA 格式的刻意行為）。
- Commit 訊息：`feat|refactor|test|chore(scope): …`。

---

## 12. 待決策清單（彙整）

1. 交付方式：單檔 HTML／本機伺服器／桌面殼（§8）。
2. 狀態管理：`useReducer`＋Context 或 Zustand（§5.4）。
3. 是否引入 immer 作為快照機制（§5.3）。
4. 大型 fixture 與黃金檔的儲存方式（§9.1）。
5. 新舊版並存的觀察期與 `legacy/` 移除時機（§7 階段 6）。
6. 是否導入 Playwright E2E 與 CI 平台。

---

## 13. 完成定義（Definition of Done）

- 舊版所有功能皆在新版可用（對照 [README.md](./README.md) 的功能清單逐項勾選）。
- 全部黃金檔測試與單元/整合測試通過；`tsc --noEmit`、ESLint 無錯誤。
- 建置產物離線可用，且無外部網路請求。
- 至少一份產生檔已在實際 FUXA 環境匯入驗證。
- README 與開發文件已更新；`legacy/` 依決策移除或封存。
