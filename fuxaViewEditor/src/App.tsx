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
  Image,
  Input,
  InputNumber,
  Layout,
  Modal,
  Radio,
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
import { groupByFloor, normalizeFloor } from './domain/tags/floor'
import { getIconLibrary } from './domain/icons/iconLibrary'
import { generateId } from './domain/ids'
import {
  deleteManagedDevice,
  fillModbusDeviceAddressGaps,
  previewModbusAddressFill,
  saveModbusDevice,
  shiftModbusDeviceTags,
} from './features/devices/manageModbusDevice'
import { DEFAULT_GRID } from './domain/layout/gridSettings'
import { getFloorGroupFrameSettings } from './domain/layout/floorGroupFrame'
import type { FloorGroupFrameSettings } from './domain/config/types'
import { findSvgElementById, parseSvg } from './domain/svg/parseSvg'
import { prepareViewPreview } from './features/preview/prepareViewPreview'
import { applyTagFloors } from './features/floors/applyTagFloors'
import { updateFloorGroupFrame } from './features/floors/updateFloorGroupFrame'
import { createViewComponents } from './features/tags/createViewComponents'
import { createBlankView } from './features/views/createBlankView'
import {
  addIconLibraryEntry,
  findIconLibraryUsages,
  findIconLibrarySvgUsages,
  removeIconLibraryEntry,
} from './features/icons/iconLibraryManagement'
import {
  getComponentGraphicChoices,
  selectedComponentGraphic,
  updateComponentGraphic,
} from './features/icons/componentGraphics'
import type { FuxaViewSummary, ParsedFuxaConfig } from './domain/config/types'
import type { ExportViewModel } from './domain/config/prepareFuxaConfigExport'
import type { GeneratedComponent } from './domain/svg/validateGeneratedView'
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

interface ModbusDeviceFormValues {
  [key: string]: unknown
  name: string
  address: string
  addressCount: number
  enabled: boolean
  polling: number
}

interface FloorGroupFrameFormValues extends Omit<FloorGroupFrameSettings, 'fillOpacity'> {
  fillOpacityPercent: number
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
  const [deviceManagerForm] = Form.useForm<ModbusDeviceFormValues>()
  const [floorFrameForm] = Form.useForm<FloorGroupFrameFormValues>()
  const [messageApi, contextHolder] = message.useMessage()
  const [fileName, setFileName] = useState('')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [viewDialogMode, setViewDialogMode] = useState<'create' | 'rename' | null>(null)
  const [viewDialogTargetId, setViewDialogTargetId] = useState('')
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set())
  const [floorManagerOpen, setFloorManagerOpen] = useState(false)
  const [floorSearch, setFloorSearch] = useState('')
  const [floorDisplayMode, setFloorDisplayMode] = useState<'group' | 'list'>('group')
  const [floorSelection, setFloorSelection] = useState<Set<string>>(new Set())
  const [bulkFloor, setBulkFloor] = useState('')
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false)
  const [iconName, setIconName] = useState('')
  const [iconType, setIconType] = useState<'single' | 'pair'>('single')
  const [singleIconFile, setSingleIconFile] = useState<File | null>(null)
  const [normalIconFile, setNormalIconFile] = useState<File | null>(null)
  const [alarmIconFile, setAlarmIconFile] = useState<File | null>(null)
  const [deviceManagerOpen, setDeviceManagerOpen] = useState(false)
  const [floorFrameDialogOpen, setFloorFrameDialogOpen] = useState(false)
  const [deviceManagerMode, setDeviceManagerMode] = useState<'create' | 'edit'>('edit')
  const [managedDeviceId, setManagedDeviceId] = useState('')
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
  const iconLibrary = useMemo(
    () => config ? getIconLibrary(config.rawConfig) : [],
    [config],
  )
  const modbusDevices = useMemo(() => (
    config
      ? Object.entries(config.rawConfig.devices)
        .filter((entry): entry is [string, Record<string, unknown>] => (
          isRecord(entry[1]) && entry[1].type === 'ModbusTCP'
        ))
        .map(([id, record]) => ({ id, record }))
      : []
  ), [config])
  const managedDevice = modbusDevices.find((device) => device.id === managedDeviceId)
  const managedDeviceTags = managedDevice && isRecord(managedDevice.record.tags)
    ? Object.values(managedDevice.record.tags).filter(isRecord)
    : []
  const addressFillState = useMemo(() => {
    if (!config || !managedDevice || deviceManagerMode !== 'edit') return null
    try {
      return { plan: previewModbusAddressFill(config.rawConfig, managedDeviceId) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [config, deviceManagerMode, managedDevice, managedDeviceId])
  const addressFillPlan = addressFillState && 'plan' in addressFillState
    ? addressFillState.plan
    : null
  const addressFillError = addressFillState && 'error' in addressFillState
    ? addressFillState.error
    : null
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
  const filteredFloorTags = useMemo(() => {
    const query = floorSearch.trim().toLocaleLowerCase()
    return tags.filter((tag) => (
      `${tag.deviceName} ${tag.name} ${tag.floor} ${tag.type} ${tag.id}`
        .toLocaleLowerCase()
        .includes(query)
    ))
  }, [floorSearch, tags])
  const floorTagGroups = useMemo(() => floorDisplayMode === 'group'
    ? groupByFloor(filteredFloorTags, (tag) => tag.floor)
    : [{ floor: '', title: '', items: filteredFloorTags }],
  [filteredFloorTags, floorDisplayMode])
  const allFloors = useMemo(
    () => [...new Set(tags.map((tag) => tag.floor).filter(Boolean))],
    [tags],
  )
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
      getIconLibrary(parsed.rawConfig)
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
    update: Partial<Pick<
      GeneratedComponent,
      | 'label' | 'tagId' | 'palette' | 'template' | 'iconId'
      | 'normalIconId' | 'alarmIconId' | 'alarmShapeId' | 'invertIconState'
    >>,
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

  function handleUpdateGraphic(viewId: string, component: GeneratedComponent, value: string) {
    const model = models.get(viewId)
    if (!model) return
    try {
      if (value.startsWith('pair:')
          && !['bool', 'boolean'].includes(
            tags.find((tag) => tag.id === component.tagId)?.type.toLocaleLowerCase() ?? '',
          )) {
        messageApi.warning('正常／告警圖示組需要綁定 Boolean Tag，請先變更 Tag 型別。')
        return
      }
      const usedIds = new Set<string>()
      for (const view of config?.rawConfig.hmi.views ?? []) {
        if (!isRecord(view) || !isRecord(view.items)) continue
        Object.keys(view.items).forEach((id) => usedIds.add(id))
      }
      for (const currentModel of models.values()) {
        for (const item of currentModel.components) {
          if (item.shapeId) usedIds.add(item.shapeId)
          if (item.labelId) usedIds.add(item.labelId)
          if (item.alarmShapeId) usedIds.add(item.alarmShapeId)
        }
      }
      const updated = updateComponentGraphic(
        component,
        value,
        iconLibrary,
        () => generateId('SHE', usedIds, window.crypto),
      )
      if (updated === component
          || (updated.template === component.template
            && updated.iconId === component.iconId
            && updated.normalIconId === component.normalIconId
            && updated.alarmIconId === component.alarmIconId)) return
      handleUpdateComponent(viewId, component.key, updated)
    } catch (error) {
      messageApi.error(`更新元件圖形失敗：${error instanceof Error ? error.message : String(error)}`)
    }
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

  function openDeviceManager() {
    const firstDevice = modbusDevices[0]
    if (firstDevice) {
      setDeviceManagerMode('edit')
      setManagedDeviceId(firstDevice.id)
      deviceManagerForm.setFieldsValue({
        name: typeof firstDevice.record.name === 'string' ? firstDevice.record.name : '',
        address: isRecord(firstDevice.record.property)
          && typeof firstDevice.record.property.address === 'string'
          ? firstDevice.record.property.address
          : '127.0.0.1:502',
        addressCount: isRecord(firstDevice.record.property)
          ? Number(firstDevice.record.property.addressCount) || 0
          : 0,
        enabled: Boolean(firstDevice.record.enabled),
        polling: Number(firstDevice.record.polling) || 200,
      })
    } else {
      setDeviceManagerMode('create')
      setManagedDeviceId('')
      deviceManagerForm.setFieldsValue({
        name: '',
        address: '127.0.0.1:502',
        addressCount: 0,
        enabled: true,
        polling: 200,
      })
    }
    setDeviceManagerOpen(true)
  }

  function selectManagedDevice(deviceId: string) {
    const device = modbusDevices.find((candidate) => candidate.id === deviceId)
    if (!device) return
    setDeviceManagerMode('edit')
    setManagedDeviceId(device.id)
    deviceManagerForm.setFieldsValue({
      name: typeof device.record.name === 'string' ? device.record.name : '',
      address: isRecord(device.record.property)
        && typeof device.record.property.address === 'string'
        ? device.record.property.address
        : '127.0.0.1:502',
      addressCount: isRecord(device.record.property)
        ? Number(device.record.property.addressCount) || 0
        : 0,
      enabled: Boolean(device.record.enabled),
      polling: Number(device.record.polling) || 200,
    })
  }

  function handleModbusDeviceSave(values: ModbusDeviceFormValues) {
    if (!config) return
    try {
      const result = saveModbusDevice(
        config.rawConfig,
        deviceManagerMode === 'create' ? '' : managedDeviceId,
        values,
        window.crypto,
      )
      const document = parseUpdatedConfig(result.config, config)
      dispatchEditor({
        type: 'document-edit',
        document,
        models,
      })
      setManagedDeviceId(result.deviceId)
      setDeviceManagerMode('edit')
      deviceManagerForm.setFieldsValue(values)
      messageApi.success(result.created
        ? `已建立設備「${values.name.trim()}」。`
        : `已更新設備「${values.name.trim()}」。`)
      if (result.fill.created.length) {
        messageApi.success(
          `已自動建立 ${result.fill.created.length} 個補位 Tag（${result.fill.startAddress}–${result.fill.endAddress}）。`,
        )
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`設備儲存失敗：${detail}`)
    }
  }

  function handleShiftDeviceAddresses(delta: 1 | -1) {
    if (!config || !managedDevice) return
    try {
      const shifted = shiftModbusDeviceTags(config.rawConfig, managedDeviceId, delta)
      if (!shifted.count) {
        messageApi.info(shifted.skippedInvalid
          ? `沒有可調整的有效數字 address；另有 ${shifted.skippedInvalid} 個無效 address 保持不變。`
          : '此設備沒有可調整的數字 address。')
        return
      }
      if (!window.confirm(
        `確定將設備「${managedDevice.record.name || managedDeviceId}」的 ${shifted.count} 個 Tag address 全部 ${delta > 0 ? '+1' : '-1'}？\n此操作跨所有 memaddress 區段；沒有 address 的 Tag 不變。`,
      )) return
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(shifted.config, config),
        models,
      })
      messageApi.success(
        `已調整 ${shifted.count} 個 Tag address。`
        + (shifted.skippedInvalid ? ` ${shifted.skippedInvalid} 個無效 address 未變更。` : ''),
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`位址調整已取消：${detail}`)
    }
  }

  function handleFillDeviceAddresses() {
    if (!config || !managedDevice) return
    try {
      const plan = previewModbusAddressFill(config.rawConfig, managedDeviceId)
      if (!plan.hasAnchor) {
        messageApi.warning('目前沒有可作為起點的 Tag；新增第一個 Tag 後才能自動補位。')
        return
      }
      if (!plan.missing.length) {
        messageApi.info('指定範圍內沒有缺漏位址。')
        return
      }
      if (!window.confirm(
        `將在 ${plan.memaddress} 位址區段建立 ${plan.missing.length} 個補位 Tag（${plan.startAddress}–${plan.endAddress}），確定繼續？`,
      )) return
      const result = fillModbusDeviceAddressGaps(config.rawConfig, managedDeviceId, window.crypto)
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(result.config, config),
        models,
      })
      messageApi.success(`已建立 ${result.fill.created.length} 個補位 Tag。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`Modbus 位址補位失敗：${detail}`)
    }
  }

  function handleDeleteManagedDevice() {
    if (!config || !managedDevice || managedDeviceId === '0') return
    const linkedViews: string[] = []
    for (const [viewId, model] of models) {
      const view = config.views.find((candidate) => candidate.id === viewId)
      const count = model.components.filter((component) => {
        const tag = tags.find((candidate) => candidate.id === component.tagId)
        return tag?.deviceId === managedDeviceId
      }).length
      if (count) linkedViews.push(`View「${view?.name || viewId}」(${count} 個元件)`)
    }
    const warning = linkedViews.length
      ? `\n\n以下 View 使用此設備的 Tag，刪除後會留下無效 Tag 參照：\n${linkedViews.join('\n')}`
      : ''
    if (!window.confirm(
      `確定刪除設備「${managedDevice.record.name || managedDeviceId}」及其所有 Tag 嗎？${warning}`,
    )) return
    try {
      const nextConfig = deleteManagedDevice(config.rawConfig, managedDeviceId)
      const document = parseUpdatedConfig(nextConfig, config)
      dispatchEditor({ type: 'document-edit', document, models })
      const fallback = modbusDevices.find((candidate) => candidate.id !== managedDeviceId)
      if (fallback) selectManagedDevice(fallback.id)
      else {
        setDeviceManagerMode('create')
        setManagedDeviceId('')
        deviceManagerForm.setFieldsValue({
          name: '',
          address: '127.0.0.1:502',
          addressCount: 0,
          enabled: true,
          polling: 200,
        })
      }
      messageApi.success('已刪除設備及其系統連線 Tag。')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`設備刪除失敗：${detail}`)
    }
  }

  function openFloorManager() {
    setFloorSearch('')
    setFloorSelection(new Set())
    setBulkFloor('')
    setFloorDisplayMode('group')
    setFloorManagerOpen(true)
  }

  function toggleVisibleFloorTags(checked: boolean) {
    setFloorSelection((current) => {
      const next = new Set(current)
      for (const tag of filteredFloorTags) {
        if (checked) next.add(tag.id)
        else next.delete(tag.id)
      }
      return next
    })
  }

  function applyFloorChange(tagIds: readonly string[], value: string) {
    if (!config || !tagIds.length) return
    try {
      const result = applyTagFloors(config.rawConfig, tagIds, value)
      if (!result.changedCount) {
        messageApi.info('選取的 Tag 樓層沒有變更。')
        return
      }
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(result.config, config),
        models,
      })
      messageApi.success(`已更新 ${result.changedCount} 個 Tag 的樓層。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`更新 Tag 樓層失敗：${detail}`)
    }
  }

  function handleApplyBulkFloor() {
    if (!floorSelection.size) {
      messageApi.warning('請先選取要設定樓層的 Tag。')
      return
    }
    applyFloorChange([...floorSelection], bulkFloor)
    setBulkFloor('')
  }

  function openFloorFrameDialog() {
    if (!config) return
    const settings = getFloorGroupFrameSettings(config.rawConfig)
    floorFrameForm.setFieldsValue({
      ...settings,
      fillOpacityPercent: Math.round(settings.fillOpacity * 100),
    })
    setFloorFrameDialogOpen(true)
  }

  function handleFloorFrameSubmit(values: FloorGroupFrameFormValues) {
    if (!config) return
    try {
      const result = updateFloorGroupFrame(config.rawConfig, {
        ...values,
        fillOpacity: values.fillOpacityPercent / 100,
      })
      if (!result.changed) {
        setFloorFrameDialogOpen(false)
        messageApi.info('樓層底框設定沒有變更。')
        return
      }
      const updatedFrame = getFloorGroupFrameSettings(result.config)
      const nextModels = new Map(
        [...models].map(([viewId, model]) => [
          viewId,
          { ...model, floorGroupFrame: updatedFrame },
        ]),
      )
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(result.config, config),
        models: nextModels,
      })
      setFloorFrameDialogOpen(false)
      messageApi.success('已更新所有 View 的樓層底框設定。')
    } catch (error) {
      messageApi.error(`更新樓層底框設定失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function handleAddIcon() {
    if (!config) return
    try {
      const files = iconType === 'single'
        ? singleIconFile ? [singleIconFile] : []
        : [normalIconFile, alarmIconFile].filter((file): file is File => file !== null)
      const images = await Promise.all(files.map(async (file) => (
        new Uint8Array(await file.arrayBuffer())
      )))
      const nextConfig = addIconLibraryEntry(
        config.rawConfig,
        iconName,
        iconType,
        images,
        window.crypto,
      )
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models,
      })
      setIconName('')
      setSingleIconFile(null)
      setNormalIconFile(null)
      setAlarmIconFile(null)
      messageApi.success('已新增圖示。')
    } catch (error) {
      messageApi.error(`新增圖示失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function handleRemoveIcon(iconId: string) {
    if (!config) return
    try {
      const viewNames = new Map(config.views.map((view) => [view.id, view.name]))
      const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]))
      const usages = [
        ...findIconLibraryUsages(iconLibrary, models, viewNames, tagNames, iconId),
        ...findIconLibrarySvgUsages(iconLibrary, config.rawConfig, iconId, DOMParser),
      ]
      if (usages.length) {
        messageApi.error(`此圖示仍被使用，無法刪除：${usages.join('、')}`)
        return
      }
      if (!window.confirm('確定刪除此圖示？此操作可使用「復原」還原。')) return
      const nextConfig = removeIconLibraryEntry(config.rawConfig, iconId, usages)
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models,
      })
      messageApi.success('已刪除圖示。')
    } catch (error) {
      messageApi.error(`刪除圖示失敗：${error instanceof Error ? error.message : String(error)}`)
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
        open={floorFrameDialogOpen}
        title="樓層 Group 底框設定"
        okText="套用所有 View"
        cancelText="取消"
        onCancel={() => setFloorFrameDialogOpen(false)}
        onOk={() => floorFrameForm.submit()}
        destroyOnHidden
      >
        <Text type="secondary">設定會套用至所有 View 的樓層 Group 底框，並可使用 Undo/Redo 還原。</Text>
        <Form
          form={floorFrameForm}
          layout="vertical"
          onFinish={handleFloorFrameSubmit}
          className="floor-frame-form"
          style={{ marginTop: 16 }}
        >
          <Form.Item label="底色" name="fill" rules={[{ required: true }]}>
            <Input type="color" aria-label="樓層底框底色" />
          </Form.Item>
          <Form.Item
            label="透明度 (%)"
            name="fillOpacityPercent"
            rules={[
              { required: true, type: 'number', min: 0, max: 100, message: '請輸入 0–100。' },
            ]}
          >
            <InputNumber min={0} max={100} step={1} />
          </Form.Item>
          <Form.Item label="邊框色" name="stroke" rules={[{ required: true }]}>
            <Input type="color" aria-label="樓層底框邊框色" />
          </Form.Item>
          <Form.Item
            label="邊框粗細"
            name="strokeWidth"
            rules={[
              { required: true, type: 'number', min: 0, max: 10, message: '請輸入 0–10。' },
            ]}
          >
            <InputNumber min={0} max={10} step={0.5} />
          </Form.Item>
          <Form.Item
            label="圓角"
            name="cornerRadius"
            rules={[
              { required: true, type: 'number', min: 0, max: 100, message: '請輸入 0–100。' },
            ]}
          >
            <InputNumber min={0} max={100} step={1} />
          </Form.Item>
          <Form.Item
            label="內距"
            name="padding"
            rules={[
              { required: true, type: 'number', min: 0, max: 200, message: '請輸入 0–200。' },
            ]}
          >
            <InputNumber min={0} max={200} step={1} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={iconLibraryOpen}
        title="圖示庫管理"
        footer={null}
        onCancel={() => setIconLibraryOpen(false)}
        width={760}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" className="icon-library-manager">
          <Space wrap>
            <Input
              aria-label="圖示名稱"
              placeholder="圖示名稱"
              maxLength={120}
              value={iconName}
              onChange={(event) => setIconName(event.target.value)}
            />
            <Radio.Group
              aria-label="圖示類型"
              value={iconType}
              onChange={(event) => setIconType(event.target.value)}
              options={[
                { label: '一般圖示', value: 'single' },
                { label: '正常／告警圖示組', value: 'pair' },
              ]}
            />
          </Space>
          {iconType === 'single' ? (
            <label className="icon-file-field">
              一般圖示圖片
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                onChange={(event) => setSingleIconFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <Space wrap>
              <label className="icon-file-field">
                正常狀態圖片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  onChange={(event) => setNormalIconFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="icon-file-field">
                告警狀態圖片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  onChange={(event) => setAlarmIconFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </Space>
          )}
          <Button
            type="primary"
            disabled={!config || !iconName.trim()
              || (iconType === 'single' ? !singleIconFile : !normalIconFile || !alarmIconFile)}
            onClick={() => void handleAddIcon()}
          >
            新增至圖示庫
          </Button>
          {iconLibrary.length ? (
            <div className="icon-library-list">
              {iconLibrary.map((icon) => {
                const assets = icon.type === 'pair'
                  ? [icon.normal, icon.alarm]
                  : [icon]
                return (
                  <Card
                    key={icon.id}
                    size="small"
                    title={icon.name}
                    extra={<Button danger size="small" onClick={() => handleRemoveIcon(icon.id)}>刪除</Button>}
                  >
                    <Space wrap>
                      {assets.map((asset, index) => (
                        <Space key={asset.id} orientation="vertical" align="center" size="small">
                          <Image src={asset.dataUrl} alt={`${icon.name} ${index + 1}`} width={64} height={64} />
                          <Text type="secondary">
                            {icon.type === 'pair' ? (index === 0 ? '正常' : '告警') : '預覽'}
                          </Text>
                        </Space>
                      ))}
                    </Space>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="圖示庫目前沒有項目。" />
          )}
        </Space>
      </Modal>
      <Modal
        open={deviceManagerOpen}
        title="設備與 Tag 管理"
        okText={deviceManagerMode === 'create' ? '建立設備' : '儲存設備'}
        cancelText="關閉"
        onCancel={() => setDeviceManagerOpen(false)}
        onOk={() => deviceManagerForm.submit()}
        width={720}
        destroyOnHidden
      >
        <div className="device-manager-toolbar">
          <Select
            aria-label="選擇 ModbusTCP 設備"
            value={deviceManagerMode === 'create' ? undefined : managedDeviceId}
            placeholder="選擇 ModbusTCP 設備"
            options={modbusDevices.map(({ id, record }) => ({
              value: id,
              label: `${String(record.name || id)} (${id})`,
            }))}
            onChange={selectManagedDevice}
          />
          <Button
            onClick={() => {
              setDeviceManagerMode('create')
              setManagedDeviceId('')
              deviceManagerForm.setFieldsValue({
                name: '',
                address: '127.0.0.1:502',
                addressCount: 0,
                enabled: true,
                polling: 200,
              })
            }}
          >
            新增 ModbusTCP 設備
          </Button>
        </div>
        {deviceManagerMode === 'edit' && managedDevice && (
          <div className="device-manager-summary">
            <Text type="secondary">
              {managedDeviceTags.length} 個 Tag
              {addressFillPlan?.hasAnchor
                ? ` · 位址 ${addressFillPlan.startAddress}–${addressFillPlan.endAddress}，缺漏 ${addressFillPlan.missing.length} 個`
                : addressFillError
                  ? ` · ${addressFillError}`
                  : ' · 尚無可補位的起始 Tag'}
            </Text>
            <Space wrap>
              <Button onClick={() => handleShiftDeviceAddresses(1)}>Tag address 全部 +1</Button>
              <Button onClick={() => handleShiftDeviceAddresses(-1)}>Tag address 全部 -1</Button>
              <Button
                onClick={handleFillDeviceAddresses}
                disabled={!addressFillPlan?.hasAnchor || addressFillPlan.missing.length === 0}
              >
                補齊缺漏位址
              </Button>
              {managedDeviceId !== '0' && (
                <Button danger onClick={handleDeleteManagedDevice}>刪除此設備</Button>
              )}
            </Space>
          </div>
        )}
        <Form
          form={deviceManagerForm}
          layout="vertical"
          onFinish={handleModbusDeviceSave}
          className="device-manager-form"
        >
          <Form.Item
            name="name"
            label="設備名稱"
            rules={[
              { required: true, whitespace: true, message: '設備名稱不可空白。' },
              { max: 120, message: '設備名稱不可超過 120 個字元。' },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="address" label="連線位址 (IP:Port)">
            <Input placeholder="127.0.0.1:502" />
          </Form.Item>
          <Form.Item
            name="addressCount"
            label="地址數量（0 表示不自動補位）"
            rules={[
              { required: true, message: '請輸入地址數量。' },
              {
                validator: async (_, value: unknown) => {
                  if (!Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 65536) {
                    throw new Error('地址數量必須是 0 到 65536 之間的整數。')
                  }
                },
              },
            ]}
          >
            <InputNumber min={0} max={65536} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="polling" label="輪詢週期 (ms)">
            <InputNumber min={10} step={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" valuePropName="checked">
            <Checkbox>啟用設備</Checkbox>
          </Form.Item>
        </Form>
        <Text type="secondary">
          儲存 addressCount 時會以目前最小有效位址為起點，複製其 Tag 範本補齊相同 memaddress 區段的缺漏；位址 +1/-1 會先檢查整台設備的所有 Tag，超出 0–65535 時整批取消。
        </Text>
      </Modal>
      <Modal
        open={floorManagerOpen}
        title="Tag 樓層管理"
        cancelText="關閉"
        footer={null}
        onCancel={() => setFloorManagerOpen(false)}
        width={820}
        destroyOnHidden
      >
        <Input
          aria-label="搜尋樓層 Tag"
          allowClear
          placeholder="搜尋設備、Tag、型別、ID 或樓層"
          value={floorSearch}
          onChange={(event) => setFloorSearch(event.target.value)}
          style={{ margin: '12px 0' }}
        />
        <div className="floor-manager-toolbar">
          <Radio.Group
            aria-label="樓層顯示方式"
            optionType="button"
            buttonStyle="solid"
            value={floorDisplayMode}
            onChange={(event) => setFloorDisplayMode(event.target.value)}
            options={[
              { label: '依樓層分組', value: 'group' },
              { label: '平面清單', value: 'list' },
            ]}
          />
          <Text type="secondary">{tags.length} 個 Tag · 已選 {floorSelection.size} 個</Text>
        </div>
        <div className="floor-bulk-toolbar">
          <Checkbox
            checked={filteredFloorTags.length > 0
              && filteredFloorTags.every((tag) => floorSelection.has(tag.id))}
            indeterminate={filteredFloorTags.some((tag) => floorSelection.has(tag.id))
              && !filteredFloorTags.every((tag) => floorSelection.has(tag.id))}
            disabled={filteredFloorTags.length === 0}
            onChange={(event) => toggleVisibleFloorTags(event.target.checked)}
          >
            全選可見 Tag
          </Checkbox>
          <Input
            aria-label="批次設定樓層"
            list="known-floor-options"
            placeholder="輸入或選擇樓層"
            value={bulkFloor}
            onChange={(event) => setBulkFloor(event.target.value)}
            style={{ maxWidth: 220 }}
          />
          <datalist id="known-floor-options">
            {allFloors.map((floor) => <option key={floor} value={floor} />)}
          </datalist>
          <Button
            type="primary"
            disabled={!floorSelection.size}
            onClick={handleApplyBulkFloor}
          >
            套用至選取項目
          </Button>
        </div>
        <div className="floor-tag-list" role="group" aria-label="Tag 樓層清單">
          {filteredFloorTags.length ? floorTagGroups.map((group) => (
            <section className="floor-tag-group" key={group.floor || 'all'}>
              {group.title && (
                <div className="floor-tag-group-title">
                  {group.title} · {group.items.length} 個 Tag
                </div>
              )}
              {group.items.map((tag) => (
                <div className="floor-tag-row" key={tag.id}>
                  <Checkbox
                    aria-label={`選取 ${tag.deviceName}／${tag.name}`}
                    checked={floorSelection.has(tag.id)}
                    onChange={(event) => {
                      setFloorSelection((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(tag.id)
                        else next.delete(tag.id)
                        return next
                      })
                    }}
                  />
                  <span className="floor-tag-name" title={tag.name}>{tag.name}</span>
                  <Text className="floor-tag-device" type="secondary" title={tag.deviceName}>
                    {tag.deviceName}
                  </Text>
                  <Input
                    aria-label={`${tag.name} 的樓層`}
                    key={`${tag.id}-${tag.floor}`}
                    defaultValue={tag.floor}
                    placeholder="未設定樓層"
                    onPressEnter={(event) => event.currentTarget.blur()}
                    onBlur={(event) => {
                      const value = normalizeFloor(event.currentTarget.value)
                      if (value !== tag.floor || event.currentTarget.value.trim() !== value) {
                        applyFloorChange([tag.id], value)
                      }
                    }}
                  />
                </div>
              ))}
            </section>
          )) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沒有符合條件的 Tag。" />
          )}
        </div>
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
            <Button disabled={!config} onClick={openDeviceManager}>
              設備與 Tag
            </Button>
            <Button disabled={!config} onClick={openFloorManager}>
              樓層管理
            </Button>
            <Button disabled={!config} onClick={() => setIconLibraryOpen(true)}>
              圖示庫
            </Button>
            <Button disabled={!config} onClick={openFloorFrameDialog}>
              樓層框樣式
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
                              .map((component: GeneratedComponent) => (
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
                                    <Select
                                      aria-label="圖形"
                                      value={selectedComponentGraphic(component, iconLibrary)}
                                      options={getComponentGraphicChoices(
                                        iconLibrary,
                                        component,
                                        ['bool', 'boolean'].includes(
                                          tags.find((tag) => tag.id === component.tagId)
                                            ?.type.toLocaleLowerCase() ?? '',
                                        ),
                                      )}
                                      onChange={(value: string) => handleUpdateGraphic(
                                        selectedView.id,
                                        component,
                                        value,
                                      )}
                                    />
                                    {component.template === 'icon-pair' && (
                                      <Checkbox
                                        checked={Boolean(component.invertIconState)}
                                        onChange={(event) => handleUpdateComponent(
                                          selectedView.id,
                                          component.key,
                                          { invertIconState: event.target.checked },
                                        )}
                                      >
                                        反轉狀態
                                      </Checkbox>
                                    )}
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
