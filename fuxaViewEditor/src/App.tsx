import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import zhTW from 'antd/locale/zh_TW'
import {
  parseFuxaConfig,
} from './domain/config/parseFuxaConfig'
import { generatedFileName } from './domain/config/serialization'
import { prepareFuxaConfigExport } from './domain/config/prepareFuxaConfigExport'
import { createFuxaConfigExportDependencies } from './domain/config/fuxaConfigExportDependencies'
import { buildViewEditorModels } from './domain/views/buildViewEditorModels'
import { deleteView, renameView, validateViewName } from './domain/views/viewManagement'
import { buildTagIndex } from './domain/tags/index'
import { DEFAULT_GRID } from './domain/layout/gridSettings'
import { getFloorGroupFrameSettings } from './domain/layout/floorGroupFrame'
import { findSvgElementById, parseSvg } from './domain/svg/parseSvg'
import { prepareViewPreview } from './features/preview/prepareViewPreview'
import { createViewComponents } from './features/tags/createViewComponents'
import { createBlankView } from './features/views/createBlankView'
import type { FuxaViewSummary, ParsedFuxaConfig } from './domain/config/types'
import type { ExportViewModel } from './domain/config/prepareFuxaConfigExport'
import type { Bounds, FloorLayoutComponent } from './domain/layout/floorLayout'
import type { GridSettings } from './domain/config/types'
import type { IndexedTag } from './domain/tags/index'
import {
  createEditorHistoryState,
  editorHistoryReducer,
} from './app/store/editorHistory'
import './App.css'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography

interface PreviewState {
  width: number
  height: number
  outsideCanvas?: boolean
  svgMarkup?: string
  error?: string
}

function countTags(devices: Record<string, unknown>): number {
  return Object.values(devices).reduce<number>((count, device) => {
    if (!isRecord(device) || !isRecord(device.tags)) return count
    return count + Object.keys(device.tags).length
  }, 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSelectedView(
  views: FuxaViewSummary[],
  selectedViewId: string,
): FuxaViewSummary | undefined {
  return views.find((view) => (view.id || view.key) === selectedViewId) ?? views[0]
}

function parseUpdatedConfig(
  rawConfig: ParsedFuxaConfig['rawConfig'],
  source: ParsedFuxaConfig,
): ParsedFuxaConfig {
  const parsed = parseFuxaConfig(JSON.stringify(rawConfig))
  return {
    ...parsed,
    originalText: source.originalText,
    sourceFormat: source.sourceFormat,
  }
}

function measureSvgBounds(doc: XMLDocument, id: string): Bounds {
  const node = Array.from(doc.getElementsByTagName('*'))
    .find((element) => element.getAttribute('id') === id)
  if (!node) throw new Error('找不到對應的 SVG 元件。')

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const sourceRoot = doc.documentElement
  svg.setAttribute('viewBox', sourceRoot.getAttribute('viewBox') || '0 0 1000 1000')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('width', '1000')
  svg.setAttribute('height', '1000')
  svg.setAttribute('visibility', 'hidden')
  const clone = node.cloneNode(true) as SVGGraphicsElement
  if (clone.getAttribute('data-fuxa-floor-layout') === 'floor-layout-v1') {
    clone.removeAttribute('transform')
  }
  svg.append(clone)
  document.body.append(svg)
  try {
    const bounds = clone.getBBox()
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
        || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error('無法取得有效的 SVG 外框。')
    }
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  } finally {
    svg.remove()
  }
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewNameForm] = Form.useForm<{ name: string }>()
  const [messageApi, contextHolder] = message.useMessage()
  const [fileName, setFileName] = useState('')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [viewDialogMode, setViewDialogMode] = useState<'create' | 'rename' | null>(null)
  const [viewDialogTargetId, setViewDialogTargetId] = useState('')
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [editor, dispatchEditor] = useReducer(
    editorHistoryReducer<ExportViewModel, ParsedFuxaConfig>,
    createEditorHistoryState<ExportViewModel, ParsedFuxaConfig>(),
  )
  const [modelErrors, setModelErrors] = useState<Map<string, string>>(new Map())
  const [unsupported, setUnsupported] = useState<Map<string, string[]>>(new Map())
  const { models, modifiedViewIds } = editor
  const config = editor.document
  const isDirty = editor.configurationDirty || modifiedViewIds.size > 0

  useEffect(() => {
    if (!isDirty) return

    function preventDataLoss(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventDataLoss)
    return () => window.removeEventListener('beforeunload', preventDataLoss)
  }, [isDirty])

  const selectedView = useMemo(
    () => config ? getSelectedView(config.views, selectedViewId) : undefined,
    [config, selectedViewId],
  )
  const selectedModel = selectedView ? models.get(selectedView.id) : undefined
  const tags = useMemo(
    () => config ? [...buildTagIndex(config.rawConfig).values()] : [],
    [config],
  )
  const filteredBatchTags = useMemo(() => {
    const query = batchSearch.trim().toLocaleLowerCase()
    return tags.filter((tag) => (
      `${tag.deviceName} ${tag.name} ${tag.type} ${tag.id} ${tag.floor}`
        .toLocaleLowerCase()
        .includes(query)
    ))
  }, [batchSearch, tags])
  const selectedBatchCount = filteredBatchTags.filter((tag) => batchSelection.has(tag.id)).length
  const usedTagIds = new Set(selectedModel?.components.map((component) => component.tagId) ?? [])
  const tagCount = config ? countTags(config.devices) : 0
  const preview = useMemo((): PreviewState | null => {
    if (!config || !selectedView) return null

    try {
      return prepareViewPreview(config.rawConfig, selectedView.id, [...models.values()], {
        Parser: DOMParser,
        serialize: (doc) => new XMLSerializer().serializeToString(doc),
        crypto: window.crypto,
      })
    } catch (error) {
      return {
        width: selectedView.width || 1024,
        height: selectedView.height || 768,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [config, models, selectedView])

  async function loadFile(file: File) {
    setIsLoading(true)
    try {
      const text = await file.text()
      const parsed = parseFuxaConfig(text)
      const editorModels = buildViewEditorModels(parsed.rawConfig, DOMParser, measureSvgBounds)
      dispatchEditor({
        type: 'reset',
        models: editorModels.models,
        document: parsed,
      })
      setModelErrors(editorModels.errors)
      setUnsupported(editorModels.unsupported)
      setFileName(file.name)
      setBatchDialogOpen(false)
      setBatchSearch('')
      setBatchSelection(new Set())
      const firstView = parsed.views[0]
      setSelectedViewId(firstView ? firstView.id || firstView.key : '')
      messageApi.success(`已載入 ${file.name}`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知錯誤'
      messageApi.error(`載入失敗：${detail}`)
    } finally {
      setIsLoading(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (isDirty) {
      if (!window.confirm('有尚未匯出的修改。載入新配置會捨棄目前修改，確定繼續嗎？')) return
    }
    void loadFile(file)
  }

  function handleSave() {
    if (!config) return

    try {
      const dependencies = isDirty
        ? createFuxaConfigExportDependencies(config.rawConfig, {
          Parser: DOMParser,
          serialize: (doc) => new XMLSerializer().serializeToString(doc),
          crypto: window.crypto,
        })
        : undefined
      const prepared = prepareFuxaConfigExport({
        config: config.rawConfig,
        originalText: config.originalText,
        sourceFormat: config.sourceFormat,
        dirty: isDirty,
        models: [...models.values()],
        modifiedViewIds,
        tags: buildTagIndex(config.rawConfig),
      }, dependencies)
      const blob = new Blob([prepared.text], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = generatedFileName(fileName)
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      let modelsToReset = models
      if (prepared.dirty) {
        const savedModels = new Map<string, ExportViewModel>()
        for (const model of prepared.models) {
          savedModels.set(model.viewId, {
            ...model,
            originalComponents: structuredClone(model.components),
            originalFloorTitleIds: structuredClone(model.floorTitleIds),
            originalFloorFrameIds: structuredClone(model.floorFrameIds),
          })
        }
        modelsToReset = savedModels
      }
      const savedConfig = prepared.dirty
        ? parseFuxaConfig(prepared.text)
        : config
      dispatchEditor({
        type: 'reset',
        models: modelsToReset,
        document: savedConfig,
      })
      messageApi.success(prepared.dirty ? '已匯出修改後的配置 JSON。' : '已另存配置 JSON。')
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知錯誤'
      messageApi.error(`匯出失敗：${detail}`)
    }
  }

  function openViewDialog(mode: 'create' | 'rename') {
    if (!config) return
    const targetId = mode === 'rename' ? selectedView?.id ?? '' : ''
    if (mode === 'rename' && !targetId) return
    setViewDialogMode(mode)
    setViewDialogTargetId(targetId)
    viewNameForm.setFieldsValue({
      name: mode === 'rename' ? selectedView?.name ?? '' : '',
    })
  }

  function handleViewNameSubmit(values: { name: string }) {
    if (!config || !viewDialogMode) return
    const validation = validateViewName(
      config.rawConfig.hmi.views,
      values.name,
      viewDialogMode === 'rename' ? viewDialogTargetId : undefined,
    )
    if (!validation.valid) {
      const message = validation.reason === 'empty'
        ? 'View 名稱不可空白。'
        : validation.reason === 'duplicate'
          ? `View「${values.name.trim()}」已存在，請使用不同名稱。`
          : '找不到要修改的 View。'
      messageApi.error(message)
      return
    }

    try {
      const nextRaw = structuredClone(config.rawConfig)
      const nextModels = new Map(models)
      let selectedId = selectedView ? selectedView.id || selectedView.key : ''
      if (viewDialogMode === 'create') {
        const { view } = createBlankView(
          nextRaw,
          validation.name,
          selectedView?.id ?? '',
          {
            Parser: DOMParser,
            serialize: (doc) => new XMLSerializer().serializeToString(doc),
            crypto: window.crypto,
          },
        )
        const viewId = view.id
        if (typeof viewId !== 'string') throw new Error('新增 View 缺少有效 ID。')
        nextRaw.hmi.views.push(view)
        nextModels.set(viewId, {
          viewId,
          components: [],
          originalComponents: [],
          grid: { ...DEFAULT_GRID },
          floorGroupFrame: getFloorGroupFrameSettings(nextRaw),
          floorTitles: {},
          floorTitleIds: {},
          floorFrames: {},
          floorFrameIds: {},
          floorFrameShapeIds: {},
        })
        selectedId = viewId
      } else {
        const result = renameView(nextRaw.hmi.views, viewDialogTargetId, validation.name)
        if (!result.renamed) throw new Error('找不到要修改的 View。')
        if (!result.changed) {
          setViewDialogMode(null)
          return
        }
        const titleEntry = Object.entries(isRecord(result.view.items) ? result.view.items : {})
          .find(([, item]) => isRecord(item) && item.name === 'view_title')
        if (titleEntry && typeof result.view.svgcontent === 'string') {
          const doc = parseSvg(result.view.svgcontent, DOMParser)
          const titleNode = findSvgElementById(doc, titleEntry[0])
          if (titleNode) {
            titleNode.textContent = validation.name
            result.view.svgcontent = new XMLSerializer().serializeToString(doc)
          }
        }
      }

      const document = parseUpdatedConfig(nextRaw, config)
      dispatchEditor({
        type: 'document-edit',
        document,
        models: nextModels,
      })
      setSelectedViewId(selectedId)
      setViewDialogMode(null)
      messageApi.success(viewDialogMode === 'create'
        ? `已新增空白 View「${validation.name}」。`
        : `已將 View 名稱修改為「${validation.name}」。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`View 操作失敗：${detail}`)
    }
  }

  function handleDeleteSelectedView() {
    if (!config || !selectedView || config.views.length <= 1 || !selectedView.id) return

    const previewConfig = structuredClone(config.rawConfig)
    const previewResult = deleteView(previewConfig, selectedView.id)
    if (!previewResult.deleted) {
      messageApi.error(previewResult.reason === 'last-view'
        ? '至少必須保留一個 View。'
        : '找不到要刪除的 View。')
      return
    }
    const fallbackId = previewResult.fallbackView?.id
    if (typeof fallbackId !== 'string' || !fallbackId) {
      messageApi.error('找不到可切換的替代 View。')
      return
    }
    const layout = isRecord(config.rawConfig.hmi.layout)
      ? config.rawConfig.hmi.layout
      : undefined
    const startWasDeleted = layout?.start === selectedView.id
    const referenceCount = previewResult.referenceCount ?? 0
    const referenceMessage = referenceCount > 0
      ? `將自動移除 ${referenceCount - (startWasDeleted ? 1 : 0)} 個導覽引用，${startWasDeleted ? `並將起始頁改為「${previewResult.fallbackView?.name || fallbackId}」。` : ''}`
      : '此 View 沒有導覽引用。'

    Modal.confirm({
      title: `確定刪除「${selectedView.name || selectedView.id}」？`,
      content: `${referenceMessage} 無法還原的 JSON 輸出前仍可使用復原功能。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk() {
        try {
          const nextRaw = structuredClone(config.rawConfig)
          const result = deleteView(nextRaw, selectedView.id)
          if (!result.deleted) {
            throw new Error(result.reason === 'last-view'
              ? '至少必須保留一個 View。'
              : '找不到要刪除的 View。')
          }
          const nextModels = new Map(models)
          nextModels.delete(selectedView.id)
          const nextModifiedIds = new Set(modifiedViewIds)
          nextModifiedIds.delete(selectedView.id)
          const document = parseUpdatedConfig(nextRaw, config)
          dispatchEditor({
            type: 'document-edit',
            document,
            models: nextModels,
            modifiedViewIds: nextModifiedIds,
          })
          setSelectedViewId(fallbackId)
          messageApi.success('已刪除 View，並處理其起始頁／導覽引用。')
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          messageApi.error(`刪除 View 失敗：${detail}`)
        }
      },
    })
  }

  function handleRemoveComponent(viewId: string, key: string) {
    const model = models.get(viewId)
    if (!model) return
    const component = model.components.find((item) => item.key === key)
    if (!component || component.managed === false) return
    dispatchEditor({
      type: 'edit',
      viewId,
      model: {
        ...model,
        components: model.components.filter((item) => item.key !== key),
      },
    })
  }

  function handleUpdateComponent(
    viewId: string,
    key: string,
    update: Partial<Pick<FloorLayoutComponent, 'label' | 'tagId' | 'palette'>>,
  ) {
    const model = models.get(viewId)
    if (!model) return
    const component = model.components.find((item) => item.key === key)
    if (!component || component.managed === false) return

    dispatchEditor({
      type: 'edit',
      viewId,
      model: {
        ...model,
        components: model.components.map((item) => (
          item.key === key ? { ...item, ...update } : item
        )),
      },
    })
  }

  function handleUpdateGrid(
    viewId: string,
    update: Partial<GridSettings>,
  ) {
    const model = models.get(viewId)
    if (!model) return
    dispatchEditor({
      type: 'edit',
      viewId,
      model: {
        ...model,
        grid: { ...model.grid, ...update },
      },
    })
  }

  function openBatchDialog() {
    setBatchSelection(new Set())
    setBatchSearch('')
    setBatchDialogOpen(true)
  }

  function handleBatchSelectAll(checked: boolean) {
    setBatchSelection((current) => {
      const next = new Set(current)
      for (const tag of filteredBatchTags) {
        if (checked) next.add(tag.id)
        else next.delete(tag.id)
      }
      return next
    })
  }

  function handleBatchAdd() {
    if (!config || !selectedView || !selectedModel) return
    const selectedTags = tags.filter((tag) => batchSelection.has(tag.id))
    if (!selectedTags.length) {
      messageApi.warning('請至少選取一個 Tag。')
      return
    }

    try {
      const nextModels = createViewComponents(
        config.rawConfig,
        selectedModel,
        models,
        selectedTags,
        { Parser: DOMParser, crypto: window.crypto },
      )
      dispatchEditor({
        type: 'edit',
        viewId: selectedView.id,
        model: nextModels,
      })
      setBatchDialogOpen(false)
      setBatchSelection(new Set())
      messageApi.success(`已加入 ${selectedTags.length} 筆 Tag 元件。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`批次加入 Tag 失敗：${detail}`)
    }
  }

  function tagLabel(tag: IndexedTag): string {
    return `${tag.deviceName} / ${tag.name} (${tag.type || '未設定型別'})`
  }

  function tagOptions(component: FloorLayoutComponent) {
    const options = tags.map((tag) => ({
      value: tag.id,
      label: tagLabel(tag),
      disabled: component.template === 'icon-pair'
        && !['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()),
    }))
    if (component.tagId && !tags.some((tag) => tag.id === component.tagId)) {
      options.unshift({
        value: component.tagId,
        label: `Tag 不存在（${component.tagId}）`,
        disabled: true,
      })
    }
    return options
  }

  const previewPanel = (
    <Card
      title="SVG 預覽"
      extra={preview && !preview.error ? (
        <Space size="small">
          <Text type="secondary">{preview.width} × {preview.height}</Text>
          {preview.outsideCanvas && <Tag color="warning">排列超出畫布</Tag>}
        </Space>
      ) : undefined}
      className="view-details preview-card"
    >
      {preview?.error ? (
        <Alert
          type="warning"
          showIcon
          title="無法顯示預覽"
          description={preview.error}
        />
      ) : preview?.svgMarkup ? (
        <div
          className="svg-preview"
          role="img"
          aria-label={`${selectedView?.name ?? 'View'} 唯讀 SVG 預覽`}
          dangerouslySetInnerHTML={{ __html: preview.svgMarkup }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無可預覽的 View。" />
      )}
    </Card>
  )

  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary: '#176b87',
          borderRadius: 8,
          fontFamily: '"Segoe UI", "Microsoft JhengHei", sans-serif',
        },
      }}
    >
      {contextHolder}
      <Modal
        open={viewDialogMode !== null}
        title={viewDialogMode === 'rename' ? '修改 View 名稱' : '新增空白 View'}
        okText={viewDialogMode === 'rename' ? '儲存名稱' : '建立 View'}
        cancelText="取消"
        onCancel={() => setViewDialogMode(null)}
        onOk={() => viewNameForm.submit()}
        destroyOnHidden
      >
        <Text type="secondary">
          {viewDialogMode === 'rename'
            ? '修改名稱不會變更 View ID 或其導覽連結。'
            : '建立空白畫布，之後可新增 Tag 元件。'}
        </Text>
        <Form
          form={viewNameForm}
          layout="vertical"
          onFinish={handleViewNameSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="View 名稱"
            name="name"
            rules={[
              { required: true, whitespace: true, message: 'View 名稱不可空白。' },
              {
                validator: async (_, value: unknown) => {
                  if (!config) throw new Error('請先載入配置。')
                  const validation = validateViewName(
                    config.rawConfig.hmi.views,
                    value,
                    viewDialogMode === 'rename' ? viewDialogTargetId : undefined,
                  )
                  if (!validation.valid && validation.reason === 'duplicate') {
                    throw new Error('此 View 名稱已存在，請使用不同名稱。')
                  }
                },
              },
            ]}
          >
            <Input autoFocus maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={batchDialogOpen}
        title="批次加入 Tag"
        okText={`加入 ${batchSelection.size} 筆`}
        cancelText="取消"
        okButtonProps={{ disabled: batchSelection.size === 0 }}
        onCancel={() => setBatchDialogOpen(false)}
        onOk={handleBatchAdd}
        width={720}
        destroyOnHidden
      >
        <Text type="secondary">
          Tag 會沿用配置中的樓層；未設定樓層的 Tag 會歸入「未設定樓層」。
        </Text>
        <Input
          aria-label="搜尋 Tag"
          allowClear
          placeholder="搜尋設備、Tag 名稱、型別或 ID"
          value={batchSearch}
          onChange={(event) => setBatchSearch(event.target.value)}
          style={{ margin: '16px 0 12px' }}
        />
        <div className="batch-tag-toolbar">
          <Checkbox
            checked={filteredBatchTags.length > 0 && selectedBatchCount === filteredBatchTags.length}
            indeterminate={selectedBatchCount > 0 && selectedBatchCount < filteredBatchTags.length}
            disabled={filteredBatchTags.length === 0}
            onChange={(event) => handleBatchSelectAll(event.target.checked)}
          >
            全選目前搜尋結果
          </Checkbox>
          <Text type="secondary">
            已選 {batchSelection.size} 筆 / {tags.length} 筆
          </Text>
        </div>
        <div className="batch-tag-list" role="group" aria-label="可加入的 Tag">
          {filteredBatchTags.length ? filteredBatchTags.map((tag) => (
            <Checkbox
              key={tag.id}
              checked={batchSelection.has(tag.id)}
              onChange={(event) => {
                setBatchSelection((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(tag.id)
                  else next.delete(tag.id)
                  return next
                })
              }}
            >
              <span className="batch-tag-option">
                <span>{tag.deviceName} / {tag.name} ({tag.type || '未設定型別'})</span>
                <Text type="secondary">
                  {tag.floor || '未設定樓層'} · {tag.id}
                  {usedTagIds.has(tag.id) ? ' · 此 View 已使用' : ''}
                </Text>
              </span>
            </Checkbox>
          )) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沒有符合的 Tag。" />
          )}
        </div>
      </Modal>
      <Layout className="editor-shell">
        <Header className="editor-header">
          <div className="brand">
            <div className="brand-mark">F</div>
            <div>
              <Text className="brand-name">FUXA View Editor</Text>
              <Text className="brand-caption">View 元件批次管理工具</Text>
            </div>
          </div>
          <Space size="middle">
            <Text className="file-indicator" ellipsis title={fileName || '尚未載入配置'}>
              {fileName || '尚未載入配置'}
            </Text>
            <Button
              disabled={editor.past.length === 0}
              onClick={() => dispatchEditor({ type: 'undo' })}
            >
              復原
            </Button>
            <Button
              disabled={editor.future.length === 0}
              onClick={() => dispatchEditor({ type: 'redo' })}
            >
              重做
            </Button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
            <Button
              type="primary"
              loading={isLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              開啟 JSON
            </Button>
            <Button disabled={!config} onClick={handleSave}>
              {isDirty ? '匯出修改' : '另存新 JSON'}
            </Button>
          </Space>
        </Header>

        <Layout className="editor-body">
          <Sider width={260} theme="light" className="view-sidebar">
            <div className="sidebar-heading">
              <div className="sidebar-title">
                <Text strong>Views</Text>
                <Tag>{config?.views.length ?? 0}</Tag>
              </div>
              <Space size={4} wrap>
                <Button
                  size="small"
                  onClick={() => openViewDialog('create')}
                  disabled={!config}
                  aria-label="新增 View"
                >
                  新增
                </Button>
                <Button
                  size="small"
                  onClick={() => openViewDialog('rename')}
                  disabled={!selectedView?.id}
                  aria-label="修改 View 名稱"
                >
                  改名
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={handleDeleteSelectedView}
                  disabled={!selectedView?.id || (config?.views.length ?? 0) <= 1}
                  aria-label="刪除 View"
                >
                  刪除
                </Button>
              </Space>
            </div>
            {config ? (
              config.views.length > 0 ? (
                <nav className="view-list" aria-label="View 清單">
                  {config.views.map((view) => (
                    <Button
                      key={view.key}
                      type="text"
                      block
                      className={(view.id || view.key) === (selectedView?.id || selectedView?.key) ? 'view-item selected' : 'view-item'}
                      aria-current={(view.id || view.key) === (selectedView?.id || selectedView?.key) ? 'page' : undefined}
                      onClick={() => setSelectedViewId(view.id || view.key)}
                    >
                      <Text ellipsis title={view.name}>{view.name}</Text>
                      <Text className="view-id" ellipsis title={view.id}>{view.id || '無 ID'}</Text>
                    </Button>
                  ))}
                </nav>
              ) : (
                <div className="sidebar-empty">
                  <Text type="secondary">配置中沒有 View。</Text>
                </div>
              )
            ) : (
              <div className="sidebar-empty">
                <Text type="secondary">開啟 FUXA JSON 後，View 清單會顯示於此。</Text>
              </div>
            )}
          </Sider>

          <Content className="workspace">
            {!config ? (
              <div className="welcome-panel">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={(
                    <Space orientation="vertical" size={4}>
                      <Title level={4}>開始編輯 FUXA View</Title>
                      <Text type="secondary">
                        選取本機 FUXA 配置 JSON。檔案只在瀏覽器中讀取，不會上傳。
                      </Text>
                    </Space>
                  )}
                >
                  <Button type="primary" size="large" onClick={() => fileInputRef.current?.click()}>
                    開啟 JSON
                  </Button>
                </Empty>
              </div>
            ) : (
              <div className="workspace-content">
                <div className="workspace-title">
                  <div>
                    <Text className="eyebrow">CONFIGURATION</Text>
                    <Title level={3}>{selectedView?.name ?? 'View'}</Title>
                  </div>
                  <Tag color={isDirty ? 'orange' : 'blue'}>
                    {isDirty ? '有未匯出修改' : 'View 元件管理'}
                  </Tag>
                </div>

                <Space className="summary-cards" size="middle" wrap>
                  <Card className="summary-card"><Statistic title="Views" value={config.views.length} /></Card>
                  <Card className="summary-card"><Statistic title="Devices" value={Object.keys(config.devices).length} /></Card>
                  <Card className="summary-card"><Statistic title="Tags" value={tagCount} /></Card>
                </Space>

                {selectedView ? (
                  <Space className="view-panels" orientation="vertical" size="middle">
                    <Card title="View 資訊" className="view-details">
                      <Descriptions column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label="名稱">{selectedView.name}</Descriptions.Item>
                        <Descriptions.Item label="View ID">{selectedView.id || '—'}</Descriptions.Item>
                        <Descriptions.Item label="畫布尺寸">
                          {selectedView.width && selectedView.height
                            ? `${selectedView.width} × ${selectedView.height}`
                            : '未提供'}
                        </Descriptions.Item>
                        <Descriptions.Item label="元件數">
                          {selectedView.itemCount ?? '未提供'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                    {modelErrors.has(selectedView.id) ? (
                      <div className="editor-columns">
                        <Alert
                          type="warning"
                          showIcon
                          title="此 View 無法編輯"
                          description={modelErrors.get(selectedView.id)}
                        />
                        {previewPanel}
                      </div>
                    ) : (
                      <>
                        <div className="editor-columns">
                          <div className="editor-controls">
                        {selectedModel && (
                          <Card title="Grid 排版設定" className="view-details">
                            <div className="grid-settings">
                              <label>
                                <Text>每列元件數</Text>
                                <InputNumber
                                  aria-label="每列元件數"
                                  min={1}
                                  max={24}
                                  step={1}
                                  value={selectedModel.grid.columns}
                                  onChange={(columns) => {
                                    if (columns !== null) {
                                      handleUpdateGrid(selectedView.id, { columns })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>起點 X</Text>
                                <InputNumber
                                  aria-label="起點 X"
                                  min={0}
                                  value={selectedModel.grid.originX}
                                  onChange={(originX) => {
                                    if (originX !== null) {
                                      handleUpdateGrid(selectedView.id, { originX })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>起點 Y</Text>
                                <InputNumber
                                  aria-label="起點 Y"
                                  min={0}
                                  value={selectedModel.grid.originY}
                                  onChange={(originY) => {
                                    if (originY !== null) {
                                      handleUpdateGrid(selectedView.id, { originY })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>水平間距</Text>
                                <InputNumber
                                  aria-label="水平間距"
                                  min={0}
                                  value={selectedModel.grid.gapX}
                                  onChange={(gapX) => {
                                    if (gapX !== null) {
                                      handleUpdateGrid(selectedView.id, { gapX })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>垂直間距</Text>
                                <InputNumber
                                  aria-label="垂直間距"
                                  min={0}
                                  value={selectedModel.grid.gapY}
                                  onChange={(gapY) => {
                                    if (gapY !== null) {
                                      handleUpdateGrid(selectedView.id, { gapY })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>標籤位置</Text>
                                <Select
                                  aria-label="標籤位置"
                                  value={selectedModel.grid.labelPosition}
                                  options={[
                                    { value: 'above', label: '上方' },
                                    { value: 'below', label: '下方' },
                                    { value: 'left', label: '左側' },
                                    { value: 'right', label: '右側' },
                                  ]}
                                  onChange={(labelPosition: GridSettings['labelPosition']) => (
                                    handleUpdateGrid(selectedView.id, { labelPosition })
                                  )}
                                />
                              </label>
                              <label>
                                <Text>標籤位移</Text>
                                <InputNumber
                                  aria-label="標籤位移"
                                  min={0}
                                  value={selectedModel.grid.labelOffset}
                                  onChange={(labelOffset) => {
                                    if (labelOffset !== null) {
                                      handleUpdateGrid(selectedView.id, { labelOffset })
                                    }
                                  }}
                                />
                              </label>
                              <label>
                                <Text>標籤字級</Text>
                                <InputNumber
                                  aria-label="標籤字級"
                                  min={8}
                                  max={72}
                                  value={selectedModel.grid.labelFontSize}
                                  onChange={(labelFontSize) => {
                                    if (labelFontSize !== null) {
                                      handleUpdateGrid(selectedView.id, { labelFontSize })
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          </Card>
                        )}
                      <Card
                        title="已管理元件"
                        extra={(
                          <Space>
                            <Tag>
                              {selectedModel?.components.filter(
                                (component) => component.managed !== false,
                              ).length ?? 0}
                            </Tag>
                            <Button
                              size="small"
                              disabled={!selectedModel || tags.length === 0}
                              onClick={openBatchDialog}
                            >
                              批次加入 Tag
                            </Button>
                          </Space>
                        )}
                        className="view-details"
                      >
                        {selectedModel && selectedModel.components.some(
                          (component) => component.managed !== false,
                        ) ? (
                          <div className="component-list">
                            {selectedModel.components
                              .filter((component) => component.managed !== false)
                              .map((component: FloorLayoutComponent) => (
                                <div className="component-row" key={component.key}>
                                  <div className="component-meta">
                                    <Input
                                      aria-label="元件標籤"
                                      value={component.label ?? ''}
                                      placeholder="元件標籤"
                                      maxLength={120}
                                      onChange={(event) => handleUpdateComponent(
                                        selectedView.id,
                                        component.key,
                                        { label: event.target.value },
                                      )}
                                    />
                                    <Select
                                      aria-label="綁定 Tag"
                                      showSearch
                                      optionFilterProp="label"
                                      value={component.tagId || undefined}
                                      placeholder="選擇 Tag"
                                      options={tagOptions(component)}
                                      onChange={(tagId: string) => handleUpdateComponent(
                                        selectedView.id,
                                        component.key,
                                        { tagId },
                                      )}
                                    />
                                    {component.template !== 'icon-pair' && (
                                      <Select
                                        aria-label="顏色狀態"
                                        value={component.palette === 'alarm' ? 'alarm' : 'normal'}
                                        options={[
                                          { value: 'normal', label: '一般狀態配色' },
                                          { value: 'alarm', label: '告警狀態配色' },
                                        ]}
                                        onChange={(palette: 'normal' | 'alarm') => handleUpdateComponent(
                                          selectedView.id,
                                          component.key,
                                          { palette },
                                        )}
                                      />
                                    )}
                                  </div>
                                  <Button
                                    danger
                                    type="link"
                                    onClick={() => {
                                      if (window.confirm('刪除此元件？匯出時會從 View 的 SVG 和 items 一併移除。')) {
                                        handleRemoveComponent(selectedView.id, component.key)
                                      }
                                    }}
                                  >
                                    刪除
                                  </Button>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="此 View 沒有可管理的元件。"
                          />
                        )}
                      </Card>
                    {(unsupported.get(selectedView.id)?.length ?? 0) > 0 && (
                      <Alert
                        type="info"
                        showIcon
                        title="部分既有 SVG 元件不會自動移動"
                        description={unsupported.get(selectedView.id)?.join('；')}
                      />
                    )}
                        </div>
                        {previewPanel}
                        </div>
                      </>
                    )}
                  </Space>
                ) : (
                  <Alert type="info" showIcon title="此配置沒有可選取的 View。" />
                )}

                <Card className="next-step-card">
                  <Text strong>目前進度</Text>
                  <Text type="secondary">
                    可管理 View、調整 Grid 排版、編輯或刪除已管理元件，並查看唯讀預覽；修改僅在本機進行。
                  </Text>
                </Card>
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}

export default App
