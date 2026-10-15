import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Empty,
  Layout,
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
import type { FuxaViewSummary, ParsedFuxaConfig } from './domain/config/types'
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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [config, setConfig] = useState<ParsedFuxaConfig | null>(null)
  const [fileName, setFileName] = useState('')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedView = useMemo(
    () => config ? getSelectedView(config.views, selectedViewId) : undefined,
    [config, selectedViewId],
  )
  const tagCount = config ? countTags(config.devices) : 0

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsLoading(true)
    try {
      const text = await file.text()
      const parsed = parseFuxaConfig(text)
      setConfig(parsed)
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

  function handleSave() {
    if (!config) return

    try {
      const prepared = prepareFuxaConfigExport({
        config: config.rawConfig,
        originalText: config.originalText,
        sourceFormat: config.sourceFormat,
        dirty: false,
      })
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
      messageApi.success('已另存配置 JSON。')
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知錯誤'
      messageApi.error(`匯出失敗：${detail}`)
    }
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
              另存新 JSON
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
                  <Tag color="blue">唯讀載入階段</Tag>
                </div>

                <Space className="summary-cards" size="middle" wrap>
                  <Card className="summary-card"><Statistic title="Views" value={config.views.length} /></Card>
                  <Card className="summary-card"><Statistic title="Devices" value={Object.keys(config.devices).length} /></Card>
                  <Card className="summary-card"><Statistic title="Tags" value={tagCount} /></Card>
                </Space>

                {selectedView ? (
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
                ) : (
                  <Alert type="info" showIcon message="此配置沒有可選取的 View。" />
                )}

                <Card className="next-step-card">
                  <Text strong>目前進度</Text>
                  <Text type="secondary">
                    已完成應用程式外框與本機配置載入。接續將遷移 domain 資料規則及 View 元件編輯流程。
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
