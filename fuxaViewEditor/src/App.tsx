import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Layout,
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
import { buildTagIndex } from './domain/tags/index'
import type { FuxaViewSummary, ParsedFuxaConfig } from './domain/config/types'
import type { ExportViewModel } from './domain/config/prepareFuxaConfigExport'
import type { Bounds, FloorLayoutComponent } from './domain/layout/floorLayout'
import type { GridSettings } from './domain/config/types'
import type { IndexedTag } from './domain/tags/index'
import './App.css'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography

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
  return views.find((view) => view.key === selectedViewId)
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
  const [messageApi, contextHolder] = message.useMessage()
  const [config, setConfig] = useState<ParsedFuxaConfig | null>(null)
  const [fileName, setFileName] = useState('')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [models, setModels] = useState<Map<string, ExportViewModel>>(new Map())
  const [modelErrors, setModelErrors] = useState<Map<string, string>>(new Map())
  const [unsupported, setUnsupported] = useState<Map<string, string[]>>(new Map())
  const [modifiedViewIds, setModifiedViewIds] = useState<Set<string>>(new Set())

  const selectedView = useMemo(
    () => config ? getSelectedView(config.views, selectedViewId) : undefined,
    [config, selectedViewId],
  )
  const selectedModel = selectedView ? models.get(selectedView.id) : undefined
  const tags = useMemo(
    () => config ? [...buildTagIndex(config.rawConfig).values()] : [],
    [config],
  )
  const tagCount = config ? countTags(config.devices) : 0

  async function loadFile(file: File) {
    setIsLoading(true)
    try {
      const text = await file.text()
      const parsed = parseFuxaConfig(text)
      const editorModels = buildViewEditorModels(parsed.rawConfig, DOMParser, measureSvgBounds)
      setConfig(parsed)
      setModels(editorModels.models)
      setModelErrors(editorModels.errors)
      setUnsupported(editorModels.unsupported)
      setModifiedViewIds(new Set())
      setFileName(file.name)
      setSelectedViewId(parsed.views[0]?.key ?? '')
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

    if (modifiedViewIds.size > 0) {
      if (!window.confirm('有尚未匯出的修改。載入新配置會捨棄目前修改，確定繼續嗎？')) return
    }
    void loadFile(file)
  }

  function handleSave() {
    if (!config) return

    try {
      const dependencies = modifiedViewIds.size > 0
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
        dirty: modifiedViewIds.size > 0,
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
        setConfig(parseFuxaConfig(prepared.text))
        setModels(savedModels)
        setModifiedViewIds(new Set())
      }
      messageApi.success(prepared.dirty ? '已匯出修改後的配置 JSON。' : '已另存配置 JSON。')
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知錯誤'
      messageApi.error(`匯出失敗：${detail}`)
    }
  }

  function handleRemoveComponent(viewId: string, key: string) {
    const model = models.get(viewId)
    if (!model) return
    const component = model.components.find((item) => item.key === key)
    if (!component || component.managed === false) return
    const nextModels = new Map(models)
    nextModels.set(viewId, {
      ...model,
      components: model.components.filter((item) => item.key !== key),
    })
    setModels(nextModels)
    setModifiedViewIds((current) => new Set(current).add(viewId))
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

    const nextModels = new Map(models)
    nextModels.set(viewId, {
      ...model,
      components: model.components.map((item) => (
        item.key === key ? { ...item, ...update } : item
      )),
    })
    setModels(nextModels)
    setModifiedViewIds((current) => new Set(current).add(viewId))
  }

  function handleUpdateGrid(
    viewId: string,
    update: Partial<GridSettings>,
  ) {
    const model = models.get(viewId)
    if (!model) return
    const nextModels = new Map(models)
    nextModels.set(viewId, {
      ...model,
      grid: { ...model.grid, ...update },
    })
    setModels(nextModels)
    setModifiedViewIds((current) => new Set(current).add(viewId))
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
              {modifiedViewIds.size ? '匯出修改' : '另存新 JSON'}
            </Button>
          </Space>
        </Header>

        <Layout className="editor-body">
          <Sider width={260} theme="light" className="view-sidebar">
            <div className="sidebar-heading">
              <Text strong>Views</Text>
              <Tag>{config?.views.length ?? 0}</Tag>
            </div>
            {config ? (
              config.views.length > 0 ? (
                <nav className="view-list" aria-label="View 清單">
                  {config.views.map((view) => (
                    <Button
                      key={view.key}
                      type="text"
                      block
                      className={view.key === selectedViewId ? 'view-item selected' : 'view-item'}
                      aria-current={view.key === selectedViewId ? 'page' : undefined}
                      onClick={() => setSelectedViewId(view.key)}
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
                  <Tag color={modifiedViewIds.has(selectedView?.id ?? '') ? 'orange' : 'blue'}>
                    {modifiedViewIds.has(selectedView?.id ?? '') ? '有未匯出修改' : 'View 元件管理'}
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
                      <Alert
                        type="warning"
                        showIcon
                        message="此 View 無法編輯"
                        description={modelErrors.get(selectedView.id)}
                      />
                    ) : (
                      <>
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
                          <Tag>
                            {selectedModel?.components.filter(
                              (component) => component.managed !== false,
                            ).length ?? 0}
                          </Tag>
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
                      </>
                    )}
                    {(unsupported.get(selectedView.id)?.length ?? 0) > 0 && (
                      <Alert
                        type="info"
                        showIcon
                        message="部分既有 SVG 元件不會自動移動"
                        description={unsupported.get(selectedView.id)?.join('；')}
                      />
                    )}
                  </Space>
                ) : (
                  <Alert type="info" showIcon message="此配置沒有可選取的 View。" />
                )}

                <Card className="next-step-card">
                  <Text strong>目前進度</Text>
                  <Text type="secondary">
                    可調整 View 的 Grid 排版、編輯或刪除已管理元件，並匯出修改後配置；編輯僅在本機進行。
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
