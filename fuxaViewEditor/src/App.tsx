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
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import zhTW from 'antd/locale/zh_TW'
import {
  DeleteOutlined,
  DownOutlined,
  RedoOutlined,
  SwapOutlined,
  UndoOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  parseFuxaConfig,
} from './domain/config/parseFuxaConfig'
import { createEmptyFuxaConfig } from './domain/config/createEmptyFuxaConfig'
import { normalizeProjectName, projectFileName } from './domain/config/serialization'
import {
  applyTagAlarms,
  updateExistingTagAlarmTexts,
  updateTagAlarmInversion,
} from './domain/alarms/manageTagAlarms'
import type {
  TagAlarmLevel,
  TagAlarmMessageLevel,
} from './domain/alarms/manageTagAlarms'
import {
  findLegacySwitchViewIds,
  needsVoiceScriptUpdate,
  prepareFuxaConfigExport,
} from './domain/config/prepareFuxaConfigExport'
import { createFuxaConfigExportDependencies } from './domain/config/fuxaConfigExportDependencies'
import { buildViewEditorModels } from './domain/views/buildViewEditorModels'
import { deleteView, renameView, validateViewName } from './domain/views/viewManagement'
import {
  getViewBackgroundInputColor,
  updateAllViewBackgrounds,
} from './domain/views/viewBackground'
import {
  getViewTitleLabelSettings,
  updateAllViewTitleLabels,
} from './domain/views/viewTitleLabel'
import {
  AUTO_FILLED_TAG_DESCRIPTION,
  buildTagIndex,
  isAutoFilledTag,
  isCoilTag,
} from './domain/tags/index'
import { groupByFloor, normalizeFloor } from './domain/tags/floor'
import {
  deviceTagsNeedAddressSorting,
  sortTagEntriesByAddress,
} from './domain/devices/deviceTagAddressSort'
import { getIconAssets, getIconLibrary, MAX_MULTI_STATE_COUNT } from './domain/icons/iconLibrary'
import type { MultiStateIconSet } from './domain/icons/iconLibrary'
import { generateId } from './domain/ids'
import {
  deleteManagedDevice,
  fillModbusDeviceAddressGaps,
  previewModbusAddressFill,
  saveModbusDevice,
  shiftModbusDeviceTags,
} from './features/devices/manageModbusDevice'
import {
  deleteAllAutoFilledModbusDeviceTags,
  deleteModbusDeviceTag,
  updateModbusDeviceTag,
} from './features/devices/manageDeviceTags'
import type { DeviceTagUpdate } from './features/devices/manageDeviceTags'
import { DEFAULT_GRID, ICON_SCALE_MAX, ICON_SCALE_MIN } from './domain/layout/gridSettings'
import { groupComponentsByFloor } from './domain/layout/floorLayout'
import { getFloorGroupFrameSettings } from './domain/layout/floorGroupFrame'
import { hasCurrentFloorFrameLayout } from './domain/layout/floorGroupFrame'
import type { FloorGroupFrameSettings } from './domain/config/types'
import { findSvgElementById, parseSvg } from './domain/svg/parseSvg'
import { prepareViewPreview } from './features/preview/prepareViewPreview'
import { applyTagFloors } from './features/floors/applyTagFloors'
import { updateFloorGroupFrame } from './features/floors/updateFloorGroupFrame'
import { createViewComponents } from './features/tags/createViewComponents'
import { createTagsForDevice } from './features/tags/createTagsForDevice'
import { getNextAvailableAddress, parseTagBatchInput } from './domain/tags/batch'
import type { TagBatchSpec } from './domain/tags/batch'
import { createBlankView } from './features/views/createBlankView'
import { moveManagedComponent } from './features/views/moveManagedComponent'
import {
  addMultiStateIconState,
  addIconLibraryEntry,
  createIconLibraryExport,
  findIconLibraryUsages,
  findIconLibrarySvgUsages,
  importIconLibrary,
  moveMultiStateIconState,
  removeMultiStateIconState,
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

interface MultiStateIconDraft {
  name: string
  file: File | null
}

interface PreviewState {
  width: number
  height: number
  outsideCanvas?: boolean
  svgMarkup?: string
  error?: string
}

interface PreviewSnapshot {
  result: PreviewState
  config: ParsedFuxaConfig
  models: Map<string, ExportViewModel>
  viewId: string
}

interface ModbusDeviceFormValues {
  [key: string]: unknown
  name: string
  address: string
  addressCount: number
  enabled: boolean
  polling: number
}

type ModbusTagFormValues = DeviceTagUpdate

const TAG_ALARM_LEVEL_OPTIONS: { value: TagAlarmLevel; label: string }[] = [
  { value: 'highhigh', label: '高高 (High-High)' },
  { value: 'high', label: '高 (High)' },
  { value: 'low', label: '低 (Low)' },
  { value: 'info', label: '資訊 (Info)' },
]

const TAG_ALARM_MESSAGE_LEVEL_OPTIONS: { value: TagAlarmMessageLevel; label: string }[] = [
  { value: 'error', label: '錯誤' },
  { value: 'warning', label: '警告' },
  { value: 'success', label: '成功' },
  { value: 'info', label: '資訊' },
]

const TAG_ALARM_LEVEL_LABELS: Record<TagAlarmLevel, string> = {
  highhigh: '高高',
  high: '高',
  low: '低',
  info: '資訊',
}

interface FloorGroupFrameFormValues extends Omit<FloorGroupFrameSettings, 'fillOpacity'> {
  fillOpacityPercent: number
}

interface ViewPropertiesFormValues {
  bkcolor: string
  viewTitleColor: string
  viewTitleFontSize: number
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

function createPreviewState(
  config: ParsedFuxaConfig,
  view: FuxaViewSummary,
  models: Map<string, ExportViewModel>,
): PreviewState {
  try {
    return prepareViewPreview(config.rawConfig, view.id, [...models.values()], {
      Parser: DOMParser,
      serialize: (doc) => new XMLSerializer().serializeToString(doc),
      crypto: window.crypto,
    })
  } catch (error) {
    return {
      width: view.width || 1024,
      height: view.height || 768,
      error: error instanceof Error ? error.message : String(error),
    }
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
  const [deviceTagForm] = Form.useForm<ModbusTagFormValues>()
  const [floorFrameForm] = Form.useForm<FloorGroupFrameFormValues>()
  const [viewPropertiesForm] = Form.useForm<ViewPropertiesFormValues>()
  const [messageApi, contextHolder] = message.useMessage()
  const [projectName, setProjectName] = useState('新專案')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [previewRealtime, setPreviewRealtime] = useState(true)
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null)
  const [viewDialogMode, setViewDialogMode] = useState<'create' | 'rename' | null>(null)
  const [viewDialogTargetId, setViewDialogTargetId] = useState('')
  const [componentMoveSource, setComponentMoveSource] = useState<{
    viewId: string
    componentKey: string
  } | null>(null)
  const [componentMoveTargetId, setComponentMoveTargetId] = useState('')
  const [batchMoveDialogOpen, setBatchMoveDialogOpen] = useState(false)
  const [batchMoveSelection, setBatchMoveSelection] = useState<Set<string>>(new Set())
  const [batchSearch, setBatchSearch] = useState('')
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set())
  const [batchGraphic, setBatchGraphic] = useState('rect')
  const [batchCoilSwitchEnabled, setBatchCoilSwitchEnabled] = useState(true)
  const [tagCreateDeviceId, setTagCreateDeviceId] = useState('')
  const [tagCreateInput, setTagCreateInput] = useState('')
  const [tagCreateNameOverrides, setTagCreateNameOverrides] = useState<Record<number, string>>({})
  const [tagCreateStartAddress, setTagCreateStartAddress] = useState(1)
  const [tagCreateStep, setTagCreateStep] = useState(1)
  const [tagCreateMemaddress, setTagCreateMemaddress] = useState('000000')
  const [tagCreateType, setTagCreateType] = useState('Bool')
  const [tagCreateFloor, setTagCreateFloor] = useState('')
  const [tagCreateAlsoAddView, setTagCreateAlsoAddView] = useState(true)
  const [projectManagerTab, setProjectManagerTab] = useState<
    'devices' | 'floors' | 'alarms' | 'tag-create' | 'tag-add'
  >('devices')
  const [floorSearch, setFloorSearch] = useState('')
  const [floorDisplayMode, setFloorDisplayMode] = useState<'group' | 'list'>('group')
  const [floorSelection, setFloorSelection] = useState<Set<string>>(new Set())
  const [bulkFloor, setBulkFloor] = useState('')
  const [iconLibraryOpen, setIconLibraryOpen] = useState(false)
  const iconLibraryImportRef = useRef<HTMLInputElement>(null)
  const [editingMultiStateIconId, setEditingMultiStateIconId] = useState('')
  const [iconName, setIconName] = useState('')
  const [iconType, setIconType] = useState<'single' | 'pair' | 'multi-state'>('single')
  const [singleIconFile, setSingleIconFile] = useState<File | null>(null)
  const [normalIconFile, setNormalIconFile] = useState<File | null>(null)
  const [alarmIconFile, setAlarmIconFile] = useState<File | null>(null)
  const [multiStateDrafts, setMultiStateDrafts] = useState<MultiStateIconDraft[]>([
    { name: '', file: null },
  ])
  const [multiStateAddDrafts, setMultiStateAddDrafts] = useState<
    Record<string, MultiStateIconDraft>
  >({})
  const [deviceManagerOpen, setDeviceManagerOpen] = useState(false)
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [viewSettingsTab, setViewSettingsTab] = useState<'floor-frame' | 'view-properties'>('floor-frame')
  const [deviceManagerMode, setDeviceManagerMode] = useState<'create' | 'edit'>('edit')
  const [managedDeviceId, setManagedDeviceId] = useState('')
  const [deviceTagSearch, setDeviceTagSearch] = useState('')
  const [editingDeviceTagId, setEditingDeviceTagId] = useState('')
  const [deviceTagDialogOpen, setDeviceTagDialogOpen] = useState(false)
  const [tagAlarmTagIds, setTagAlarmTagIds] = useState<string[]>([])
  const [tagAlarmInversionDrafts, setTagAlarmInversionDrafts] = useState<Record<string, boolean>>({})
  const [tagAlarmSearch, setTagAlarmSearch] = useState('')
  const [tagAlarmText, setTagAlarmText] = useState('設備異常告警')
  const [tagAlarmLevel, setTagAlarmLevel] = useState<TagAlarmLevel>('highhigh')
  const [tagAlarmMessageLevel, setTagAlarmMessageLevel] = useState<TagAlarmMessageLevel>('error')
  const [tagAlarmTargetViewIds, setTagAlarmTargetViewIds] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [editor, dispatchEditor] = useReducer(
    editorHistoryReducer<ExportViewModel, ParsedFuxaConfig>,
    createEditorHistoryState<ExportViewModel, ParsedFuxaConfig>(),
  )
  const [modelErrors, setModelErrors] = useState<Map<string, string>>(new Map())
  const [unsupported, setUnsupported] = useState<Map<string, string[]>>(new Map())
  const { models, modifiedViewIds } = editor
  const config = editor.document
  const normalizedProjectName = normalizeProjectName(projectName)
  const projectNameNeedsExport = Boolean(config)
    && config?.rawConfig.name !== normalizedProjectName
  const isDirty = editor.configurationDirty || modifiedViewIds.size > 0 || projectNameNeedsExport

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
  const duplicateTagGroups = useMemo(() => {
    const names = new Map<string, typeof tags>()
    for (const tag of tags) {
      const name = tag.name.trim().toLocaleLowerCase()
      if (!name) continue
      const group = names.get(name) ?? []
      group.push(tag)
      names.set(name, group)
    }
    return [...names.values()].filter((group) => group.length > 1)
  }, [tags])
  const duplicateTagIds = useMemo(() => new Set(
    duplicateTagGroups.flatMap((group) => group.map((tag) => tag.id)),
  ), [duplicateTagGroups])
  const tagViewOptions = useMemo(() => {
    const optionsByTag = new Map<string, FuxaViewSummary[]>()
    if (!config) return optionsByTag
    const addTagView = (tagId: string, viewId: string, viewName?: string) => {
      const view = config.views.find((candidate) => candidate.id === viewId)
        ?? { id: viewId, key: viewId, name: viewName || viewId }
      const options = optionsByTag.get(tagId) ?? []
      if (!options.some((candidate) => candidate.id === viewId)) options.push(view)
      optionsByTag.set(tagId, options)
    }
    if (Array.isArray(config.rawConfig.hmi.views)) {
      for (const rawView of config.rawConfig.hmi.views) {
        if (!isRecord(rawView) || !isRecord(rawView.items)) continue
        const viewId = typeof rawView.id === 'string' ? rawView.id : ''
        if (!viewId) continue
        for (const item of Object.values(rawView.items)) {
          if (!isRecord(item) || !isRecord(item.property)) continue
          const tagId = item.property.variableId
          if (typeof tagId === 'string') {
            addTagView(tagId, viewId, String(rawView.name || viewId))
          }
        }
      }
    }
    for (const [viewId, model] of models) {
      const viewName = config.views.find((candidate) => candidate.id === viewId)?.name
      for (const component of model.components) {
        if (component.tagId) addTagView(component.tagId, viewId, viewName)
        for (const binding of component.multiStateBindings ?? []) {
          if (binding.tagId) addTagView(binding.tagId, viewId, viewName)
        }
      }
    }
    return optionsByTag
  }, [config, models])
  const selectedAlarmTags = tagAlarmTagIds.flatMap((tagId) => {
    const tag = tags.find((candidate) => candidate.id === tagId)
    return tag ? [tag] : []
  })
  const selectableAlarmTags = useMemo(
    () => tags.filter((tag) => tagViewOptions.has(tag.id)),
    [tagViewOptions, tags],
  )
  const alarmSettingsByTag = useMemo(() => {
    const settingsByTag = new Map<string, { level: TagAlarmLevel; text: string }[]>()
    const alarms = config?.rawConfig.alarms
    if (!Array.isArray(alarms)) return settingsByTag

    const levels: { key: TagAlarmLevel; label: string }[] = [
      { key: 'highhigh', label: '高高' },
      { key: 'high', label: '高' },
      { key: 'low', label: '低' },
      { key: 'info', label: '資訊' },
    ]
    for (const alarm of alarms) {
      if (!isRecord(alarm) || !isRecord(alarm.property)
          || typeof alarm.property.variableId !== 'string') continue
      const tagId = alarm.property.variableId
      const settings = levels.flatMap(({ key }) => {
        const level = alarm[key]
        return isRecord(level) && level.enabled === true
          ? [{
            level: key,
            text: typeof level.text === 'string' ? level.text : '',
          }]
          : []
      })
      if (settings.length) {
        settingsByTag.set(tagId, [...(settingsByTag.get(tagId) ?? []), ...settings])
      }
    }
    return settingsByTag
  }, [config])
  const alarmInversionByTag = useMemo(() => {
    const inversionByTag = new Map<string, boolean>()
    const alarms = config?.rawConfig.alarms
    if (!Array.isArray(alarms)) return inversionByTag

    for (const alarm of alarms) {
      if (!isRecord(alarm) || !isRecord(alarm.property)
          || typeof alarm.property.variableId !== 'string') continue
      const activeLevels = (['highhigh', 'high', 'low', 'info'] as const)
        .flatMap((key) => {
          const level = alarm[key]
          return isRecord(level) && level.enabled === true ? [level] : []
        })
      if (activeLevels.length) {
        inversionByTag.set(
          alarm.property.variableId,
          activeLevels.every((level) => level.min === 0 && level.max === 0),
        )
      }
    }
    return inversionByTag
  }, [config])
  const filteredAlarmTags = useMemo(() => {
    const query = tagAlarmSearch.trim().toLocaleLowerCase()
    return selectableAlarmTags.filter((tag) => (
      `${tag.deviceName} ${tag.name} ${tag.type} ${tag.memaddress} ${tag.id} ${tag.floor}`
        .toLocaleLowerCase()
        .includes(query)
    ))
  }, [selectableAlarmTags, tagAlarmSearch])
  const alarmTagGroups = useMemo(
    () => groupByFloor(filteredAlarmTags, (tag) => tag.floor),
    [filteredAlarmTags],
  )
  const tagAlarmTargetsMissing = selectedAlarmTags.some((tag) => (
    !tagViewOptions.get(tag.id)?.some((view) => view.id === tagAlarmTargetViewIds[tag.id])
  )) || selectedAlarmTags.length !== tagAlarmTagIds.length
  const tagsWithoutViewCount = tags.filter((tag) => !tagViewOptions.has(tag.id)).length
  const managedComponentGroups = useMemo(() => {
    if (!selectedModel) return []
    const components = selectedModel.components.filter(
      (component): component is GeneratedComponent => component.managed !== false,
    )
    const componentsByKey = new Map(components.map((component) => [component.key, component]))
    return groupComponentsByFloor(
      components,
      new Map(tags.map((tag) => [tag.id, tag] as const)),
    ).map((group) => ({
      ...group,
      items: group.items.flatMap((component) => {
        const managed = componentsByKey.get(component.key)
        return managed ? [managed] : []
      }),
    }))
  }, [selectedModel, tags])
  const iconLibrary = useMemo(
    () => config ? getIconLibrary(config.rawConfig) : [],
    [config],
  )
  const editingMultiStateIcon = iconLibrary.find((icon): icon is MultiStateIconSet =>
    icon.type === 'multi-state' && icon.id === editingMultiStateIconId)
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
  const managedDeviceTags = useMemo(() => (
    managedDevice && isRecord(managedDevice.record.tags)
      ? sortTagEntriesByAddress(Object.entries(managedDevice.record.tags))
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .map(([key, record]) => ({
          id: typeof record.id === 'string' ? record.id : key,
          name: typeof record.name === 'string' ? record.name : key,
          type: typeof record.type === 'string' ? record.type : '',
          address: record.address,
          memaddress: typeof record.memaddress === 'string' ? record.memaddress : '',
          description: typeof record.description === 'string' ? record.description : '',
          floor: isRecord(record.extra) && typeof record.extra.floor === 'string'
            ? record.extra.floor
            : '',
          record,
        }))
      : []
  ), [managedDevice])
  const autoFilledManagedDeviceTags = managedDeviceTags.filter(
    (tag) => tag.description === AUTO_FILLED_TAG_DESCRIPTION,
  )
  const filteredManagedDeviceTags = useMemo(() => {
    const query = deviceTagSearch.trim().toLocaleLowerCase()
    return managedDeviceTags.filter((tag) => (
      `${tag.name} ${tag.type} ${String(tag.address ?? '')} ${tag.memaddress} ${tag.floor}`
        .toLocaleLowerCase()
        .includes(query)
    ))
  }, [deviceTagSearch, managedDeviceTags])
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
  const batchableTags = useMemo(() => tags.filter((tag) => !isAutoFilledTag(tag)), [tags])
  const filteredBatchTags = useMemo(() => {
    const query = batchSearch.trim().toLocaleLowerCase()
    return batchableTags.filter((tag) => (
      `${tag.deviceName} ${tag.name} ${tag.type} ${tag.memaddress} ${tag.id} ${tag.floor}`
        .toLocaleLowerCase()
        .includes(query)
    ))
  }, [batchSearch, batchableTags])
  const selectedBatchCount = filteredBatchTags.filter((tag) => batchSelection.has(tag.id)).length
  const selectedBatchTags = batchableTags.filter((tag) => batchSelection.has(tag.id))
  const selectedCoilTags = selectedBatchTags.filter(isCoilTag)
  const selectedCoilSwitchTags = selectedCoilTags.filter((tag) =>
    ['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()))
  const batchCanUseBooleanGraphic = selectedBatchTags.length > 0
    && selectedBatchTags.every((tag) => ['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()))
  const parsedTagCreateSpecs = useMemo(() => parseTagBatchInput(tagCreateInput, {
    startAddress: tagCreateStartAddress,
    step: tagCreateStep,
    defaultMemAddress: tagCreateMemaddress,
    defaultType: tagCreateType,
    defaultFloor: tagCreateFloor,
  }), [
    tagCreateFloor,
    tagCreateInput,
    tagCreateMemaddress,
    tagCreateStartAddress,
    tagCreateStep,
    tagCreateType,
  ])
  const tagCreateSpecs = useMemo(() => parsedTagCreateSpecs.map((spec, index) => ({
    ...spec,
    name: tagCreateNameOverrides[index] ?? spec.name,
  })), [parsedTagCreateSpecs, tagCreateNameOverrides])
  const tagCreateDevice = config && isRecord(config.rawConfig.devices[tagCreateDeviceId])
    ? config.rawConfig.devices[tagCreateDeviceId]
    : undefined
  const tagCreateDuplicateNameRows = useMemo(() => {
    const duplicateRows = new Set<number>()
    const names = new Set<string>()
    if (config) {
      for (const candidate of Object.values(config.rawConfig.devices)) {
        if (!isRecord(candidate) || !isRecord(candidate.tags)) continue
        for (const tag of Object.values(candidate.tags)) {
          if (!isRecord(tag)) continue
          const name = typeof tag.name === 'string' ? tag.name.trim().toLocaleLowerCase() : ''
          if (name) names.add(name)
        }
      }
    }
    tagCreateSpecs.forEach((spec, index) => {
      const name = spec.name.trim().toLocaleLowerCase()
      if (!name) return
      if (names.has(name)) duplicateRows.add(index)
      names.add(name)
    })
    return duplicateRows
  }, [config, tagCreateSpecs])
  const tagCreateInvalidNameRows = useMemo(() => new Set(
    tagCreateSpecs.flatMap((spec, index) => (
      !spec.name.trim() || spec.name.trim().length > 120 ? [index] : []
    )),
  ), [tagCreateSpecs])
  const tagCreateDuplicateAddressRows = useMemo(() => {
    const duplicateRows = new Set<number>()
    const existingTags = tagCreateDevice && isRecord(tagCreateDevice.tags)
      ? Object.values(tagCreateDevice.tags).filter(isRecord)
      : []
    const addresses = new Set(existingTags.map(
      (tag) => `${String(tag.memaddress || '')}_${String(tag.address ?? '')}`,
    ))
    tagCreateSpecs.forEach((spec, index) => {
      const address = `${spec.memaddress}_${spec.address}`
      if (addresses.has(address)) duplicateRows.add(index)
      addresses.add(address)
    })
    return duplicateRows
  }, [tagCreateDevice, tagCreateSpecs])
  const hasTagCreateDuplicateNames = tagCreateDuplicateNameRows.size > 0
  const hasTagCreateInvalidNames = tagCreateInvalidNameRows.size > 0
  const usedTagIds = new Set(selectedModel?.components.map((component) => component.tagId) ?? [])
  const filteredFloorTags = useMemo(() => {
    const query = floorSearch.trim().toLocaleLowerCase()
    return tags.filter((tag) => (
      `${tag.deviceName} ${tag.name} ${tag.floor} ${tag.type} ${tag.id} ${String(tag.record.address ?? '')}`
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
  const preview = previewSnapshot && selectedView
    && previewSnapshot.viewId === selectedView.id
    ? previewSnapshot.result
    : null
  const previewStale = !config || !selectedView
    ? false
    : !previewSnapshot
      || previewSnapshot.config !== config
      || previewSnapshot.models !== models
      || previewSnapshot.viewId !== selectedView.id

  useEffect(() => {
    if (!previewRealtime || !config || !selectedView) return
    const timeout = window.setTimeout(() => {
      setPreviewSnapshot({
        result: createPreviewState(config, selectedView, models),
        config,
        models,
        viewId: selectedView.id,
      })
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [config, models, previewRealtime, selectedView])

  function handleRefreshPreview() {
    if (!config || !selectedView) return
    setPreviewSnapshot({
      result: createPreviewState(config, selectedView, models),
      config,
      models,
      viewId: selectedView.id,
    })
  }

  async function loadFile(file: File) {
    setIsLoading(true)
    try {
      const text = await file.text()
      const parsed = parseFuxaConfig(text)
      replaceWorkspace(parsed)
      const configuredName = parsed.rawConfig.name
      const nextProjectName = typeof configuredName === 'string' && configuredName.trim()
        ? normalizeProjectName(configuredName)
        : normalizeProjectName(file.name)
      setProjectName(nextProjectName)
      messageApi.success(`已載入 ${file.name}；專案名稱為「${nextProjectName}」。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知錯誤'
      messageApi.error(`載入失敗：${detail}`)
    } finally {
      setIsLoading(false)
    }
  }

  function replaceWorkspace(parsed: ParsedFuxaConfig) {
    getIconLibrary(parsed.rawConfig)
    const editorModels = buildViewEditorModels(parsed.rawConfig, DOMParser, measureSvgBounds)
    dispatchEditor({
      type: 'reset',
      models: editorModels.models,
      document: parsed,
    })
    setModelErrors(editorModels.errors)
    setUnsupported(editorModels.unsupported)
    setBatchSearch('')
    setBatchSelection(new Set())
    const firstView = parsed.views[0]
    setSelectedViewId(firstView ? firstView.id || firstView.key : '')
  }

  function handleClearProject() {
    function createProject() {
      try {
        const text = `${JSON.stringify(createEmptyFuxaConfig(), null, 4)}\n`
        replaceWorkspace(parseFuxaConfig(text))
        setProjectName('新專案')
        messageApi.success('已建立空白 FUXA 專案，可另存新 JSON。')
      } catch (error) {
        const detail = error instanceof Error ? error.message : '未知錯誤'
        messageApi.error(`建立空白專案失敗：${detail}`)
      }
    }

    if (!config) {
      createProject()
      return
    }

    Modal.confirm({
      title: '清空目前專案？',
      content: isDirty
        ? '目前專案尚有未匯出的修改。建立空白專案後，這些修改將無法復原；原始檔不會被修改。'
        : '目前載入的專案將被空白 FUXA 範本取代；原始檔不會被修改。',
      okText: '清空並建立',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: createProject,
    })
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
      const outputFileName = projectFileName(normalizedProjectName)
      const hasFloorFrames = [...models.values()].some((model) =>
        model.components.length > 0 || Object.keys(model.floorFrames).length > 0)
      const floorFrameLayoutNeedsUpdate = !hasCurrentFloorFrameLayout(config.rawConfig)
        && hasFloorFrames
      const exportDirty = isDirty
        || findLegacySwitchViewIds([...models.values()]).size > 0
        || floorFrameLayoutNeedsUpdate
        || deviceTagsNeedAddressSorting(config.rawConfig)
        || needsVoiceScriptUpdate(config.rawConfig)
      const dependencies = exportDirty
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
        dirty: exportDirty,
        projectName: normalizedProjectName,
        models: [...models.values()],
        modifiedViewIds,
        tags: buildTagIndex(config.rawConfig),
      }, dependencies)
      const blob = new Blob([prepared.text], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = outputFileName
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

  function handleMoveComponent(viewId: string, key: string, direction: -1 | 1) {
    const model = models.get(viewId)
    if (!model) return
    const nextComponents = moveManagedComponent(
      model.components,
      key,
      direction,
      new Map(tags.map((tag) => [tag.id, tag] as const)),
    )
    if (nextComponents.every((component, index) => component === model.components[index])) return
    dispatchEditor({
      type: 'edit',
      viewId,
      model: { ...model, components: nextComponents },
    })
  }

  function openComponentMoveDialog(viewId: string, componentKey: string) {
    const targetView = config?.views.find((view) => {
      const id = view.id || view.key
      return id !== viewId && models.has(id)
    })
    if (!targetView) {
      messageApi.info('沒有其他可編輯的 View 可移動元件。')
      return
    }
    setComponentMoveSource({ viewId, componentKey })
    setComponentMoveTargetId(targetView.id || targetView.key)
  }

  function openBatchMoveDialog(viewId: string) {
    const targetView = config?.views.find((view) => {
      const id = view.id || view.key
      return id !== viewId && models.has(id)
    })
    if (!targetView) {
      messageApi.info('沒有其他可編輯的 View 可移動元件。')
      return
    }
    setBatchMoveSelection(new Set())
    setComponentMoveTargetId(targetView.id || targetView.key)
    setBatchMoveDialogOpen(true)
  }

  function moveComponentsToView(
    sourceViewId: string,
    componentKeys: readonly string[],
    targetViewId: string,
  ): boolean {
    if (!config || !componentKeys.length || !targetViewId) return false
    const sourceModel = models.get(sourceViewId)
    const targetModel = models.get(targetViewId)
    if (!sourceModel || !targetModel || sourceViewId === targetViewId) {
      messageApi.error('來源或目標 View 不可編輯，無法移動元件。')
      return false
    }
    const keySet = new Set(componentKeys)
    const components = sourceModel.components.filter((item) =>
      keySet.has(item.key) && item.managed !== false)
    if (components.length !== keySet.size) {
      messageApi.error('部分選取項目已不存在或不是可移動的受管理元件。')
      return false
    }

    const usedKeys = new Set(
      [...models.values()].flatMap((model) => model.components.map((item) => item.key)),
    )
    let sequence = targetModel.components.reduce((maximum, item) => {
      if (item.managed === false || !Number.isSafeInteger(item.seq)) return maximum
      return Math.max(maximum, item.seq ?? 0)
    }, 0)
    const movedComponents = components.map((component) => ({
      ...component,
      key: `moved-${generateId('component', usedKeys, window.crypto)}`,
      seq: ++sequence,
    }))
    const nextModels = new Map(models)
    nextModels.set(sourceViewId, {
      ...sourceModel,
      components: sourceModel.components.filter((item) => !keySet.has(item.key)),
    })
    nextModels.set(targetViewId, {
      ...targetModel,
      components: [...targetModel.components, ...movedComponents],
    })
    const nextModifiedViewIds = new Set(modifiedViewIds)
    nextModifiedViewIds.add(sourceViewId)
    nextModifiedViewIds.add(targetViewId)
    dispatchEditor({
      type: 'document-edit',
      document: config,
      models: nextModels,
      modifiedViewIds: nextModifiedViewIds,
    })
    setSelectedViewId(targetViewId)
    const targetName = config.views.find((view) =>
      (view.id || view.key) === targetViewId)?.name || targetViewId
    messageApi.success(`已將 ${components.length} 個元件移動至 View「${targetName}」。`)
    return true
  }

  function handleMoveComponentToView() {
    if (!config || !componentMoveSource || !componentMoveTargetId) return
    const { viewId: sourceViewId, componentKey } = componentMoveSource
    const component = models.get(sourceViewId)?.components.find((item) =>
      item.key === componentKey && item.managed !== false)
    if (!component) {
      messageApi.error('找不到要移動的受管理元件。')
      return
    }
    if (moveComponentsToView(sourceViewId, [componentKey], componentMoveTargetId)) {
      setComponentMoveSource(null)
      setComponentMoveTargetId('')
    }
  }

  function handleUpdateComponent(
    viewId: string,
    key: string,
    update: Partial<Pick<
      GeneratedComponent,
      | 'label' | 'tagId' | 'palette' | 'template' | 'iconId'
      | 'normalIconId' | 'alarmIconId' | 'alarmShapeId' | 'invertIconState'
      | 'multiIconSetId' | 'multiStateBindings'
    >>,
  ) {
    const model = models.get(viewId)
    if (!model) return
    const component = model.components.find((item) => item.key === key)
    if (!component || component.managed === false) return
    if (component.template === 'switch' && update.tagId) {
      const tag = tags.find((candidate) => candidate.id === update.tagId)
      if (!tag || !isCoilTag(tag)
          || !['bool', 'boolean'].includes(tag.type.toLocaleLowerCase())) {
        messageApi.warning('Switch 只能綁定 Boolean Coil Tag。')
        return
      }
    }

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
    if (!model || !config) return
    try {
      if (value.startsWith('pair:')
          && !['bool', 'boolean'].includes(
            tags.find((tag) => tag.id === component.tagId)?.type.toLocaleLowerCase() ?? '',
          )) {
        messageApi.warning('正常／告警圖示組需要綁定 Boolean Tag，請先變更 Tag 型別。')
        return
      }
      if (value.startsWith('multi:')
          && !['bool', 'boolean'].includes(
            tags.find((tag) => tag.id === component.tagId)?.type.toLocaleLowerCase() ?? '',
          )) {
        messageApi.warning('多狀態圖示組需要 Boolean Tag，請先選擇 Boolean Tag。')
        return
      }
      const usedIds = new Set(buildTagIndex(config.rawConfig).keys())
      for (const view of config.rawConfig.hmi.views) {
        if (!isRecord(view)) continue
        if (isRecord(view.items)) Object.keys(view.items).forEach((id) => usedIds.add(id))
        if (typeof view.svgcontent === 'string') {
          const doc = parseSvg(view.svgcontent, DOMParser)
          for (const node of Array.from(doc.getElementsByTagName('*'))) {
            const id = node.getAttribute('id')
            if (id) usedIds.add(id)
          }
        }
      }
      for (const currentModel of models.values()) {
        for (const item of currentModel.components) {
          if (item.shapeId) usedIds.add(item.shapeId)
          if (item.labelId) usedIds.add(item.labelId)
          if (item.alarmShapeId) usedIds.add(item.alarmShapeId)
          for (const binding of item.multiStateBindings ?? []) {
            if (binding.shapeId) usedIds.add(binding.shapeId)
          }
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
            && updated.alarmIconId === component.alarmIconId
            && updated.multiIconSetId === component.multiIconSetId
            && JSON.stringify(updated.multiStateBindings) ===
              JSON.stringify(component.multiStateBindings))) return
      dispatchEditor({
        type: 'edit',
        viewId,
        model: {
          ...model,
          components: model.components.map((item) => (
            item.key === component.key ? updated : item
          )),
        },
      })
    } catch (error) {
      messageApi.error(`更新元件圖形失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function handleUpdateMultiStateBinding(
    viewId: string,
    component: GeneratedComponent,
    stateKey: string,
    tagId: string,
  ) {
    const bindings = component.multiStateBindings ?? []
    const binding = bindings.find((candidate) => candidate.stateKey === stateKey)
    if (!binding) return
    const selectedTag = tags.find((tag) => tag.id === tagId)
    if (tagId && (!selectedTag || !['bool', 'boolean'].includes(
      selectedTag.type.toLocaleLowerCase(),
    ))) {
      messageApi.warning('多狀態規則只能綁定 Boolean Tag。')
      return
    }
    if (tagId && bindings.some(
      (candidate) => candidate.stateKey !== stateKey && candidate.tagId === tagId,
    )) {
      messageApi.warning('同一元件的多個狀態不能重複使用相同的 Tag。')
      return
    }
    const nextBindings = bindings.map((candidate) => (
      candidate.stateKey === stateKey ? { ...candidate, tagId } : candidate
    ))
    handleUpdateComponent(viewId, component.key, {
      multiStateBindings: nextBindings,
      tagId: nextBindings[0]?.tagId ?? '',
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

  function openBatchAddTab() {
    setBatchSelection(new Set())
    setBatchSearch('')
    setBatchGraphic('rect')
    setBatchCoilSwitchEnabled(true)
    setProjectManagerTab('tag-add')
    setDeviceManagerOpen(true)
  }

  function openTagCreateTab() {
    if (!config) return
    const deviceIds = Object.keys(config.rawConfig.devices).filter((id) => id !== '0')
    const deviceId = deviceIds.includes(managedDeviceId)
      ? managedDeviceId
      : deviceIds[0] ?? ''
    setTagCreateDeviceId(deviceId)
    setTagCreateInput('')
    setTagCreateNameOverrides({})
    setTagCreateStartAddress(deviceId
      ? getNextAvailableAddress(config.rawConfig.devices[deviceId], tagCreateMemaddress)
      : 1)
    setTagCreateAlsoAddView(true)
    setProjectManagerTab('tag-create')
    setDeviceManagerOpen(true)
  }

  function toggleVisibleAlarmTags(checked: boolean) {
    setTagAlarmTagIds((current) => {
      const next = new Set(current)
      for (const tag of filteredAlarmTags) {
        if (checked) next.add(tag.id)
        else next.delete(tag.id)
      }
      return [...next]
    })
    if (checked) {
      setTagAlarmTargetViewIds((current) => {
        const next = { ...current }
        for (const tag of filteredAlarmTags) {
          const options = tagViewOptions.get(tag.id) ?? []
          if (options.length === 1) next[tag.id] = options[0]?.id ?? ''
        }
        return next
      })
    }
  }

  function handleToggleAlarmTagInversion(tagId: string, inverted: boolean) {
    if (!config) return
    if (!alarmSettingsByTag.has(tagId)) {
      setTagAlarmInversionDrafts((current) => ({ ...current, [tagId]: inverted }))
      return
    }

    try {
      const result = updateTagAlarmInversion(config.rawConfig, tagId, inverted)
      if (!result.updated) return
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(result.config, config),
        models,
      })
      setTagAlarmInversionDrafts((current) => {
        const next = { ...current }
        delete next[tagId]
        return next
      })
      messageApi.success(`已更新 Tag「${tags.find((tag) => tag.id === tagId)?.name ?? tagId}」的告警狀態。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`更新告警狀態失敗：${detail}`)
    }
  }

  function handleCreateTagAlarms() {
    if (!config) return
    if (!tagAlarmTagIds.length) {
      messageApi.warning('請至少選擇一個 Tag。')
      return
    }
    if (!tagAlarmText.trim()) {
      messageApi.warning('請輸入告警文字。')
      return
    }
    if (tagAlarmTargetsMissing) {
      messageApi.warning('請為每個 Tag 選擇告警動作要前往的 View。')
      return
    }

    try {
      const result = applyTagAlarms(
        config.rawConfig,
        selectedAlarmTags.map((tag) => ({
          tagId: tag.id,
          tagName: tag.name,
          text: tagAlarmText,
          level: tagAlarmLevel,
          messageLevel: tagAlarmMessageLevel,
          invertState: alarmInversionByTag.get(tag.id)
            ?? tagAlarmInversionDrafts[tag.id]
            ?? false,
          viewId: tagAlarmTargetViewIds[tag.id] ?? '',
        })),
      )
      const document = parseUpdatedConfig(result.config, config)
      dispatchEditor({ type: 'document-edit', document, models })
      messageApi.success(
        `已設定 ${result.created + result.updated} 個告警（新增 ${result.created} 個、更新 ${result.updated} 個）。`,
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`批次設定告警失敗：${detail}`)
    }
  }

  function handleQuickSetAlarmTexts() {
    if (!config) return
    try {
      const result = updateExistingTagAlarmTexts(
        config.rawConfig,
        new Map(tags.map((tag) => [tag.id, tag.name])),
        tagAlarmMessageLevel,
      )
      if (!result.updated && !result.toastMessagesAdded) {
        messageApi.info('既有告警文字與 toastMessage 都已是最新設定。')
        return
      }
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(result.config, config),
        models,
      })
      messageApi.success(
        `已更新 ${result.updated} 筆告警，並新增 ${result.toastMessagesAdded} 個 toastMessage。`,
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`快速更新告警文字失敗：${detail}`)
    }
  }

  function renderTagAlarmSettings() {
    return (
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Space align="center" wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary">
            多選要設定的 Tag，告警文字與等級會套用至全部選取項目。布林 Tag 可反轉告警狀態（由 1 改為 0），告警觸發時會跳轉至指定 View。
          </Text>
          <Button
            disabled={alarmSettingsByTag.size === 0}
            onClick={handleQuickSetAlarmTexts}
            title="將所有已啟用告警的文字更新為 Tag 名稱加上「異常」"
          >
            快速設定
          </Button>
        </Space>
        {tagsWithoutViewCount > 0 && (
          <Alert
            type="info"
            showIcon
            message={`${tagsWithoutViewCount} 個尚未在任何 View 使用的 Tag 不列入選項，因為沒有可跳轉的 Tag 頁面。`}
          />
        )}
        <Input
          aria-label="搜尋告警 Tag"
          allowClear
          placeholder="搜尋設備、Tag、型別、ID 或樓層"
          value={tagAlarmSearch}
          onChange={(event) => setTagAlarmSearch(event.target.value)}
          style={{ margin: '12px 0' }}
        />
        <div className="floor-manager-toolbar">
          <Text type="secondary">
            {selectableAlarmTags.length} 個可設定 Tag · 已選 {tagAlarmTagIds.length} 個
          </Text>
        </div>
        <div className="floor-bulk-toolbar">
          <Checkbox
            checked={filteredAlarmTags.length > 0
              && filteredAlarmTags.every((tag) => tagAlarmTagIds.includes(tag.id))}
            indeterminate={filteredAlarmTags.some((tag) => tagAlarmTagIds.includes(tag.id))
              && !filteredAlarmTags.every((tag) => tagAlarmTagIds.includes(tag.id))}
            disabled={filteredAlarmTags.length === 0}
            onChange={(event) => toggleVisibleAlarmTags(event.target.checked)}
          >
            全選可見 Tag
          </Checkbox>
        </div>
        <div className="floor-tag-list alarm-tag-list" role="group" aria-label="告警 Tag 清單">
          {filteredAlarmTags.length ? alarmTagGroups.map((group) => (
            <section className="floor-tag-group" key={group.floor || 'all'}>
              {group.title && (
                <div className="floor-tag-group-title">
                  {group.title} · {group.items.length} 個 Tag
                </div>
              )}
              {group.items.map((tag) => (
                <div className="alarm-tag-row" key={tag.id}>
                  <Checkbox
                    aria-label={`選取 ${tag.deviceName}／${tag.name}`}
                    checked={tagAlarmTagIds.includes(tag.id)}
                    onChange={(event) => {
                      setTagAlarmTagIds((current) => event.target.checked
                        ? [...current, tag.id]
                        : current.filter((tagId) => tagId !== tag.id))
                      if (event.target.checked) {
                        const options = tagViewOptions.get(tag.id) ?? []
                        setTagAlarmTargetViewIds((current) => ({
                          ...current,
                          [tag.id]: options.length === 1 ? options[0]?.id ?? '' : '',
                        }))
                      }
                    }}
                  />
                  <span className="floor-tag-name" title={tag.name}>{tag.name}</span>
                  <Text className="floor-tag-device" type="secondary" title={tag.deviceName}>
                    {tag.deviceName}
                  </Text>
                  <Text
                    className="floor-tag-address"
                    type="secondary"
                    title={`Address: ${String(tag.record.address ?? '未設定')}`}
                  >
                    Address: {String(tag.record.address ?? '未設定')}
                  </Text>
                  {['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()) && (
                    <Checkbox
                      aria-label={`${tag.name} 反轉狀態`}
                      title="啟用中的告警條件由 Tag 值 1 改為 0"
                      checked={alarmInversionByTag.get(tag.id)
                        ?? tagAlarmInversionDrafts[tag.id]
                        ?? false}
                      onChange={(event) => handleToggleAlarmTagInversion(
                        tag.id,
                        event.target.checked,
                      )}
                    >
                      反轉狀態
                    </Checkbox>
                  )}
                  <div className="alarm-tag-settings" aria-label={`${tag.name} 已設定告警`}>
                    {alarmSettingsByTag.get(tag.id)?.length ? (
                      alarmSettingsByTag.get(tag.id)?.map(({ level, text }, index) => (
                        <div className="alarm-tag-setting" key={`${level}-${index}`}>
                          <Tag>{TAG_ALARM_LEVEL_LABELS[level]}</Tag>
                          <Text
                            type="secondary"
                            ellipsis={{ tooltip: text || '未設定告警文字' }}
                          >
                            {text || '未設定告警文字'}
                          </Text>
                        </div>
                      ))
                    ) : (
                      <Text type="secondary">未設定告警</Text>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="沒有符合條件且已加入 View 的 Tag。"
            />
          )}
        </div>
        <label>
          告警文字（套用至所有選取 Tag）
          <Input
            aria-label="批次告警文字"
            maxLength={120}
            value={tagAlarmText}
            onChange={(event) => setTagAlarmText(event.target.value)}
          />
        </label>
        <label>
          告警等級（套用至所有選取 Tag）
          <Select
            aria-label="批次告警等級"
            value={tagAlarmLevel}
            options={TAG_ALARM_LEVEL_OPTIONS}
            onChange={setTagAlarmLevel}
          />
        </label>
        <label>
          Message 層級（套用至所有選取 Tag）
          <Select
            aria-label="Message 層級"
            value={tagAlarmMessageLevel}
            options={TAG_ALARM_MESSAGE_LEVEL_OPTIONS}
            onChange={setTagAlarmMessageLevel}
          />
        </label>
        {selectedAlarmTags.length > 0 && (
          <section className="device-tag-manager" aria-label="告警跳轉頁面設定">
            <div className="device-tag-manager-heading">
              <Text strong>告警動作目標頁面</Text>
              <Text type="secondary">每個 Tag 可指定不同頁面</Text>
            </div>
            <Space orientation="vertical" style={{ width: '100%' }}>
              {selectedAlarmTags.map((tag) => {
                const options = tagViewOptions.get(tag.id) ?? []
                return (
                  <div className="device-tag-row" key={tag.id}>
                    <Text strong ellipsis title={`${tag.deviceName} / ${tag.name}`}>
                      {tag.deviceName} / {tag.name}
                    </Text>
                    <Select
                      aria-label={`${tag.name} 告警目標 View`}
                      placeholder={options.length
                        ? '選擇告警時要前往的 View'
                        : '此 Tag 尚未加入任何 View'}
                      disabled={options.length === 0}
                      value={tagAlarmTargetViewIds[tag.id] || undefined}
                      options={options.map((view) => ({
                        value: view.id,
                        label: view.name,
                      }))}
                      onChange={(viewId: string) => setTagAlarmTargetViewIds((current) => ({
                        ...current,
                        [tag.id]: viewId,
                      }))}
                      style={{ minWidth: 240 }}
                    />
                  </div>
                )
              })}
            </Space>
          </section>
        )}
        {selectedAlarmTags.some((tag) => (tagViewOptions.get(tag.id) ?? []).length > 1) && (
          <Alert
            type="info"
            showIcon
            message="部分 Tag 出現在多個 View，請指定告警觸發時要前往的頁面。"
          />
        )}
      </Space>
    )
  }

  function renderTagCreateForm() {
    return (
      <Space orientation="vertical" size="middle" className="tag-create-manager">
        <Text type="secondary">
          每行輸入一個 Tag 名稱；也可貼上逗號或 Tab 分隔資料。名稱須全專案唯一，可直接在下方預覽修改；重複位址僅提示。
        </Text>
        <div className="tag-create-settings">
          <label>
            目標設備
            <Select
              aria-label="批次建立 Tag 目標設備"
              value={tagCreateDeviceId || undefined}
              placeholder="選擇設備"
              options={config
                ? Object.entries(config.rawConfig.devices)
                  .filter(([id]) => id !== '0')
                  .map(([id, value]) => ({
                    value: id,
                    label: `${String(isRecord(value) ? value.name || id : id)} (${id})`,
                  }))
                : []}
              onChange={(deviceId: string) => {
                setTagCreateDeviceId(deviceId)
                setTagCreateStartAddress(
                  getNextAvailableAddress(
                    config?.rawConfig.devices[deviceId],
                    tagCreateMemaddress,
                  ),
                )
              }}
            />
          </label>
          <label>
            記憶體區段
            <Select
              aria-label="Tag 記憶體區段"
              value={tagCreateMemaddress}
              options={[
                { value: '000000', label: '000000 · Coils' },
                { value: '100000', label: '100000 · Discrete Inputs' },
                { value: '300000', label: '300000 · Input Registers' },
                { value: '400000', label: '400000 · Holding Registers' },
              ]}
              onChange={setTagCreateMemaddress}
            />
          </label>
          <label>
            預設型別
            <Select
              aria-label="Tag 預設型別"
              value={tagCreateType}
              options={[
                { value: 'Bool', label: 'Bool' },
                { value: 'number', label: 'number' },
                { value: 'string', label: 'string' },
              ]}
              onChange={setTagCreateType}
            />
          </label>
          <label>
            起始位址
            <InputNumber
              aria-label="Tag 起始位址"
              min={0}
              precision={0}
              value={tagCreateStartAddress}
              onChange={(value) => setTagCreateStartAddress(value ?? 0)}
            />
          </label>
          <label>
            遞增步長
            <InputNumber
              aria-label="Tag 遞增步長"
              min={1}
              precision={0}
              value={tagCreateStep}
              onChange={(value) => setTagCreateStep(value ?? 1)}
            />
          </label>
          <label>
            預設樓層
            <Input
              aria-label="Tag 批次預設樓層"
              value={tagCreateFloor}
              placeholder="例如：4F"
              onChange={(event) => setTagCreateFloor(event.target.value)}
            />
          </label>
        </div>
        <Input.TextArea
          aria-label="批次 Tag 資料"
          rows={6}
          value={tagCreateInput}
          onChange={(event) => {
            setTagCreateInput(event.target.value)
            setTagCreateNameOverrides({})
          }}
          placeholder={'泵浦運轉\n風機告警\n也可用欄位：名稱, 位址, 型別, 區段, 備註, 樓層'}
        />
        <div className="tag-create-preview-heading">
          <Text strong>建立預覽</Text>
          <Text type="secondary">{tagCreateSpecs.length} 筆 Tag</Text>
        </div>
        {tagCreateSpecs.length ? (
          <div className="tag-create-preview">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tag 名稱</th>
                  <th>位址</th>
                  <th>區段</th>
                  <th>型別</th>
                  <th>樓層</th>
                  <th>名稱檢查</th>
                  <th>位址檢查</th>
                </tr>
              </thead>
              <tbody>
                {tagCreateSpecs.map((spec: TagBatchSpec, index) => (
                  <tr key={`${spec.name}-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <Input
                        aria-label={`第 ${index + 1} 筆 Tag 名稱`}
                        status={tagCreateDuplicateNameRows.has(index)
                          || tagCreateInvalidNameRows.has(index) ? 'error' : undefined}
                        maxLength={120}
                        value={spec.name}
                        onChange={(event) => setTagCreateNameOverrides((current) => ({
                          ...current,
                          [index]: event.target.value,
                        }))}
                      />
                    </td>
                    <td>{spec.address}</td>
                    <td>{spec.memaddress}</td>
                    <td>{spec.type}</td>
                    <td>{spec.floor || '未設定'}</td>
                    <td>
                      {tagCreateInvalidNameRows.has(index)
                        ? <Text type="danger">名稱不可空白或過長</Text>
                        : tagCreateDuplicateNameRows.has(index)
                        ? <Text type="danger">名稱重複</Text>
                        : <Text type="success">正常</Text>}
                    </td>
                    <td>
                      {tagCreateDuplicateAddressRows.has(index)
                        ? <Text type="warning">位址重複</Text>
                        : <Text type="success">正常</Text>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="輸入或貼上 Tag 名稱以預覽。" />
        )}
        <Checkbox
          checked={tagCreateAlsoAddView}
          disabled={!selectedView || !selectedModel}
          onChange={(event) => setTagCreateAlsoAddView(event.target.checked)}
        >
          同時將建立的 Tag 作為元件加入目前 View
        </Checkbox>
        {tagCreateAlsoAddView && tagCreateSpecs.some((spec) =>
          spec.memaddress.trim() === '000000'
          && ['bool', 'boolean'].includes(spec.type.toLocaleLowerCase())) && (
          <Text type="secondary">
            Boolean Coil Tag 會建立為 Switch，並顯示 Tag 名稱標籤。
          </Text>
        )}
      </Space>
    )
  }

  function handleCreateTags() {
    if (!config || !tagCreateDeviceId) {
      messageApi.warning('請先選取目標設備。')
      return
    }
    if (!tagCreateSpecs.length) {
      messageApi.warning('未解析出任何有效的 Tag 項目。')
      return
    }
    if (hasTagCreateInvalidNames) {
      messageApi.warning('Tag 名稱不可空白或超過 120 個字元。')
      return
    }
    if (hasTagCreateDuplicateNames) {
      messageApi.warning('Tag 名稱不可重複，請先修改預覽中標示的名稱。')
      return
    }

    try {
      const result = createTagsForDevice(
        config.rawConfig,
        tagCreateDeviceId,
        tagCreateSpecs,
        window.crypto,
      )
      const document = parseUpdatedConfig(result.config, config)
      const nextModels = new Map(models)
      let addedToViewCount = 0
      if (tagCreateAlsoAddView && selectedView && selectedModel) {
        const createdIds = new Set(result.created.map((tag) => tag.id))
        const createdTags = [...buildTagIndex(result.config).values()]
          .filter((tag) => createdIds.has(tag.id))
        const coilSwitchTagIds = new Set(createdTags
          .filter((tag) => isCoilTag(tag)
            && ['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()))
          .map((tag) => tag.id))
        nextModels.set(selectedView.id, createViewComponents(
          result.config,
          selectedModel,
          nextModels,
          createdTags,
          { Parser: DOMParser, crypto: window.crypto },
          'rect',
          [],
          coilSwitchTagIds,
        ))
        addedToViewCount = createdTags.length
      }
      dispatchEditor({ type: 'document-edit', document, models: nextModels })
      setTagCreateInput('')
      setTagCreateNameOverrides({})
      setTagCreateStartAddress(
        getNextAvailableAddress(result.config.devices[tagCreateDeviceId], tagCreateMemaddress),
      )
      const autoFillMessage = result.autoFilled.length
        ? `，並自動補齊 ${result.autoFilled.length} 個地址`
        : ''
      const viewMessage = addedToViewCount
        ? `，並加入目前 View ${addedToViewCount} 個元件`
        : ''
      messageApi.success(
        `已為設備「${tagCreateDevice?.name || tagCreateDeviceId}」批次建立 ${result.created.length} 個 Tag${autoFillMessage}${viewMessage}。`,
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`批次建立 Tag 失敗：${detail}`)
    }
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
    if (batchGraphic.startsWith('multi:')
        && selectedTags.some((tag) => !['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()))) {
      messageApi.warning('多狀態圖示組只能套用至 Boolean Tag；請調整選取的 Tag。')
      return
    }
    if (batchCoilSwitchEnabled
        && selectedCoilTags.some((tag) =>
          !['bool', 'boolean'].includes(tag.type.toLocaleLowerCase()))) {
      messageApi.warning('Coil Switch 需要 Boolean Tag；請取消選取型別不符的 Coil Tag，或關閉 Coil Switch 選項。')
      return
    }

    try {
      const switchTagIds = batchCoilSwitchEnabled
        ? new Set(selectedCoilSwitchTags.map((tag) => tag.id))
        : new Set<string>()
      const nextModels = createViewComponents(
        config.rawConfig,
        selectedModel,
        models,
        selectedTags,
        { Parser: DOMParser, crypto: window.crypto },
        batchGraphic,
        iconLibrary,
        switchTagIds,
      )
      dispatchEditor({
        type: 'edit',
        viewId: selectedView.id,
        model: nextModels,
      })
      setDeviceManagerOpen(false)
      setBatchSelection(new Set())
      messageApi.success(`已加入 ${selectedTags.length} 筆 Tag 元件。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`批次加入 Tag 失敗：${detail}`)
    }
  }

  function renderBatchAddForm() {
    return (
      <>
        <Text type="secondary">
          Tag 會沿用配置中的樓層；未設定樓層的 Tag 會歸入「未設定樓層」。
        </Text>
        <Select
          aria-label="批次圖形"
          value={batchGraphic}
          options={getComponentGraphicChoices(
            iconLibrary,
            {
              key: 'batch',
              seq: 0,
              tagId: selectedBatchTags[0]?.id ?? '',
              label: '',
              template: 'rect',
              shapeId: '',
              managed: true,
            },
            batchCanUseBooleanGraphic,
          )}
          onChange={setBatchGraphic}
          style={{ width: '100%', marginTop: 12 }}
        />
        {selectedCoilTags.length > 0 && (
          <Space orientation="vertical" size={4} style={{ marginTop: 12 }}>
            <Checkbox
              checked={batchCoilSwitchEnabled}
              onChange={(event) => setBatchCoilSwitchEnabled(event.target.checked)}
            >
              Coil Tag 建立為 Switch，並顯示 Tag 名稱標籤
            </Checkbox>
            <Text type="secondary">
              {batchCoilSwitchEnabled
                ? `將建立 ${selectedCoilSwitchTags.length} 個 Switch、${selectedBatchTags.length - selectedCoilSwitchTags.length} 個一般元件。`
                : `將建立 ${selectedBatchTags.length} 個一般元件。`}
            </Text>
            {selectedCoilSwitchTags.length < selectedCoilTags.length && (
              <Text type="warning">
                非 Boolean 型別的 Coil 不可轉為 Switch。
              </Text>
            )}
          </Space>
        )}
        {batchGraphic.startsWith('multi:') && (
          <Text type="secondary">
            每筆 Tag 各建立一個元件，並綁定至所選多狀態圖示組的最高優先狀態。
          </Text>
        )}
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
            已選 {batchSelection.size} 筆 / {batchableTags.length} 筆
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
                  {tag.floor || '未設定樓層'} · {tag.memaddress || '未設定區段'}
                  {isCoilTag(tag) ? ' · Coil' : ''}
                  {' · '}{tag.id}
                  {usedTagIds.has(tag.id) ? ' · 此 View 已使用' : ''}
                </Text>
              </span>
            </Checkbox>
          )) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沒有符合的 Tag。" />
          )}
        </div>
      </>
    )
  }

  function openDeviceManager() {
    setProjectManagerTab('devices')
    setDeviceTagSearch('')
    setFloorSearch('')
    setFloorSelection(new Set())
    setBulkFloor('')
    setFloorDisplayMode('group')
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
    setDeviceTagSearch('')
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

  function openDeviceTagEditor(tagId: string) {
    const tag = managedDeviceTags.find((candidate) => candidate.id === tagId)
    if (!tag) {
      messageApi.error('找不到要修改的 Tag。')
      return
    }
    const address = Number(tag.address)
    setEditingDeviceTagId(tagId)
    deviceTagForm.setFieldsValue({
      name: tag.name,
      address: Number.isSafeInteger(address) && address >= 0 && address <= 65535
        ? address
        : undefined,
      type: tag.type || 'Bool',
      memaddress: tag.memaddress,
      description: tag.description,
      floor: tag.floor,
    })
    setDeviceTagDialogOpen(true)
  }

  function handleUpdateDeviceTag(values: ModbusTagFormValues) {
    if (!config) return
    try {
      const nextConfig = updateModbusDeviceTag(
        config.rawConfig,
        managedDeviceId,
        editingDeviceTagId,
        values,
      )
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models,
      })
      setDeviceTagDialogOpen(false)
      messageApi.success(`已更新 Tag「${values.name.trim()}」。`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      messageApi.error(`Tag 更新失敗：${detail}`)
    }
  }

  function handleDeleteDeviceTag(tagId: string) {
    if (!config || !managedDevice) return
    const referencedModels = [...models.entries()].flatMap(([viewId, model]) => {
      const components = model.components.filter((component) => (
        component.tagId === tagId
        || component.multiStateBindings?.some((binding) => binding.tagId === tagId)
      ))
      return components.length ? [{ viewId, model, components }] : []
    })
    const readonlyReferences = referencedModels.flatMap(({ viewId, components }) => {
      const count = components.filter((component) => component.managed === false).length
      if (!count) return []
      const view = config.views.find((candidate) => candidate.id === viewId)
      return [`${view?.name || viewId} (${count} 個唯讀元件)`]
    })
    if (readonlyReferences.length) {
      messageApi.error(
        `無法刪除此 Tag：以下 View 有無法安全修改的唯讀元件引用：${readonlyReferences.join('、')}`,
      )
      return
    }

    const managedReferenceCount = referencedModels.reduce(
      (count, entry) => count + entry.components.length,
      0,
    )
    const tag = managedDeviceTags.find((candidate) => candidate.id === tagId)
    Modal.confirm({
      title: `確定刪除 Tag「${tag?.name || tagId}」？`,
      content: managedReferenceCount
        ? `此 Tag 被 ${managedReferenceCount} 個受管理元件使用；刪除時會一併移除這些元件。`
        : '此操作無法復原。',
      okText: '刪除 Tag',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk() {
        try {
          const nextConfig = deleteModbusDeviceTag(config.rawConfig, managedDeviceId, tagId)
          const nextModels = new Map(models)
          for (const { viewId, model, components } of referencedModels) {
            const removeKeys = new Set(components.map((component) => component.key))
            nextModels.set(viewId, {
              ...model,
              components: model.components.filter((component) => !removeKeys.has(component.key)),
            })
          }
          dispatchEditor({
            type: 'document-edit',
            document: parseUpdatedConfig(nextConfig, config),
            models: nextModels,
          })
          messageApi.success(
            `已刪除 Tag「${tag?.name || tagId}」。`
            + (managedReferenceCount ? `並移除 ${managedReferenceCount} 個相關元件。` : ''),
          )
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          messageApi.error(`Tag 刪除失敗：${detail}`)
        }
      },
    })
  }

  function handleDeleteAutoFilledDeviceTags() {
    if (!config || !managedDevice || !autoFilledManagedDeviceTags.length) return
    const autoFilledTagIds = new Set(autoFilledManagedDeviceTags.map((tag) => tag.id))
    const referencedModels = [...models.entries()].flatMap(([viewId, model]) => {
      const components = model.components.filter((component) => (
        autoFilledTagIds.has(component.tagId)
        || component.multiStateBindings?.some((binding) => autoFilledTagIds.has(binding.tagId))
      ))
      return components.length ? [{ viewId, model, components }] : []
    })
    const readonlyReferences = referencedModels.flatMap(({ viewId, components }) => {
      const count = components.filter((component) => component.managed === false).length
      if (!count) return []
      const view = config.views.find((candidate) => candidate.id === viewId)
      return [`${view?.name || viewId} (${count} 個唯讀元件)`]
    })
    if (readonlyReferences.length) {
      messageApi.error(
        `無法移除補位 Tag：以下 View 有無法安全修改的唯讀元件引用：${readonlyReferences.join('、')}`,
      )
      return
    }

    const managedReferenceCount = referencedModels.reduce(
      (count, entry) => count + entry.components.length,
      0,
    )
    Modal.confirm({
      title: `確定移除設備「${managedDevice.record.name || managedDeviceId}」的所有補位 Tag？`,
      content: managedReferenceCount
        ? `將移除 ${autoFilledManagedDeviceTags.length} 個補位 Tag，並一併移除 ${managedReferenceCount} 個引用它們的受管理元件。此操作無法復原。`
        : `將移除 ${autoFilledManagedDeviceTags.length} 個補位 Tag。此操作無法復原。`,
      okText: '移除補位 Tag',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk() {
        try {
          const result = deleteAllAutoFilledModbusDeviceTags(config.rawConfig, managedDeviceId)
          const nextModels = new Map(models)
          for (const { viewId, model, components } of referencedModels) {
            const removeKeys = new Set(components.map((component) => component.key))
            nextModels.set(viewId, {
              ...model,
              components: model.components.filter((component) => !removeKeys.has(component.key)),
            })
          }
          dispatchEditor({
            type: 'document-edit',
            document: parseUpdatedConfig(result.config, config),
            models: nextModels,
          })
          messageApi.success(
            `已移除 ${result.deletedTagIds.length} 個補位 Tag。`
            + (managedReferenceCount ? `並移除 ${managedReferenceCount} 個相關元件。` : ''),
          )
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          messageApi.error(`補位 Tag 移除失敗：${detail}`)
        }
      },
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
    const selected = getSelectedView(config.views, selectedViewId)
    const index = selected ? config.views.indexOf(selected) : 0
    try {
      const titleStyle = getViewTitleLabelSettings(
        config.rawConfig,
        selected?.id,
        DOMParser,
      )
      viewPropertiesForm.setFieldsValue({
        bkcolor: getViewBackgroundInputColor(config.rawConfig, Math.max(index, 0)),
        viewTitleColor: titleStyle.color,
        viewTitleFontSize: titleStyle.fontSize,
      })
    } catch (error) {
      messageApi.error(`讀取 View 屬性失敗：${error instanceof Error ? error.message : String(error)}`)
    }
    setViewSettingsTab('floor-frame')
    setViewSettingsOpen(true)
  }

  function handleFloorFrameSubmit(values: FloorGroupFrameFormValues) {
    if (!config) return
    try {
      const result = updateFloorGroupFrame(config.rawConfig, {
        ...values,
        fillOpacity: values.fillOpacityPercent / 100,
      })
      if (!result.changed) {
        setViewSettingsOpen(false)
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
      setViewSettingsOpen(false)
      messageApi.success('已更新所有 View 的樓層底框設定。')
    } catch (error) {
      messageApi.error(`更新樓層底框設定失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function handleViewPropertiesSubmit(values: ViewPropertiesFormValues) {
    if (!config) return
    try {
      const backgroundResult = updateAllViewBackgrounds(config.rawConfig, values.bkcolor)
      const titleResult = updateAllViewTitleLabels(
        backgroundResult.config,
        { color: values.viewTitleColor, fontSize: values.viewTitleFontSize },
        DOMParser,
        (doc) => new XMLSerializer().serializeToString(doc),
      )
      if (!backgroundResult.changed && !titleResult.changed) {
        setViewSettingsOpen(false)
        messageApi.info('View 屬性沒有變更。')
        return
      }
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(titleResult.config, config),
        models,
      })
      setViewSettingsOpen(false)
      messageApi.success('已更新所有 View 的背景色與名稱標籤樣式。')
    } catch (error) {
      messageApi.error(`更新 View 屬性失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function handleAddIcon() {
    if (!config) return
    try {
      const stateNames = iconType === 'multi-state'
        ? multiStateDrafts.map((state) => state.name.trim())
        : []
      const files = iconType === 'single'
        ? singleIconFile ? [singleIconFile] : []
        : iconType === 'pair'
          ? [normalIconFile, alarmIconFile].filter((file): file is File => file !== null)
          : [normalIconFile, ...multiStateDrafts.map((state) => state.file)]
            .filter((file): file is File => file !== null)
      const images = await Promise.all(files.map(async (file) => (
        new Uint8Array(await file.arrayBuffer())
      )))
      const nextConfig = addIconLibraryEntry(
        config.rawConfig,
        iconName,
        iconType,
        images,
        window.crypto,
        stateNames,
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
      setMultiStateDrafts([{ name: '', file: null }])
      messageApi.success('已新增圖示。')
    } catch (error) {
      messageApi.error(`新增圖示失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function handleExportIconLibrary() {
    try {
      const contents = `${JSON.stringify(createIconLibraryExport(iconLibrary), null, 2)}\n`
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '圖示庫.json'
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      messageApi.success('已匯出圖示庫 JSON。')
    } catch (error) {
      messageApi.error(`圖示庫匯出失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function handleImportIconLibrary(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !config) return
    try {
      const input: unknown = JSON.parse(await file.text())
      const nextConfig = importIconLibrary(config.rawConfig, input)
      const importedCount = getIconLibrary(nextConfig).length - iconLibrary.length
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models,
      })
      messageApi.success(`已匯入 ${importedCount} 個圖示。`)
    } catch (error) {
      messageApi.error(`圖示庫匯入失敗：${error instanceof Error ? error.message : String(error)}`)
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

  function handleMoveMultiStateIconState(
    iconSetId: string,
    stateKey: string,
    direction: -1 | 1,
  ) {
    if (!config) return
    try {
      const nextConfig = moveMultiStateIconState(config.rawConfig, iconSetId, stateKey, direction)
      const nextIcon = getIconLibrary(nextConfig).find((icon) =>
        icon.type === 'multi-state' && icon.id === iconSetId)
      if (!nextIcon || nextIcon.type !== 'multi-state') {
        throw new Error('找不到更新後的多狀態圖示組。')
      }
      const modifiedIds = new Set(modifiedViewIds)
      const nextModels = new Map<string, ExportViewModel>()
      for (const [viewId, model] of models) {
        const hasSet = model.components.some((component) =>
          component.managed !== false && component.multiIconSetId === iconSetId)
        if (hasSet) modifiedIds.add(viewId)
        nextModels.set(viewId, {
          ...model,
          components: model.components.map((component) => {
            if (component.managed === false || component.multiIconSetId !== iconSetId) {
              return component
            }
            const bindings = component.multiStateBindings ?? []
            const orderedBindings = nextIcon.states.flatMap((state) => {
              const binding = bindings.find((candidate) => candidate.stateKey === state.key)
              return binding ? [binding] : []
            })
            return {
              ...component,
              multiStateBindings: orderedBindings,
              tagId: orderedBindings[0]?.tagId ?? '',
            }
          }),
        })
      }
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models: nextModels,
        modifiedViewIds: modifiedIds,
      })
    } catch (error) {
      messageApi.error(`調整狀態優先順序失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function handleAddMultiStateIconState(iconSetId: string) {
    if (!config) return
    const draft = multiStateAddDrafts[iconSetId]
    if (!draft?.file) {
      messageApi.warning('請選擇狀態圖片。')
      return
    }
    try {
      const bytes = new Uint8Array(await draft.file.arrayBuffer())
      const nextConfig = addMultiStateIconState(
        config.rawConfig,
        iconSetId,
        draft.name,
        bytes,
        window.crypto,
      )
      const nextIcon = getIconLibrary(nextConfig).find((icon) =>
        icon.type === 'multi-state' && icon.id === iconSetId)
      if (!nextIcon || nextIcon.type !== 'multi-state') {
        throw new Error('找不到更新後的多狀態圖示組。')
      }
      const newState = nextIcon.states[nextIcon.states.length - 1]
      if (!newState) throw new Error('新增的狀態資料不完整。')
      const usedIds = new Set(buildTagIndex(config.rawConfig).keys())
      for (const view of config.rawConfig.hmi.views) {
        if (!isRecord(view)) continue
        if (isRecord(view.items)) {
          Object.keys(view.items).forEach((id) => usedIds.add(id))
        }
        if (typeof view.svgcontent === 'string') {
          const doc = parseSvg(view.svgcontent, DOMParser)
          for (const node of Array.from(doc.getElementsByTagName('*'))) {
            const id = node.getAttribute('id')
            if (id) usedIds.add(id)
          }
        }
      }
      for (const model of models.values()) {
        for (const component of [...model.components, ...(model.originalComponents ?? [])]) {
          if (component.shapeId) usedIds.add(component.shapeId)
          if (component.labelId) usedIds.add(component.labelId)
          if (component.alarmShapeId) usedIds.add(component.alarmShapeId)
          for (const binding of component.multiStateBindings ?? []) {
            if (binding.shapeId) usedIds.add(binding.shapeId)
          }
        }
      }
      const modifiedIds = new Set(modifiedViewIds)
      const nextModels = new Map<string, ExportViewModel>()
      for (const [viewId, model] of models) {
        const hasSet = model.components.some((component) =>
          component.managed !== false && component.multiIconSetId === iconSetId)
        if (hasSet) modifiedIds.add(viewId)
        nextModels.set(viewId, {
          ...model,
          components: model.components.map((component) => (
            component.managed === false || component.multiIconSetId !== iconSetId
              ? component
              : {
                ...component,
                multiStateBindings: [
                  ...(component.multiStateBindings ?? []),
                  {
                    stateKey: newState.key,
                    iconId: newState.asset.id,
                    tagId: '',
                    shapeId: generateId('SHE', usedIds, window.crypto),
                  },
                ],
              }
          )),
        })
      }
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models: nextModels,
        modifiedViewIds: modifiedIds,
      })
      setMultiStateAddDrafts((current) => ({ ...current, [iconSetId]: { name: '', file: null } }))
      messageApi.success('已新增狀態；請在使用此圖示組的元件中綁定 Boolean Tag。')
    } catch (error) {
      messageApi.error(`新增狀態失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function handleRemoveMultiStateIconState(iconSetId: string, stateKey: string) {
    if (!config) return
    try {
      const usages: string[] = []
      for (const [viewId, model] of models) {
        for (const component of model.components) {
          if (component.managed === false
              || component.multiIconSetId !== iconSetId
              || !component.multiStateBindings?.some((binding) => binding.stateKey === stateKey)) continue
          usages.push(`「${config.views.find((view) => view.id === viewId)?.name || viewId}」的 ${
            component.label || `元件 #${component.seq}`
          }`)
        }
      }
      for (const view of config.rawConfig.hmi.views) {
        if (!isRecord(view) || typeof view.svgcontent !== 'string') continue
        const doc = parseSvg(view.svgcontent, DOMParser)
        const used = Array.from(doc.getElementsByTagName('*')).some((node) =>
          node.getAttribute('data-fuxa-icon-set-id') === iconSetId
          && node.getAttribute('data-fuxa-state-key') === stateKey)
        if (used) {
          usages.push(`「${typeof view.name === 'string' ? view.name : String(view.id || '未知 View')}」的 SVG 元件`)
        }
      }
      const nextConfig = removeMultiStateIconState(
        config.rawConfig,
        iconSetId,
        stateKey,
        usages,
      )
      dispatchEditor({
        type: 'document-edit',
        document: parseUpdatedConfig(nextConfig, config),
        models,
      })
      messageApi.success('已刪除多狀態圖示定義。')
    } catch (error) {
      messageApi.error(`刪除狀態失敗：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function tagLabel(tag: IndexedTag): string {
    return `${tag.deviceName} / ${tag.name} (${tag.type || '未設定型別'})`
  }

  function tagOptions(component: FloorLayoutComponent) {
    const options = tags.map((tag) => ({
      value: tag.id,
      label: tagLabel(tag),
      disabled: (component.template === 'icon-pair' || component.template === 'icon-multi')
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
      extra={(
        <Space size="small" wrap>
          <Text type="secondary">{previewRealtime ? '即時預覽' : '手動預覽'}</Text>
          <Switch
            aria-label="即時更新 SVG 預覽"
            checked={previewRealtime}
            checkedChildren="即時"
            unCheckedChildren="手動"
            onChange={setPreviewRealtime}
          />
          <Button
            size="small"
            disabled={!config || !selectedView}
            onClick={handleRefreshPreview}
          >
            更新預覽
          </Button>
          {preview && !preview.error && (
            <>
              <Text type="secondary">{preview.width} × {preview.height}</Text>
              {preview.outsideCanvas && <Tag color="warning">排列超出畫布</Tag>}
            </>
          )}
          {config && selectedView && previewStale && (
            <Tag color="warning">
              {previewRealtime ? '預覽更新中' : '預覽尚未更新'}
            </Tag>
          )}
        </Space>
      )}
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
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={config && selectedView
            ? previewRealtime ? '正在產生預覽…' : '請按「更新預覽」產生預覽。'
            : '尚無可預覽的 View。'}
        />
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
        open={componentMoveSource !== null}
        title="移動元件至 View"
        okText="移動"
        cancelText="取消"
        okButtonProps={{ disabled: !componentMoveTargetId }}
        onCancel={() => {
          setComponentMoveSource(null)
          setComponentMoveTargetId('')
        }}
        onOk={handleMoveComponentToView}
        destroyOnHidden
      >
        <Text type="secondary">
          選擇要移入此元件的目標 View；元件會從目前 View 移除。
        </Text>
        <Select
          aria-label="移動至 View"
          style={{ marginTop: 16, width: '100%' }}
          value={componentMoveTargetId || undefined}
          placeholder="選擇目標 View"
          options={config?.views
            .filter((view) => {
              const id = view.id || view.key
              return id !== componentMoveSource?.viewId && models.has(id)
            })
            .map((view) => ({
              value: view.id || view.key,
              label: view.name || view.id || view.key,
            })) ?? []}
          onChange={setComponentMoveTargetId}
        />
      </Modal>
      <Modal
        open={batchMoveDialogOpen}
        title="批次移動元件"
        okText={`移動 ${batchMoveSelection.size} 個`}
        cancelText="取消"
        okButtonProps={{
          disabled: batchMoveSelection.size === 0 || !componentMoveTargetId,
        }}
        onCancel={() => {
          setBatchMoveDialogOpen(false)
          setBatchMoveSelection(new Set())
          setComponentMoveTargetId('')
        }}
        onOk={() => {
          if (!selectedView) return
          const moved = moveComponentsToView(
            selectedView.id,
            [...batchMoveSelection],
            componentMoveTargetId,
          )
          if (moved) {
            setBatchMoveDialogOpen(false)
            setBatchMoveSelection(new Set())
            setComponentMoveTargetId('')
          }
        }}
        width={640}
        destroyOnHidden
      >
        <Text type="secondary">
          選擇要移動的已管理元件及目標 View。元件會從目前 View 移除。
        </Text>
        <Select
          aria-label="批次移動至 View"
          style={{ margin: '16px 0', width: '100%' }}
          value={componentMoveTargetId || undefined}
          placeholder="選擇目標 View"
          options={config?.views
            .filter((view) => {
              const id = view.id || view.key
              return id !== selectedView?.id && models.has(id)
            })
            .map((view) => ({
              value: view.id || view.key,
              label: view.name || view.id || view.key,
            })) ?? []}
          onChange={setComponentMoveTargetId}
        />
        <div className="batch-tag-list" role="group" aria-label="選擇要移動的元件">
          {selectedModel?.components
            .filter((component) => component.managed !== false)
            .map((component) => {
              const tagName = tags.find((tag) => tag.id === component.tagId)?.name
              return (
                <Checkbox
                  key={component.key}
                  checked={batchMoveSelection.has(component.key)}
                  onChange={(event) => {
                    setBatchMoveSelection((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.add(component.key)
                      else next.delete(component.key)
                      return next
                    })
                  }}
                >
                  {component.label || tagName || '未命名元件'}
                  {tagName ? ` · ${tagName}` : ''}
                </Checkbox>
              )
            })}
        </div>
      </Modal>
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
        open={viewSettingsOpen}
        title="View 設定"
        okText="套用所有 View"
        cancelText="取消"
        onCancel={() => setViewSettingsOpen(false)}
        onOk={() => {
          if (viewSettingsTab === 'floor-frame') floorFrameForm.submit()
          else viewPropertiesForm.submit()
        }}
        width={640}
        destroyOnHidden
      >
        <Tabs
          activeKey={viewSettingsTab}
          onChange={(key) => setViewSettingsTab(
            key === 'view-properties' ? 'view-properties' : 'floor-frame',
          )}
          items={[
            {
              key: 'floor-frame',
              label: '樓層框樣式',
              children: <>
        <Text type="secondary">
          設定會套用至所有 View 的樓層 Group 底框；左右固定內縮 10px，上下可調整內距，並可使用 Undo/Redo 還原。
        </Text>
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
            label="上下內距"
            name="padding"
            rules={[
              { required: true, type: 'number', min: 0, max: 200, message: '請輸入 0–200。' },
            ]}
          >
            <InputNumber min={0} max={200} step={1} />
          </Form.Item>
        </Form>
              </>,
            },
            {
              key: 'view-properties',
              label: 'View 屬性',
              children: <>
        <Text type="secondary">
          背景色與 View 名稱標籤樣式會套用至所有 View；名稱標籤設定會保存於匯出 JSON 的 extra，並可使用 Undo/Redo 還原。
        </Text>
        <Form
          form={viewPropertiesForm}
          layout="vertical"
          onFinish={handleViewPropertiesSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item label="背景色" name="bkcolor" rules={[{ required: true }]}>
            <Input type="color" aria-label="View 背景色" />
          </Form.Item>
          <Form.Item label="View 名稱標籤顏色" name="viewTitleColor" rules={[{ required: true }]}>
            <Input type="color" aria-label="View 名稱標籤顏色" />
          </Form.Item>
          <Form.Item
            label="View 名稱標籤大小"
            name="viewTitleFontSize"
            rules={[
              { required: true, type: 'number', min: 8, max: 72, message: '請輸入 8–72。' },
            ]}
          >
            <InputNumber min={8} max={72} step={1} aria-label="View 名稱標籤大小" />
          </Form.Item>
        </Form>
              </>,
            },
          ]}
        />
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
            <Button
              disabled={!config || !iconLibrary.length}
              onClick={handleExportIconLibrary}
            >
              匯出圖示庫
            </Button>
            <Button
              disabled={!config}
              onClick={() => iconLibraryImportRef.current?.click()}
            >
              匯入圖示庫
            </Button>
            <input
              ref={iconLibraryImportRef}
              type="file"
              accept="application/json,.json"
              aria-label="匯入圖示庫 JSON"
              hidden
              onChange={(event) => void handleImportIconLibrary(event)}
            />
            <Text type="secondary">匯入會合併圖示；若名稱或 ID 衝突，整批匯入將被拒絕。</Text>
          </Space>
          <Space wrap>
            <Input
              aria-label="圖示名稱（必填）"
              placeholder="圖示名稱（必填）"
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
                { label: '多狀態圖示組', value: 'multi-state' },
              ]}
            />
          </Space>
          {!iconName.trim() && (
            <Text type="secondary">請先輸入圖示名稱，才能新增至圖示庫。</Text>
          )}
          {iconType === 'single' ? (
            <label className="icon-file-field">
              一般圖示圖片
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                onChange={(event) => setSingleIconFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : iconType === 'pair' ? (
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
          ) : (
            <Space orientation="vertical" className="icon-state-draft-list">
              <label className="icon-file-field">
                預設／正常狀態圖片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  onChange={(event) => setNormalIconFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <Text type="secondary">狀態依列表順序設定優先權，第一項優先權最高；最多 {MAX_MULTI_STATE_COUNT} 項。</Text>
              {multiStateDrafts.map((state, index) => (
                <Space key={`state-draft-${index}`} wrap>
                  <Text>優先 {index + 1}</Text>
                  <Input
                    aria-label={`狀態 ${index + 1} 名稱`}
                    placeholder="狀態名稱"
                    maxLength={80}
                    value={state.name}
                    onChange={(event) => setMultiStateDrafts((current) => current.map(
                      (candidate, candidateIndex) => candidateIndex === index
                        ? { ...candidate, name: event.target.value }
                        : candidate,
                    ))}
                  />
                  <label className="icon-file-field">
                    狀態圖片
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      onChange={(event) => setMultiStateDrafts((current) => current.map(
                        (candidate, candidateIndex) => candidateIndex === index
                          ? { ...candidate, file: event.target.files?.[0] ?? null }
                          : candidate,
                      ))}
                    />
                  </label>
                  <Button
                    aria-label={`狀態 ${index + 1} 上移`}
                    disabled={index === 0}
                    onClick={() => setMultiStateDrafts((current) => {
                      const next = [...current]
                      ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                      return next
                    })}
                  >
                    上移
                  </Button>
                  <Button
                    aria-label={`狀態 ${index + 1} 下移`}
                    disabled={index === multiStateDrafts.length - 1}
                    onClick={() => setMultiStateDrafts((current) => {
                      const next = [...current]
                      ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
                      return next
                    })}
                  >
                    下移
                  </Button>
                  <Button
                    danger
                    disabled={multiStateDrafts.length <= 1}
                    onClick={() => setMultiStateDrafts((current) =>
                      current.filter((_candidate, candidateIndex) => candidateIndex !== index))}
                  >
                    移除
                  </Button>
                </Space>
              ))}
              <Button
                disabled={multiStateDrafts.length >= MAX_MULTI_STATE_COUNT}
                onClick={() => setMultiStateDrafts((current) => [...current, { name: '', file: null }])}
              >
                新增狀態
              </Button>
            </Space>
          )}
          <Button
            type="primary"
            disabled={!config || !iconName.trim()
              || (iconType === 'single'
                ? !singleIconFile
                : iconType === 'pair'
                  ? !normalIconFile || !alarmIconFile
                  : !normalIconFile
                    || multiStateDrafts.some((state) => !state.file || !state.name.trim())
                    || new Set(multiStateDrafts.map((state) =>
                      state.name.trim().toLocaleLowerCase())).size !== multiStateDrafts.length)}
            onClick={() => void handleAddIcon()}
          >
            新增至圖示庫
          </Button>
          {iconLibrary.length ? (
            <div className="icon-library-list">
              {iconLibrary.map((icon) => {
                const assets = getIconAssets(icon)
                return (
                  <Card
                    key={icon.id}
                    size="small"
                    title={icon.name}
                    extra={(
                      <Space size="small">
                        {icon.type === 'multi-state' && (
                          <Button
                            size="small"
                            onClick={() => setEditingMultiStateIconId(icon.id)}
                          >
                            修改
                          </Button>
                        )}
                        <Button danger size="small" onClick={() => handleRemoveIcon(icon.id)}>刪除</Button>
                      </Space>
                    )}
                  >
                    <Space wrap>
                      {assets.map((asset, index) => (
                        <Space key={asset.id} orientation="vertical" align="center" size="small">
                          <Image src={asset.dataUrl} alt={`${icon.name} ${index + 1}`} width={64} height={64} />
                          <Text type="secondary">
                            {icon.type === 'pair'
                              ? (index === 0 ? '正常' : '告警')
                              : icon.type === 'multi-state'
                                ? index === 0 ? '預設／正常' : icon.states[index - 1]?.name
                                : '預覽'}
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
        open={Boolean(editingMultiStateIcon)}
        title={editingMultiStateIcon ? `修改多狀態圖示組：${editingMultiStateIcon.name}` : '修改多狀態圖示組'}
        footer={null}
        onCancel={() => setEditingMultiStateIconId('')}
        width={640}
        destroyOnHidden
      >
        {editingMultiStateIcon && (
          <Space orientation="vertical" size="middle" className="multi-state-library-order">
            <Text strong>狀態優先順序（第一項最高）</Text>
            {editingMultiStateIcon.states.map((state, index) => (
              <Space key={state.key} wrap>
                <Text>{index + 1}. {state.name}</Text>
                <Button
                  aria-label={`${state.name} 狀態上移`}
                  disabled={index === 0}
                  onClick={() => handleMoveMultiStateIconState(
                    editingMultiStateIcon.id,
                    state.key,
                    -1,
                  )}
                >
                  上移
                </Button>
                <Button
                  aria-label={`${state.name} 狀態下移`}
                  disabled={index === editingMultiStateIcon.states.length - 1}
                  onClick={() => handleMoveMultiStateIconState(
                    editingMultiStateIcon.id,
                    state.key,
                    1,
                  )}
                >
                  下移
                </Button>
                <Button
                  danger
                  disabled={editingMultiStateIcon.states.length <= 1}
                  onClick={() => handleRemoveMultiStateIconState(
                    editingMultiStateIcon.id,
                    state.key,
                  )}
                >
                  刪除狀態
                </Button>
              </Space>
            ))}
            {editingMultiStateIcon.states.length < MAX_MULTI_STATE_COUNT && (
              <Space wrap>
                <Input
                  aria-label={`${editingMultiStateIcon.name} 新增狀態名稱`}
                  placeholder="新增狀態名稱"
                  maxLength={80}
                  value={multiStateAddDrafts[editingMultiStateIcon.id]?.name ?? ''}
                  onChange={(event) => setMultiStateAddDrafts((current) => ({
                    ...current,
                    [editingMultiStateIcon.id]: {
                      name: event.target.value,
                      file: current[editingMultiStateIcon.id]?.file ?? null,
                    },
                  }))}
                />
                <label className="icon-file-field">
                  狀態圖片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    onChange={(event) => setMultiStateAddDrafts((current) => ({
                      ...current,
                      [editingMultiStateIcon.id]: {
                        name: current[editingMultiStateIcon.id]?.name ?? '',
                        file: event.target.files?.[0] ?? null,
                      },
                    }))}
                  />
                </label>
                <Button
                  disabled={!multiStateAddDrafts[editingMultiStateIcon.id]?.name.trim()
                    || !multiStateAddDrafts[editingMultiStateIcon.id]?.file}
                  onClick={() => void handleAddMultiStateIconState(editingMultiStateIcon.id)}
                >
                  新增狀態
                </Button>
              </Space>
            )}
          </Space>
        )}
      </Modal>
      <Modal
        open={deviceManagerOpen}
        title="專案管理"
        okText={deviceManagerMode === 'create' ? '建立設備' : '儲存設備'}
        cancelText="關閉"
        footer={projectManagerTab === 'devices'
          ? undefined
          : projectManagerTab === 'alarms'
            ? [
              <Button key="cancel" onClick={() => setDeviceManagerOpen(false)}>
                關閉
              </Button>,
              <Button
                key="apply-alarms"
                type="primary"
                disabled={tagAlarmTagIds.length === 0
                  || !tagAlarmText.trim()
                  || tagAlarmTargetsMissing}
                onClick={handleCreateTagAlarms}
              >
                設定 {tagAlarmTagIds.length} 個告警
              </Button>,
            ]
            : projectManagerTab === 'tag-create'
              ? [
                <Button key="cancel" onClick={() => setDeviceManagerOpen(false)}>
                  關閉
                </Button>,
                <Button
                  key="create-tags"
                  type="primary"
                  disabled={!tagCreateDeviceId
                    || tagCreateSpecs.length === 0
                    || hasTagCreateDuplicateNames
                    || hasTagCreateInvalidNames}
                  onClick={handleCreateTags}
                >
                  建立 {tagCreateSpecs.length} 個 Tag
                </Button>,
              ]
              : projectManagerTab === 'tag-add'
                ? [
                  <Button key="cancel" onClick={() => setDeviceManagerOpen(false)}>
                    關閉
                  </Button>,
                  <Button
                    key="add-tags"
                    type="primary"
                    disabled={batchSelection.size === 0}
                    onClick={handleBatchAdd}
                  >
                    加入 {batchSelection.size} 筆
                  </Button>,
                ]
            : [
              <Button key="close" onClick={() => setDeviceManagerOpen(false)}>
                關閉
              </Button>,
            ]}
        onCancel={() => setDeviceManagerOpen(false)}
        onOk={projectManagerTab === 'devices'
          ? () => deviceManagerForm.submit()
          : projectManagerTab === 'tag-create'
            ? handleCreateTags
            : projectManagerTab === 'tag-add'
              ? handleBatchAdd
            : undefined}
        width={projectManagerTab === 'tag-create' ? 1000 : 900}
        destroyOnHidden
      >
        <Tabs
          activeKey={projectManagerTab}
          onChange={(key) => setProjectManagerTab(
            key === 'floors' || key === 'alarms' || key === 'tag-create' || key === 'tag-add'
              ? key
              : 'devices',
          )}
          items={[
            {
              key: 'devices',
              label: '設備與 Tag',
              children: <>
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
          <Button
            disabled={!selectedModel || batchableTags.length === 0}
            onClick={() => {
              openBatchAddTab()
            }}
          >
            批次加入 Tag
          </Button>
          <Button
            disabled={!config || Object.keys(config.rawConfig.devices).every((id) => id === '0')}
            onClick={openTagCreateTab}
          >
            批次建立 Tag
          </Button>
        </div>
        {deviceManagerMode === 'edit' && (
          <Alert
            showIcon
            type={duplicateTagGroups.length ? 'warning' : 'success'}
            message={duplicateTagGroups.length
              ? `全專案名稱檢查：發現 ${duplicateTagGroups.length} 組重複名稱，共 ${duplicateTagGroups.reduce((count, group) => count + group.length, 0)} 個 Tag`
              : '全專案名稱檢查：目前沒有重複的 Tag 名稱'}
            description={duplicateTagGroups.length ? (
              <Space wrap>
                {duplicateTagGroups.slice(0, 8).map((group) => {
                  const firstTag = group[0]
                  if (!firstTag) return null
                  return (
                    <Tag key={firstTag.name.trim().toLocaleLowerCase()}>
                      {firstTag.name}：{group.map((tag) => tag.deviceName).join('、')}
                    </Tag>
                  )
                })}
                {duplicateTagGroups.length > 8
                  ? <Text type="secondary">另有 {duplicateTagGroups.length - 8} 組未顯示</Text>
                  : null}
              </Space>
            ) : undefined}
            style={{ marginTop: 12 }}
          />
        )}
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
              <Button
                danger
                disabled={autoFilledManagedDeviceTags.length === 0}
                onClick={handleDeleteAutoFilledDeviceTags}
              >
                移除補位 Tag ({autoFilledManagedDeviceTags.length})
              </Button>
              {managedDeviceId !== '0' && (
                <Button danger onClick={handleDeleteManagedDevice}>刪除此設備</Button>
              )}
            </Space>
          </div>
        )}
        {deviceManagerMode === 'edit' && managedDevice && (
          <section className="device-tag-manager" aria-label="所選設備的 Tag 清單">
            <div className="device-tag-manager-heading">
              <Text strong>設備 Tag</Text>
              <Text type="secondary">
                {filteredManagedDeviceTags.length} / {managedDeviceTags.length} 個
              </Text>
            </div>
            <Input
              aria-label="搜尋設備 Tag"
              allowClear
              placeholder="搜尋 Tag 名稱、位址、型別或樓層"
              value={deviceTagSearch}
              onChange={(event) => setDeviceTagSearch(event.target.value)}
              className="device-tag-search"
            />
            <div className="device-tag-list">
              {filteredManagedDeviceTags.length ? filteredManagedDeviceTags.map((tag) => (
                <div className="device-tag-row" key={tag.id}>
                  <div className="device-tag-info">
                    <Text strong ellipsis title={tag.name}>{tag.name}</Text>
                    {duplicateTagIds.has(tag.id) && (
                      <Text type="danger">名稱重複，請修改 Tag 名稱</Text>
                    )}
                    <Text type="secondary" ellipsis title={`${tag.type} · ${tag.memaddress}`}>
                      {tag.type || '未設定型別'} · {tag.memaddress || '未設定區段'}
                    </Text>
                    <Text type="secondary">
                      位址 {tag.address === undefined || tag.address === null || tag.address === ''
                        ? '—'
                        : String(tag.address)}
                      {tag.floor ? ` · ${tag.floor}` : ''}
                    </Text>
                  </div>
                  <Space size={4}>
                    <Button size="small" onClick={() => openDeviceTagEditor(tag.id)}>
                      修改
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => handleDeleteDeviceTag(tag.id)}
                    >
                      刪除
                    </Button>
                  </Space>
                </div>
              )) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={managedDeviceTags.length ? '沒有符合搜尋條件的 Tag。' : '此設備尚無 Tag。'}
                />
              )}
            </div>
          </section>
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
              </>,
            },
            {
              key: 'alarms',
              label: '告警設定',
              children: renderTagAlarmSettings(),
            },
            {
              key: 'tag-create',
              label: '批次建立 Tag',
              children: renderTagCreateForm(),
            },
            {
              key: 'tag-add',
              label: '批次加入 Tag',
              children: renderBatchAddForm(),
            },
            {
              key: 'floors',
              label: '樓層管理',
              children: <>
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
                  <Text
                    className="floor-tag-address"
                    type="secondary"
                    title={`Address: ${String(tag.record.address ?? '未設定')}`}
                  >
                    Address: {String(tag.record.address ?? '未設定')}
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
              </>,
            },
          ]}
        />
      </Modal>
      <Modal
        open={deviceTagDialogOpen}
        title="修改 Tag"
        okText="儲存 Tag"
        cancelText="取消"
        onCancel={() => setDeviceTagDialogOpen(false)}
        onOk={() => deviceTagForm.submit()}
        destroyOnHidden
      >
        <Form
          form={deviceTagForm}
          layout="vertical"
          onFinish={handleUpdateDeviceTag}
        >
          <Form.Item
            name="name"
            label="Tag 名稱"
            rules={[
              { required: true, whitespace: true, message: 'Tag 名稱不可空白。' },
              { max: 120, message: 'Tag 名稱不可超過 120 個字元。' },
              {
                validator: async (_, value: unknown) => {
                  const name = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
                  if (!name) return
                  const duplicate = tags.some((tag) => (
                    tag.id !== editingDeviceTagId
                    && tag.name.trim().toLocaleLowerCase() === name
                  ))
                  if (duplicate) throw new Error('此名稱已被其他 Tag 使用。')
                },
              },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="address"
            label="位址 (address)"
            rules={[
              {
                validator: async (_, value: unknown) => {
                  if (value === undefined || value === null || value === '') return
                  if (!Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 65535) {
                    throw new Error('位址必須是 0 到 65535 之間的整數。')
                  }
                },
              },
            ]}
          >
            <InputNumber min={0} max={65535} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="type"
            label="資料型別"
            rules={[{ required: true, whitespace: true, message: 'Tag 型別不可空白。' }]}
          >
            <Input placeholder="例如 Bool、number、string" />
          </Form.Item>
          <Form.Item
            name="memaddress"
            label="記憶體區段 (memaddress)"
            rules={[{ required: true, whitespace: true, message: '記憶體區段不可空白。' }]}
          >
            <Input placeholder="例如 000000" />
          </Form.Item>
          <Form.Item name="description" label="備註">
            <Input />
          </Form.Item>
          <Form.Item name="floor" label="樓層">
            <Input placeholder="例如 4F" />
          </Form.Item>
        </Form>
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
            <Input
              className="project-name-input"
              aria-label="專案名稱"
              placeholder="輸入專案名稱"
              maxLength={120}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              title="載入時使用 JSON 最外層的 name；匯出時也會同步更新該欄位。"
            />
            <Tooltip title="復原">
              <Button
                aria-label="復原"
                icon={<UndoOutlined />}
                disabled={editor.past.length === 0}
                onClick={() => dispatchEditor({ type: 'undo' })}
              />
            </Tooltip>
            <Tooltip title="重做">
              <Button
                aria-label="重做"
                icon={<RedoOutlined />}
                disabled={editor.future.length === 0}
                onClick={() => dispatchEditor({ type: 'redo' })}
              />
            </Tooltip>
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
            <Button danger disabled={isLoading} onClick={handleClearProject}>
              清空專案
            </Button>
            <Button disabled={!config} onClick={handleSave}>
              {isDirty ? '匯出修改' : '另存新 JSON'}
            </Button>
            <Button disabled={!config} onClick={openDeviceManager}>
              專案管理
            </Button>
            <Button disabled={!config} onClick={() => setIconLibraryOpen(true)}>
              圖示庫
            </Button>
            <Button disabled={!config} onClick={openFloorFrameDialog}>
              View 設定
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
                                <Text>圖示大小（%）</Text>
                                <InputNumber
                                  aria-label="圖示大小"
                                  min={ICON_SCALE_MIN}
                                  max={ICON_SCALE_MAX}
                                  step={5}
                                  addonAfter="%"
                                  value={selectedModel.grid.iconScale}
                                  onChange={(iconScale) => {
                                    if (iconScale !== null) {
                                      handleUpdateGrid(selectedView.id, { iconScale })
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
                                <Text>標籤與圖示距離</Text>
                                <InputNumber
                                  aria-label="標籤與圖示距離"
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
                              onClick={openBatchAddTab}
                            >
                              批次加入 Tag
                            </Button>
                            <Button
                              size="small"
                              disabled={
                                !selectedView
                                || !selectedModel?.components.some(
                                  (component) => component.managed !== false,
                                )
                                || !config?.views.some((view) => {
                                  const id = view.id || view.key
                                  return id !== selectedView.id && models.has(id)
                                })
                              }
                              onClick={() => selectedView && openBatchMoveDialog(selectedView.id)}
                            >
                              批次移動
                            </Button>
                          </Space>
                        )}
                        className="view-details"
                      >
                        {selectedModel && selectedModel.components.some(
                          (component) => component.managed !== false,
                        ) ? (
                          <div className="component-list">
                            <Text type="secondary">
                              使用箭頭調整同一樓層內的元件順序；排序會同步套用至預覽與匯出。
                            </Text>
                            {managedComponentGroups.map((group) => (
                              <section className="managed-component-floor" key={group.floor}>
                                <Text className="managed-component-floor-title" type="secondary">
                                  {group.title}
                                </Text>
                                {group.items.map((component, index) => (
                                <div
                                  className={`component-row${
                                    component.template === 'icon-multi' ? ' component-row-multi' : ''
                                  }`}
                                  key={component.key}
                                >
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
                                      onChange={(tagId: string) => {
                                        if (component.template === 'icon-multi') {
                                          const primaryBinding = component.multiStateBindings?.[0]
                                          if (primaryBinding) {
                                            handleUpdateMultiStateBinding(
                                              selectedView.id,
                                              component,
                                              primaryBinding.stateKey,
                                              tagId,
                                            )
                                            return
                                          }
                                        }
                                        handleUpdateComponent(
                                          selectedView.id,
                                          component.key,
                                          { tagId },
                                        )
                                      }}
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
                                    {component.template !== 'icon-pair'
                                      && component.template !== 'icon-multi' && (
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
                                  {component.template === 'icon-multi' && (
                                    <div className="multi-state-bindings">
                                      <Text strong>多狀態 Tag 綁定</Text>
                                      {!iconLibrary.some((icon) =>
                                        icon.type === 'multi-state' && icon.id === component.multiIconSetId)
                                        && (
                                          <Alert
                                            type="error"
                                            showIcon
                                            title={`找不到多狀態圖示組「${component.multiIconSetId || ''}」。`}
                                          />
                                        )}
                                      {(component.multiStateBindings ?? []).map((binding, index) => {
                                        const iconSet = iconLibrary.find((icon) =>
                                          icon.type === 'multi-state'
                                          && icon.id === component.multiIconSetId)
                                        const stateDefinition = iconSet?.type === 'multi-state'
                                          ? iconSet.states.find((state) => state.key === binding.stateKey)
                                          : undefined
                                        const stateTagOptions = tags
                                          .filter((tag) => ['bool', 'boolean'].includes(
                                            tag.type.toLocaleLowerCase(),
                                          ))
                                          .map((tag) => ({
                                            value: tag.id,
                                            label: tagLabel(tag),
                                            disabled: component.multiStateBindings?.some(
                                              (candidate) => candidate.stateKey !== binding.stateKey
                                                && candidate.tagId === tag.id,
                                            ) ?? false,
                                          }))
                                        if (binding.tagId && !stateTagOptions.some(
                                          (option) => option.value === binding.tagId,
                                        )) {
                                          const existingTag = tags.find((tag) => tag.id === binding.tagId)
                                          stateTagOptions.unshift({
                                            value: binding.tagId,
                                            label: existingTag
                                              ? `Tag 型別不符（${tagLabel(existingTag)}）`
                                              : `Tag 不存在（${binding.tagId}）`,
                                            disabled: true,
                                          })
                                        }
                                        return (
                                          <div className="multi-state-binding-row" key={binding.stateKey}>
                                            {stateDefinition && (
                                              <Image
                                                src={stateDefinition.asset.dataUrl}
                                                alt={`${stateDefinition.name} 圖示`}
                                                width={32}
                                                height={32}
                                              />
                                            )}
                                            <Text>
                                              優先 {index + 1} · {stateDefinition?.name ?? binding.stateKey}
                                            </Text>
                                            <Select
                                              aria-label={`${stateDefinition?.name ?? binding.stateKey} 狀態 Tag`}
                                              allowClear
                                              showSearch
                                              optionFilterProp="label"
                                              value={binding.tagId || undefined}
                                              placeholder="選擇 Boolean Tag"
                                              options={stateTagOptions}
                                              onChange={(tagId: string | undefined) => (
                                                handleUpdateMultiStateBinding(
                                                  selectedView.id,
                                                  component,
                                                  binding.stateKey,
                                                  tagId ?? '',
                                                )
                                              )}
                                            />
                                          </div>
                                        )
                                      })}
                                      <Text type="secondary">
                                        優先順序依圖示庫狀態列表設定；同一元件不可重複綁定 Tag。
                                      </Text>
                                    </div>
                                  )}
                                  <Space
                                    className="component-actions"
                                    direction="vertical"
                                    size={0}
                                  >
                                    <Button
                                      size="small"
                                      type="text"
                                      aria-label={`移動 ${component.label || '元件'} 至其他 View`}
                                      title="移動至其他 View"
                                      onClick={() => openComponentMoveDialog(
                                        selectedView.id,
                                        component.key,
                                      )}
                                      icon={<SwapOutlined />}
                                    />
                                    <Button
                                      size="small"
                                      type="text"
                                      aria-label={`上移 ${component.label || '元件'}`}
                                      title="在此樓層上移"
                                      disabled={index === 0}
                                      onClick={() => handleMoveComponent(
                                        selectedView.id,
                                        component.key,
                                        -1,
                                      )}
                                      icon={<UpOutlined />}
                                    />
                                    <Button
                                      size="small"
                                      type="text"
                                      aria-label={`下移 ${component.label || '元件'}`}
                                      title="在此樓層下移"
                                      disabled={index === group.items.length - 1}
                                      onClick={() => handleMoveComponent(
                                        selectedView.id,
                                        component.key,
                                        1,
                                      )}
                                      icon={<DownOutlined />}
                                    />
                                    <Button
                                      danger
                                      size="small"
                                      type="text"
                                      aria-label={`刪除 ${component.label || '元件'}`}
                                      title="刪除此元件"
                                      onClick={() => {
                                        if (window.confirm('刪除此元件？匯出時會從 View 的 SVG 和 items 一併移除。')) {
                                          handleRemoveComponent(selectedView.id, component.key)
                                        }
                                      }}
                                      icon={<DeleteOutlined />}
                                    />
                                  </Space>
                                </div>
                                ))}
                              </section>
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
