# FUXA View 多狀態元件 — 工程開發設計

> 對應需求：[FUXA-View多狀態元件需求規格.md](./FUXA-View多狀態元件需求規格.md)（以下簡稱「規格」，規則編號 R1–R11、待決事項 Q1–Q8）。
> 範圍：`fuxaViewEditor/`。分層遵循 [React-TS-AntD重構詳細設計.md](./React-TS-AntD重構詳細設計.md)：狀態規則與 FUXA 結構在 `domain/`／`features/`，`App.tsx` 只做組裝。
> 狀態：設計已依使用者決議更新；編輯器端實作進行中。FUXA 執行期驗證由使用者自行執行，尚未確認通過。

## 1. 目標與非目標

- 新增「多狀態圖示組」（圖示庫項目）與「多狀態元件」（template `icon-multi`），一個設備 Label、N 張狀態圖示、N 個 Boolean Tag、可設定優先順序。
- 既有 `rect`／`cylinder`／`icon`／`icon-pair` 的載入、編輯、輸出位元組級行為不變。
- 非目標：AND/OR 條件（規格 2.2）、改變 Label 行為、自動轉換既有 icon-pair（Q6 預設不轉）。

## 2. 現況程式盤點（影響點）

| 模組 | 現況 | 需要的變更 |
| --- | --- | --- |
| `domain/icons/iconLibrary.ts` | `SingleIcon`／`IconPair` 聯集；`validateIconLibrary` 對未知 type 報錯；asset id 全庫唯一 | 新增 `MultiStateIconSet`；驗證、asset 展開 |
| `features/icons/iconLibraryManagement.ts` | `addIconLibraryEntry(type 'single'｜'pair')` 以 `images.length` 判斷；`findIconLibraryUsages`／`findIconLibrarySvgUsages` 以 `iconId/normalIconId/alarmIconId` 及 `data-fuxa-icon-id` 掃描 | 新增 multi-state 建立；asset id 收集；引用掃描 |
| `domain/config/fuxaConfigExportDependencies.ts` | `iconResolver` 將 pair 展開成 asset Map；`reserveModelIds` 保留 `shapeId/alarmShapeId/labelId/shapeInnerIds` | 展開 multi-state assets；保留所有狀態 shape id |
| `domain/svg/buildComponentNodes.ts` | `SvgComponent.template`；icon-pair 產生 `tc_{seq}`／`tc_{seq}_alarm` 兩個 `<image>`，40×40 | 新增 `icon-multi` 分支，輸出 1+N 個 `<image>` |
| `domain/svg/buildComponentEntries.ts` | icon-pair 兩個 `svg-ext-shapes-select` item，用 `buildVisibilityActions` | 新增 multi 分支，輸出 1+N 個 item |
| `domain/svg/readManagedComponents.ts` | 以 `tc_{seq}` 配對，icon-pair 以「同 variableId、各 ≥2 actions」辨識 | 辨識 multi 並還原狀態綁定 |
| `domain/svg/applyModelToView.ts` | `isManagedComponent` 白名單 template；`existingItemItems`／`writeComponentEntries` 只認 `shapeId`＋`alarmShapeId`；`ensureXlinkNamespace` 判斷 icon／icon-pair | 擴充白名單、items 寫入、xlink 判斷 |
| `domain/svg/removeManagedFromView.ts` | `addComponentIds` 只收 `shapeId/alarmShapeId/labelId` | 收集所有狀態 shape id |
| `domain/svg/validateGeneratedView.ts` | `GeneratedComponent`；icon-pair 驗證同層、等尺寸、`hasVisibilityRule`、Boolean Tag；`validateDeletedComponents` 只認 `alarmShapeId` | 新增 multi 驗證；刪除檢查涵蓋所有狀態 id |
| `domain/layout/gridLayout.ts` | `template==='cylinder'` 否則 `RECT_SIZE`(40×40)；`layoutWidth/Height` 可覆寫 | multi 沿用 40×40，不需變更（見 §6.4） |
| `features/icons/componentGraphics.ts` | 選項值 `rect｜cylinder｜icon:{id}｜pair:{id}｜pair:legacy:…`；`updateComponentGraphic` 清不相干欄位 | 新增 `multi:{id}` 選項與更新邏輯 |
| `features/tags/createViewComponents.ts` | 批次建立，template 固定 `rect`；`collectUsedIds` 收集 shapeId/labelId/alarmShapeId | 支援批次指定圖示組；收集狀態 id |
| `App.tsx` | 圖示庫對話框（約 1271–1340）、已管理元件列（約 1925–2040）、`handleUpdateGraphic`（644）、`handleAddIcon`/刪除（1015–1060）、批次 `handleBatchAdd` | 僅加入 UI 區塊與呼叫 feature；邏輯放 feature 模組 |

## 3. 資料模型

### 3.1 圖示庫項目（存於 `config.extra.fuxaSetting.icons`）

```ts
interface MultiStateIconSet {
  id: string                 // `icon-set-{rand}`
  name: string               // 唯一（不分大小寫），與現有規則一致
  type: 'multi-state'
  normal: IconAsset          // 預設／正常圖示，必填（R6）
  states: MultiStateIconDef[] // 依優先順序排序：index 0 = 最高優先（R7）
}
interface MultiStateIconDef {
  key: string                // 組內穩定識別，如 `s-{rand}`；元件綁定以此為鍵，不用 index
  name: string               // 狀態名稱，僅編輯器顯示（Q2 預設）
  asset: IconAsset           // id 全庫唯一
}
```

- `IconLibraryEntry = SingleIcon | IconPair | MultiStateIconSet`。
- 優先順序以 `states` 陣列順序表達，不另存數值，避免重複／空洞。
- **舊版相容**：舊版編輯器載入含 `multi-state` 的配置會因未知 type 報錯。屬預期；在 README 註明，且圖示庫此 type 僅在使用者建立多狀態圖示組後才出現，不影響既有配置。
- 驗證（`validateIconLibrary`）：`normal` 必填；`states.length` 介於 1 與上限（建議 `MAX_STATES = 8`，Q4）；`key` 組內唯一；狀態名稱非空且組內唯一；所有 asset id 全庫唯一（含 pair 與其他 multi-state）；MIME／Base64 沿用既有檢查。

### 3.2 元件模型（`GeneratedComponent`／`ApplyModelComponent`／`SvgComponent`）

新增 template `'icon-multi'` 與欄位：

```ts
multiIconSetId?: string                 // 引用圖示庫項目 id
multiStateBindings?: Array<{
  stateKey: string                      // 對應 MultiStateIconDef.key
  tagId: string                         // 空字串＝尚未綁定
  shapeId: string                       // 該狀態 <image> 的 id（亦為 items key）
}>
// 沿用：shapeId(= 預設/正常圖示 id)、labelId、tagId
```

- `shapeId`＝預設／正常圖示，維持「元件主 id」語意，使 `layout`、`removeManaged`、既有流程的主鍵行為不變。
- `tagId`（元件層級單一 Tag）：multi 元件以 `multiStateBindings[0].tagId` 鏡射，僅供既有「Tag 顯示名稱／批次」路徑不中斷；**以 `multiStateBindings` 為唯一真實來源**（寫入前同步，不得分歧）。
- 快照／`originalComponents` 需深拷貝 `multiStateBindings`（修正 `cloneComponents`；Undo/Redo 的 structuredClone 路徑確認不丟欄位）。
- 版本識別（Q8）：SVG `<image>` 加 `data-fuxa-icon-set-id`（圖示組 id）、`data-fuxa-state-key`（狀態 key；正常圖示用 `normal`）。載入時以此屬性辨識 multi，不靠 action 形狀猜測。

## 4. FUXA 輸出策略（核心設計）

### 4.1 優先順序表達方式 — 建議方案 A：Z 軸堆疊

FUXA 每個 item 的 `actions` 只能針對 **一個** variable 的區間做 show/hide，無法表達「Tk=true 且更高優先 Tag 皆 false」。因此：

- 同位置輸出 1+N 張 `<image>`，z 序（文件順序）由下到上：`normal`（無 actions，永遠可見）→ 優先順序最低狀態 → … → 最高優先狀態。
- 每張狀態圖示僅綁自己的 Tag：`Tag=1 → show`、`Tag=0 → hide`（沿用 `buildVisibilityActions(tagId, 1)`，與既有 icon-pair 同模式）。
- 結果：成立的規則中最上層者可見＝最高優先（R7）；全不成立時只見 normal（R6、R9）；Tag 缺值時 hide，等同不成立（R9）。
- 優點：只用已驗證的單 Tag show/hide；無執行順序競態。

**需驗證與處理**
1. 初始顯示：FUXA 載入時未收到值前狀態圖示是否預設隱藏？**【需驗證 V1】** 若不隱藏，需在 SVG 狀態圖示寫入 `display="none"`（或 `visibility`），並確認 FUXA 的 show 動作可將其轉為可見。
2. 未綁定的狀態（`tagId` 空）：不輸出該狀態圖示及 item（見 §5.6 驗證），避免永遠可見的圖層。
3. 透明圖示與下層圖示的視覺疊加不納入本版考量；不提供透明度提示或互斥 actions 備案。

### 4.2 FUXA 執行期驗證清單（階段 0，由使用者執行）

| 編號 | 驗證項 | 方式 | 不通過的處理 |
| --- | --- | --- | --- |
| V1 | 狀態圖示初始可見性、無值時隱藏 | 在目標 FUXA 載入手寫 JSON | 寫入初始 `display=none` 或改方案 |
| V2 | 同一 item 對多 variable 的 actions 行為 | 同上 | 不採備案 B |
| V3 | 同位置多 `<image>` 的點擊／事件／z 序 | 同上 | 調整輸出順序 |
| V4 | 值為 `true`/1 的 Boolean 範圍判斷（`range min=max=1`） | 現有 icon-pair 已使用，確認 N 個 variable 同時監聽正常 | — |

使用者已同意採用方案 A，並表示由使用者自行執行 FUXA 測試。V1–V4 仍待使用者在目標環境驗證；本文與編輯器實作不宣稱執行期相容性已驗證。驗證結論回填本文 §4 並更新需求規格 Q7。

## 5. 模組變更細節

### 5.1 `domain/icons/iconLibrary.ts`
- 新增型別與 `validateIconLibrary` 分支（§3.1）；導出 `expandIconAssets(icon): IconAsset[]`（single→[self]、pair→[normal, alarm]、multi→[normal, ...states.asset]）。此 helper 供 `iconResolver`、`addIconLibraryEntry` 的 id 收集、`findIconLibrary*Usages`、驗證共用，**取代各處 `icon.type === 'pair'` 手寫展開**。
- 單元測試：合法、缺 normal、重複 key／名稱、asset id 衝突、超過上限、非法 MIME。

### 5.2 `features/icons/iconLibraryManagement.ts`
- `addIconLibraryEntry` 簽章改為以 discriminated input：`{ type:'single', image } | { type:'pair', normal, alarm } | { type:'multi-state', normal, states:[{name,image}] }`（保留舊呼叫相容或同步更新呼叫點與測試）。
- ID 產生沿用 `generateId('icon', …)`＋衍生 id 檢查：`icon-set-{id}`、`{id}-normal`、`{id}-s{n}`。
- 新增 `updateMultiStateIconSet`（改名、增刪狀態、調整順序）。被元件引用時：允許改名與調整順序；**刪除被綁定的狀態需先檢查引用並阻擋**（避免元件出現孤兒 `stateKey`）。
- `findIconLibraryUsages` 以 `multiIconSetId`／`multiStateBindings` 判斷元件引用；`findIconLibrarySvgUsages` 已透過 `data-fuxa-icon-id` 掃描，multi 的每張 `<image>` 都帶此屬性即自動涵蓋。
- 引用規則：圖示組被任一元件使用 → 禁止刪除圖示組；圖示組內的狀態圖示被元件使用 → 禁止刪除該狀態。

### 5.3 `domain/svg/buildComponentNodes.ts`
- `SvgComponent['template']` 加入 `'icon-multi'`。
- 輸出順序（文件順序即 z 序）：normal → 低優先 → 高優先，每張：`<image id name="tc_{seq}"|"tc_{seq}_s{n}" data-fuxa-icon-id data-fuxa-icon-set-id data-fuxa-state-key x y 40×40 xlink:href>`。尺寸固定與 icon-pair 相同（Q5：統一縮放至框內，使用 `preserveAspectRatio`＝預設 `xMidYMid meet`）。
- 狀態圖示 id：已存在於 `multiStateBindings[].shapeId` 者沿用，否則 `allocateId('SHE')`（回寫模型，比照現有 `shapeInnerIds`/alarmShapeId 配置方式）。
- 跳過 `tagId` 空的狀態（§4.1 風險 3）。

### 5.4 `domain/svg/buildComponentEntries.ts`
- multi 分支：normal item 為 `svg-ext-shapes-select`、`property.actions: []`（或保留舊 events）；每張狀態圖示 item 為 `svg-ext-shapes-select`，`variableId = tagId`、`actions = buildVisibilityActions(tagId, 1)`、`ranges: []`。
- 保留既有 item 的未知欄位／events（以 `existingItemItems` 擴充為 `Record<id, unknown>` 依 shapeId 查找，取代固定 `shape/alarmShape/label` 三槽）。
- `writeComponentEntries` 迴圈寫入 1+N 個 items。

### 5.5 `domain/svg/readManagedComponents.ts`
- 先以 `data-fuxa-icon-set-id`＋`tc_{seq}` 前綴辨識 multi；從 `data-fuxa-state-key` 與對應 item 的 `variableId` 還原 `multiStateBindings`；未綁定（輸出時被略過）的狀態由圖示組定義補回為 `tagId: ''` 條目。
- 圖示組已不存在（被外部刪除）：保留為不可編輯項並於 UI 顯示警告，不靜默丟棄；匯出時阻擋（見 §5.6）。
- 既有 icon-pair 辨識邏輯放在 multi 之後且條件不重疊（multi 有 `data-fuxa-icon-set-id`）。

### 5.6 `domain/svg/validateGeneratedView.ts`
新增 `validateMultiStateComponent`：
- 所有輸出的 `<image>` 與 items 一一存在，同一父節點、`x/y/width/height` 一致、`localName==='image'`。
- 文件順序＝ normal → 低優先 → 高優先（檢查與圖示組 `states` 順序一致）。
- 每個狀態圖示 `hasVisibilityRule(actions, tagId, 1)`，Tag 存在且為 Boolean；normal 無 actions。
- `multiIconSetId` 於圖示庫存在且 normal／狀態 asset 均可解析。
- 同一元件內 Tag 重複的處理依 Q1 決議（預設：**禁止**同一元件內重複 Tag，驗證報錯）。
- 擴充 `validateDeletedComponents` 與 `removeManagedFromView.addComponentIds`、`reserveModelIds`、`collectUsedIds`：納入 `multiStateBindings[].shapeId`。建議引入共用 helper `getComponentShapeIds(component): string[]`（含 shapeId、alarmShapeId、狀態 ids），**取代各處手動列舉**，降低遺漏風險。
- 錯誤訊息須點出元件標籤與缺少的狀態名稱（驗收情境 5）。

### 5.7 `domain/svg/applyModelToView.ts`
- `isManagedComponent` 白名單加入 `'icon-multi'`，並要求 `multiIconSetId` 與 `multiStateBindings` 為合法陣列。
- `ensureXlinkNamespace` 條件加入 `icon-multi`。
- `resolveIcon` 需能解析 multi 的所有 asset id（由 §5.1 `expandIconAssets` 供給）。

### 5.8 `features/icons/componentGraphics.ts`
- `graphicOptions` 加入「多狀態圖示組」群組（`multi:{id}`）；`selectedComponentGraphic` 讀 `multiIconSetId`。
- `updateComponentGraphic` 切到 `multi:{id}`：`template='icon-multi'`、`multiIconSetId=id`、依圖示組 `states` 產生 `multiStateBindings`（第一個狀態綁定原 `tagId`——R11，其餘空字串）、配置 `shapeId` 保留；清除 `iconId/normalIconId/alarmIconId/alarmShapeId/invertIconState`。
- 由 multi 切到其他圖形：清除 `multiIconSetId/multiStateBindings`，並釋放狀態圖示 id（由 `removeManagedFromView` 以 `originalComponents` 清理）。
- 圖示組變更（狀態增減）後同步元件：新增狀態→補空綁定；刪除狀態被禁止（§5.2）。

### 5.9 `features/tags/createViewComponents.ts` 與批次流程（R11）
- 批次對話框新增「圖形」選擇（含多狀態圖示組）；選中時呼叫與 §5.8 相同的 helper，保證批次與列表編輯行為一致。仍一 Tag 一元件，不合併。
- 第一狀態＝「優先順序最高者」（`states[0]`）。

### 5.10 `App.tsx`（僅 UI 組裝）
- **圖示庫對話框**：類型選擇加「多狀態」；表單：預設／正常圖示上傳、狀態列（名稱＋圖示＋上／下移動鈕）、新增／移除狀態。已建立項目顯示縮圖列與優先順序標號。邏輯全放 §5.2 helper，建議拆出 `features/icons/MultiStateIconForm` 元件以免 `App.tsx` 續膨脹。
- **已管理元件列**：圖形下拉選 multi 後，展開「狀態綁定」區：每個狀態一列（名稱、圖示縮圖、Tag Select 僅列 Boolean Tag、優先順序標示）。未綁定狀態顯示提示「未綁定，不會輸出」。
- **預覽**：沿用 `prepareViewPreview`（走同一 `applyModelToView`），不另寫判斷；預設預覽狀態顯示 normal 圖。選配（階段 4）：預覽面板的狀態模擬器，不納入第一版必要範圍。
- 元件 Tag 選單：multi 元件隱藏單一 Tag Select（以綁定區取代）。

### 5.11 Undo/Redo、dirty、匯出
- 狀態綁定修改走 `handleUpdateComponent`（現有 history／dirty 通道），無新機制；確認 `editorHistory` 快照包含 `multiStateBindings`。
- 圖示庫修改沿用現有 `iconLibrary` dirty 機制（`prepareFuxaConfigExport` 依 `originalIconLibrary` 比對）。
- 匯出前驗證（§5.6）：任何 multi 元件引用不存在圖示組、狀態圖示缺失、Tag 非 Boolean → 阻擋並指出元件與狀態。

## 6. 已確認決議（Q1–Q8）

| Q | 預設決議（用於開發） | 理由 |
| --- | --- | --- |
| Q1 Tag 重複 | 同一元件內禁止重複；跨元件允許 | 重複 Tag 會使多層同時顯示，優先順序無意義 |
| Q2 狀態名稱 | 僅編輯器顯示 | 輸出畫面不含額外文字 |
| Q3 優先順序 UI | 上／下移動鈕＋序號，第 1 = 最高優先 | 實作簡單、無障礙友善；拖曳可日後加 |
| Q4 上限 | 8 個狀態 | 避免過多疊層 |
| Q5 尺寸 | 統一 40×40，`meet` 縮放 | 與 icon-pair 相同，沿用排版 |
| Q6 icon-pair 轉換 | 不自動轉換；使用者另建圖示組後改選 | 降低風險 |
| Q7 FUXA 能力 | 採用方案 A（z 序堆疊）；V1–V4 尚待使用者在目標環境驗證 | 使用者將自行執行階段 0；相容性未確認 |
| Q8 版本識別 | `data-fuxa-icon-set-id`／`data-fuxa-state-key` | §3.2 |
| 透明圖示 | 不作為本版設計限制；不提示、不增加備案 | 使用者已確認暫不考慮 |

## 7. 實作階段

| 階段 | 內容 | 完成條件 |
| --- | --- | --- |
| 0 | 使用者在目標 FUXA 執行期驗證 V1–V4，回填 §4 | 確認預設顯示、Boolean 切換及圖層優先序 |
| 1 | 圖示庫：型別、驗證、`expandIconAssets`、新增／更新／刪除／引用掃描 + 測試 | `yarn test` 圖示相關全綠；既有 pair/single 測試不變 |
| 2 | 元件層：`getComponentShapeIds`、build nodes/entries、read、apply、remove、validate + 往返測試 | 生成→匯出→重新載入→再生成結果一致；既有黃金／回歸測試不變 |
| 3 | UI：圖示庫多狀態表單、已管理元件綁定區、`componentGraphics`、批次圖形選擇 | 瀏覽器操作驗證驗收情境 1–8 |
| 4 | README／重構文件更新、錯誤訊息打磨、選配狀態模擬預覽 | 文件同步 |

每階段結束執行：`yarn typecheck`、`yarn lint`、`yarn test`、`yarn build`，UI 階段加瀏覽器驗證。

## 8. 測試計畫

**單元（`tests/domain`、`tests/features`）**
- `iconLibrary.test.ts`：multi-state 驗證與 `expandIconAssets`。
- `iconLibraryManagement.test.ts`：新增／改名／調順序／刪除阻擋／引用掃描（元件與 SVG）。
- `buildComponentNodes/Entries.test.ts`：節點順序＝z 序、屬性、items actions、略過未綁定狀態、保留舊 events。
- `readManagedComponents.test.ts`：往返、圖示組缺失、舊 icon-pair 不誤判。
- `validateGeneratedView.test.ts`：各錯誤路徑（缺圖、重複 Tag、非 Boolean、順序錯誤）。
- `removeManagedFromView.test.ts`／`applyModelToView.test.ts`：刪除元件清除全部狀態圖示與 items；切換圖形不殘留舊節點。
- `createViewComponents.test.ts`：批次指定 multi、Tag 綁定到 `states[0]`、不合併列。

**回歸**：既有 141 項測試必須維持通過；rect／cylinder／icon／icon-pair 輸出不得改變。

**整合／手動**：驗收情境 1–8；以水箱樣本（異常／高水位／低水位）匯出後於目標 FUXA 驗證；Undo/Redo；手動預覽模式。

## 9. 風險

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 初始可見性（V1） | 載入瞬間誤顯示 | 寫入初始 `display=none` 或改方案 |
| 各處手動列舉 shape id 遺漏 | 殘留 SVG／items | `getComponentShapeIds` 單一來源＋測試 |
| `App.tsx` 膨脹 | 可維護性 | 新 UI 拆元件；邏輯留 feature |
| 舊版編輯器開新配置 | 載入報錯 | README 註明；僅用過多狀態才出現 |
| 圖示組狀態被修改後元件不同步 | 孤兒綁定 | 刪除阻擋＋增狀態自動補綁定 |

## 10. 階段 0 驗證責任

使用者將自行在目標 FUXA 測試環境驗證階段 0 的 V1–V4；目前不要求提供環境存取權，開發可先進行。驗證時應使用可還原的測試 View，避免直接修改正式配置。執行期結果回報後，需確認是否要調整 §4 的輸出策略。
