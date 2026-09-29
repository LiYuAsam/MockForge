import { useEffect, useState } from 'react'
import type { ChatConfig, InterfaceConfig, ModelConfig } from '../../core/models'
import { appRepository } from '../../core/storage/app-repository'
import { saveChatConfig as saveSharedChatConfig } from '../chat/chat-storage-client'

const EMPTY_MODEL_CONFIG: ModelConfig = { baseUrl: '', apiKey: '', model: '', extraHeaders: {} }
const DEFAULT_CHAT_CONFIG: ChatConfig = { historyLimit: 10, enablePdfParsing: false, enableDocxParsing: false, pdfProcessing: 'hybrid', pdfTextThreshold: 30, pdfMaxVisualPages: 10 }
const DEFAULT_INTERFACE_CONFIG: InterfaceConfig = { showFloatingLauncher: true }
type SettingsSection = 'model' | 'ai' | 'interface'

const sections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: 'model', label: '模型', description: '模型服务与鉴权' },
  { id: 'ai', label: 'AI 与文档', description: '对话与附件解析' },
  { id: 'interface', label: '界面', description: '入口与展示偏好' },
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('model')
  const [config, setConfig] = useState<ModelConfig>(EMPTY_MODEL_CONFIG)
  const [draftConfig, setDraftConfig] = useState<ModelConfig>(EMPTY_MODEL_CONFIG)
  const [chatConfig, setChatConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG)
  const [interfaceConfig, setInterfaceConfig] = useState<InterfaceConfig>(DEFAULT_INTERFACE_CONFIG)
  const [editingModel, setEditingModel] = useState(true)
  const [modelSaved, setModelSaved] = useState('')
  const [chatSaved, setChatSaved] = useState('')
  const [interfaceSaved, setInterfaceSaved] = useState('')

  useEffect(() => {
    void Promise.all([appRepository.getModelConfig(), appRepository.getChatConfig(), appRepository.getInterfaceConfig()]).then(([model, chat, interfaceSettings]) => {
      setConfig(model); setChatConfig(chat); setInterfaceConfig(interfaceSettings); setEditingModel(!hasModelConfig(model))
    })
  }, [])

  function beginModelEdit(): void { setDraftConfig(config); setModelSaved(''); setEditingModel(true) }
  function cancelModelEdit(): void { setDraftConfig(EMPTY_MODEL_CONFIG); setModelSaved(''); setEditingModel(false) }
  async function saveModel(): Promise<void> {
    await appRepository.saveModelConfig(draftConfig)
    setConfig(draftConfig); setDraftConfig(EMPTY_MODEL_CONFIG); setEditingModel(!hasModelConfig(draftConfig)); setModelSaved('已保存')
  }
  async function saveChat(): Promise<void> {
    await saveSharedChatConfig(chatConfig)
    setChatSaved('已保存')
  }
  async function saveInterface(): Promise<void> { await appRepository.saveInterfaceConfig(interfaceConfig); setInterfaceSaved('已保存，已打开的网页会立即同步。') }

  return <section className="settings">
    <nav className="settings__nav" aria-label="设置分类">{sections.map((section) => <button key={section.id} type="button" className={activeSection === section.id ? 'settings__nav-item settings__nav-item--active' : 'settings__nav-item'} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => setActiveSection(section.id)}><strong>{section.label}</strong><small>{section.description}</small></button>)}</nav>
    <div className="settings__content">
      {activeSection === 'model' && <section className="panel"><h2 className="panel__title">模型配置</h2>{editingModel ? <div className="stack settings__form"><p className="muted">模型请求将从浏览器直接发送至以下地址。服务需支持 OpenAI 兼容的 Tools / Function Calling。</p><label className="field"><span>Base URL</span><input placeholder="https://api.openai.com/v1" value={draftConfig.baseUrl} onChange={(event) => setDraftConfig({ ...draftConfig, baseUrl: event.target.value })} /></label><label className="field"><span>API Key</span><input type="password" autoComplete="new-password" value={draftConfig.apiKey} onChange={(event) => setDraftConfig({ ...draftConfig, apiKey: event.target.value })} /></label><label className="field"><span>模型名称</span><input placeholder="gpt-4.1-mini" value={draftConfig.model} onChange={(event) => setDraftConfig({ ...draftConfig, model: event.target.value })} /></label><div className="row"><button className="button" onClick={() => void saveModel()}>保存模型配置</button>{hasModelConfig(config) && <button className="button button--ghost" onClick={cancelModelEdit}>取消</button>}</div></div> : <div className="model-config-summary"><span className="muted">当前模型</span><strong>{config.model}</strong><button className="button button--ghost" onClick={beginModelEdit}>编辑模型配置</button>{modelSaved && <span className="muted">{modelSaved}</span>}</div>}</section>}
      {activeSection === 'ai' && <section className="stack"><div className="panel"><h2 className="panel__title">对话</h2><div className="settings__form"><label className="field"><span>保留最近对话数</span><small className="field__hint">历史对话仅保存在本机，超过数量会删除最早的会话。</small><input type="number" min="1" max="100" value={chatConfig.historyLimit} onChange={(event) => setChatConfig({ ...chatConfig, historyLimit: Number(event.target.value) })} /></label><div className="row"><button className="button" onClick={() => void saveChat()}>保存 AI 设置</button>{chatSaved && <span className="muted">{chatSaved}</span>}</div></div></div><div className="panel"><h2 className="panel__title">文档解析</h2><p className="muted">解析仅在本机浏览器执行。附件正文和页图不会保存到历史会话。</p><div className="stack settings__form"><label className="setting-toggle"><input type="checkbox" checked={chatConfig.enablePdfParsing} onChange={(event) => setChatConfig({ ...chatConfig, enablePdfParsing: event.target.checked })} /><span><strong>启用本地 PDF 解析</strong><small>开启后可上传 PDF，并按下方策略提取文本或页图。</small></span></label><fieldset className="setting-options" disabled={!chatConfig.enablePdfParsing}><legend>PDF 处理方式</legend><small className="field__hint">决定 PDF 页面以文本还是图片形式发送给模型。</small><label><input type="radio" name="pdf-processing" value="hybrid" checked={chatConfig.pdfProcessing === 'hybrid'} onChange={() => setChatConfig({ ...chatConfig, pdfProcessing: 'hybrid' })} /><span><strong>混合模式（推荐）</strong><small>有足够文字的页面发送文本，扫描页或文字很少的页面发送图片。</small></span></label><label><input type="radio" name="pdf-processing" value="text" checked={chatConfig.pdfProcessing === 'text'} onChange={() => setChatConfig({ ...chatConfig, pdfProcessing: 'text' })} /><span><strong>仅提取文本</strong><small>不使用视觉模型，适合可复制文字的普通 PDF。</small></span></label><label><input type="radio" name="pdf-processing" value="vision" checked={chatConfig.pdfProcessing === 'vision'} onChange={() => setChatConfig({ ...chatConfig, pdfProcessing: 'vision' })} /><span><strong>全部按图片</strong><small>每页渲染为图片交给视觉模型，适合扫描件和图表较多的文档。</small></span></label></fieldset><div className="form-grid"><label className="field"><span>文本阈值（字符/页）</span><small className="field__hint">混合模式中，页面文本少于该值时按扫描页处理。</small><input type="number" min="0" max="1000" disabled={!chatConfig.enablePdfParsing || chatConfig.pdfProcessing !== 'hybrid'} value={chatConfig.pdfTextThreshold} onChange={(event) => setChatConfig({ ...chatConfig, pdfTextThreshold: Number(event.target.value) })} /></label><label className="field"><span>最大视觉页数</span><small className="field__hint">限制发送为图片的页数，避免请求时间和成本过高。</small><input type="number" min="1" max="30" disabled={!chatConfig.enablePdfParsing || chatConfig.pdfProcessing === 'text'} value={chatConfig.pdfMaxVisualPages} onChange={(event) => setChatConfig({ ...chatConfig, pdfMaxVisualPages: Number(event.target.value) })} /></label></div><label className="setting-toggle"><input type="checkbox" checked={chatConfig.enableDocxParsing} onChange={(event) => setChatConfig({ ...chatConfig, enableDocxParsing: event.target.checked })} /><span><strong>启用本地 DOCX 解析</strong><small>开启后可提取 Word 文档的标题、列表与表格结构并发送给模型。</small></span></label><div className="row"><button className="button" onClick={() => void saveChat()}>保存文档解析设置</button>{chatSaved && <span className="muted">{chatSaved}</span>}</div></div></div></section>}
      {activeSection === 'interface' && <section className="panel"><h2 className="panel__title">界面</h2><div className="stack settings__form"><label className="setting-toggle"><input type="checkbox" checked={interfaceConfig.showFloatingLauncher} onChange={(event) => { setInterfaceConfig({ showFloatingLauncher: event.target.checked }); setInterfaceSaved('') }} /><span><strong>显示网页悬浮入口</strong><small>在可访问网页显示 API Mook 悬浮图标。关闭后不影响请求 Mock 和流量监听。</small></span></label><div className="row"><button className="button" onClick={() => void saveInterface()}>保存界面设置</button>{interfaceSaved && <span className="muted">{interfaceSaved}</span>}</div></div></section>}
    </div>
  </section>
}

function hasModelConfig(config: ModelConfig): boolean { return Boolean(config.baseUrl && config.model) }
