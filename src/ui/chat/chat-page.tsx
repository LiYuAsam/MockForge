import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatConfig, ChatConversation, ChatMessage, Folder, MockRule, RuleChangeDraft } from '../../core/models'
import { appRepository } from '../../core/storage/app-repository'
import { createId } from '../../shared/ids'
import type { RuntimeMessage, RuntimeResponse } from '../../shared/messages'
import { IconButton } from '../components/icon-button'
import { askModel, type ToolActivity } from './model-client'
import { createPendingAttachment, MAX_ATTACHMENTS, parseAttachment, type PendingAttachment, type RuntimeAttachment } from './file-parser'
import { getMentionQuery, searchMentions } from './mention-search'

export function ChatPage({ rules, folders, onSaveRule, onDeleteRule }: { rules: MockRule[]; folders: Folder[]; onSaveRule: (rule: MockRule) => Promise<void>; onDeleteRule: (id: string) => Promise<void> }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>()
  const [activeTitle, setActiveTitle] = useState('')
  const [historyLimit, setHistoryLimit] = useState(10)
  const [chatConfig, setChatConfig] = useState<ChatConfig>({ historyLimit: 10, enablePdfParsing: false, enableDocxParsing: false, pdfProcessing: 'hybrid', pdfTextThreshold: 30, pdfMaxVisualPages: 10 })
  const [historyReady, setHistoryReady] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState(0)
  const [sending, setSending] = useState(false)
  const [pendingAssistantId, setPendingAssistantId] = useState<string>()
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string>()
  const [drafts, setDrafts] = useState<RuleChangeDraft[]>([])
  const [renamingId, setRenamingId] = useState<string>()
  const [renamingTitle, setRenamingTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>()
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [historyPopoverOpen, setHistoryPopoverOpen] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string }>()
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const historyRoot = useRef<HTMLElement>(null)
  const currentSnapshot = useRef<ChatConversation | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  const deletedConversationIds = useRef(new Set<string>())
  const runtimeAttachmentsByMessage = useRef(new Map<string, RuntimeAttachment[]>())
  const query = getMentionQuery(text, cursor)
  const options = useMemo(() => query === undefined ? [] : searchMentions(query, rules, folders), [query, rules, folders])

  useEffect(() => {
    let cancelled = false
    void Promise.all([appRepository.listChatConversations(), appRepository.getChatConfig()]).then(([items, config]) => {
      if (cancelled) return
      const sorted = sortConversations(items)
      setConversations(sorted); setHistoryLimit(config.historyLimit); setChatConfig(config)
      const latest = sorted[0]
      if (latest) {
        setActiveConversationId(latest.id); setActiveTitle(latest.title); setMessages(latest.messages); setDrafts(normalizeDrafts(latest.drafts))
      }
      setHistoryReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const reloadAfterConfigChange = (changes: { chatConfig?: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local' || !changes.chatConfig) return
      void Promise.all([appRepository.listChatConversations(), appRepository.getChatConfig()]).then(([items, config]) => {
        const sorted = sortConversations(items)
        setConversations(sorted); setHistoryLimit(config.historyLimit); setChatConfig(config)
        if (activeConversationId && !sorted.some((item) => item.id === activeConversationId)) {
          currentSnapshot.current = undefined
          setActiveConversationId(undefined); setActiveTitle(''); setMessages([]); setDrafts([]); setText('')
        }
      })
    }
    chrome.storage.onChanged.addListener(reloadAfterConfigChange)
    return () => chrome.storage.onChanged.removeListener(reloadAfterConfigChange)
  }, [activeConversationId])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!historyPopoverOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!historyRoot.current?.contains(event.target as Node)) setHistoryPopoverOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setHistoryPopoverOpen(false) }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('mousedown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape) }
  }, [historyPopoverOpen])

  useEffect(() => {
    if (!imagePreview) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setImagePreview(undefined) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [imagePreview])

  useEffect(() => {
    if (!historyReady || !activeConversationId) {
      currentSnapshot.current = undefined
      return
    }
    const existing = conversations.find((item) => item.id === activeConversationId)
    const snapshot: ChatConversation = {
      id: activeConversationId,
      title: activeTitle || getConversationTitle(messages),
      messages,
      drafts,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    currentSnapshot.current = snapshot
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void persistConversation(snapshot) }, 400)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [historyReady, activeConversationId, activeTitle, conversations, drafts, historyLimit, messages])

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const snapshot = currentSnapshot.current
    if (snapshot && !deletedConversationIds.current.has(snapshot.id)) void appRepository.saveChatConversation(snapshot, historyLimit)
  }, [historyLimit])

  async function persistConversation(conversation: ChatConversation): Promise<void> {
    if (deletedConversationIds.current.has(conversation.id)) return
    const expired = await appRepository.saveChatConversation(conversation, historyLimit)
    if (expired.length) setConversations((items) => items.filter((item) => !expired.includes(item.id)))
  }

  function flushCurrentConversation(): void {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const snapshot = currentSnapshot.current
    if (snapshot && !deletedConversationIds.current.has(snapshot.id)) void persistConversation(snapshot)
  }

  function insertMention(index: number): void {
    const option = options[index]
    if (!option || query === undefined) return
    const start = cursor - query.length - 1
    const next = `${text.slice(0, start)}@${option.label} ${text.slice(cursor)}`
    setText(next); setActive(0)
    requestAnimationFrame(() => { const nextCursor = start + option.label.length + 2; input.current?.focus(); input.current?.setSelectionRange(nextCursor, nextCursor); setCursor(nextCursor) })
  }

  async function addAttachments(files: File[]): Promise<void> {
    const available = MAX_ATTACHMENTS - pendingAttachments.length
    if (available <= 0) { setAttachmentNotice(`最多可添加 ${MAX_ATTACHMENTS} 个附件。`); return }
    const selected = files.slice(0, available)
    if (files.length > selected.length) setAttachmentNotice(`最多可添加 ${MAX_ATTACHMENTS} 个附件，其余文件未添加。`)
    const entries = selected.map(createPendingAttachment)
    setPendingAttachments((items) => [...items, ...entries])
    await Promise.all(entries.map(async (entry, index) => {
      try {
        const runtime = await parseAttachment(selected[index], entry.metadata, chatConfig)
        setPendingAttachments((items) => items.map((item) => item.metadata.id === entry.metadata.id ? { ...item, status: 'ready', runtime } : item))
      } catch (error) {
        setPendingAttachments((items) => items.map((item) => item.metadata.id === entry.metadata.id ? { ...item, status: 'error', error: error instanceof Error ? error.message : '附件处理失败。' } : item))
      }
    }))
  }

  function removeAttachment(id: string): void {
    setPendingAttachments((items) => items.filter((item) => item.metadata.id !== id))
  }

  async function submit(): Promise<void> {
    const readyAttachments = pendingAttachments.filter((attachment) => attachment.status === 'ready' && attachment.runtime)
    if ((!text.trim() && !readyAttachments.length) || sending || pendingAttachments.some((attachment) => attachment.status === 'preparing')) return
    const references = findReferences(text, rules, folders)
    const user: ChatMessage = { id: createId('chat'), role: 'user', content: text.trim() || '请分析附件中的接口定义，并提出 Mock 规则建议。', references, attachments: readyAttachments.map((attachment) => attachment.metadata), createdAt: Date.now() }
    const assistantId = createId('chat')
    const assistant: ChatMessage = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }
    const conversationId = activeConversationId ?? createId('conversation')
    const title = activeTitle || getConversationTitle([user])
    if (!activeConversationId) {
      const now = Date.now()
      setActiveConversationId(conversationId); setActiveTitle(title)
      setConversations((items) => sortConversations([{ id: conversationId, title, messages: [], drafts: [], createdAt: now, updatedAt: now }, ...items]))
    }
    runtimeAttachmentsByMessage.current.set(user.id, readyAttachments.map((attachment) => attachment.runtime!))
    setMessages((items) => [...items, user, assistant]); setText(''); setPendingAttachments([]); setAttachmentNotice(''); setToolActivities([]); setSending(true); setPendingAssistantId(assistantId)
    try {
      const config = await appRepository.getModelConfig()
      const [traffic, page] = await Promise.all([getTrafficForTools(), getPageContextForTools()])
      const result = await askModel(config, [...messages, user], references, rules, folders, traffic, page, runtimeAttachmentsByMessage.current, (content) => {
        setPendingAssistantId(undefined)
        setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content } : item))
      }, (activity) => setToolActivities((items) => {
        const index = items.findIndex((item) => item.id === activity.id)
        return index < 0 ? [...items, activity] : items.map((item) => item.id === activity.id ? activity : item)
      }))
      setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: result.reply } : item))
      setDrafts(result.actions)
    } catch (error) {
      setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, role: 'system', content: error instanceof Error ? error.message : '模型调用失败' } : item))
    } finally { setSending(false); setPendingAssistantId(undefined) }
  }

  function startNewConversation(): void {
    if (sending) return
    flushCurrentConversation()
    setActiveConversationId(undefined); setActiveTitle(''); setMessages([]); setDrafts([]); setToolActivities([]); setText(''); setCursor(0); setConfirmDeleteId(undefined); setRenamingId(undefined); setHistoryPopoverOpen(false); setPendingAttachments([]); setAttachmentNotice('')
    requestAnimationFrame(() => input.current?.focus())
  }

  function selectConversation(conversation: ChatConversation): void {
    if (conversation.id === activeConversationId || sending) return
    flushCurrentConversation()
    setActiveConversationId(conversation.id); setActiveTitle(conversation.title); setMessages(conversation.messages); setDrafts(normalizeDrafts(conversation.drafts)); setText(''); setCursor(0); setConfirmDeleteId(undefined); setRenamingId(undefined); setHistoryPopoverOpen(false); setPendingAttachments([]); setAttachmentNotice('')
  }

  function beginRename(conversation: ChatConversation): void {
    if (sending) return
    setConfirmDeleteId(undefined); setRenamingId(conversation.id); setRenamingTitle(conversation.title)
  }

  function commitRename(conversation: ChatConversation): void {
    if (renamingId !== conversation.id) return
    const title = renamingTitle.trim() || getConversationTitle(conversation.messages)
    const renamed = { ...conversation, title, updatedAt: Date.now() }
    setConversations((items) => sortConversations(items.map((item) => item.id === conversation.id ? renamed : item)))
    if (conversation.id === activeConversationId) setActiveTitle(title)
    else void persistConversation(renamed)
    setRenamingId(undefined)
  }

  async function requestDeleteConversation(conversation: ChatConversation): Promise<void> {
    if (sending) return
    if (confirmDeleteId !== conversation.id) { setConfirmDeleteId(conversation.id); setRenamingId(undefined); return }
    deletedConversationIds.current.add(conversation.id)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setConfirmDeleteId(undefined)
    await appRepository.deleteChatConversation(conversation.id)
    setConversations((items) => items.filter((item) => item.id !== conversation.id))
    if (conversation.id === activeConversationId) {
      currentSnapshot.current = undefined
      setActiveConversationId(undefined); setActiveTitle(''); setMessages([]); setDrafts([]); setText(''); setCursor(0); setPendingAssistantId(undefined)
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  function editMessage(message: ChatMessage): void {
    const index = messages.findIndex((item) => item.id === message.id)
    if (index < 0 || sending) return
    setMessages((items) => items.slice(0, index)); setDrafts([]); setText(message.content); setActive(0)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(message.content.length, message.content.length); setCursor(message.content.length) })
  }

  async function copyMessage(message: ChatMessage): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId((id) => id === message.id ? undefined : id), 1600)
    } catch {
      setCopiedMessageId(undefined)
    }
  }

  function renderHistoryList(className: string): React.ReactNode {
    return <div className={className}>
      {!conversations.length && <div className="chat__history-empty">暂无历史对话</div>}
      {conversations.map((conversation) => <div className={`chat__history-item${conversation.id === activeConversationId ? ' chat__history-item--active' : ''}`} key={conversation.id}>
        {renamingId === conversation.id ? <form className="chat__history-rename" onSubmit={(event) => { event.preventDefault(); commitRename(conversation) }}><input autoFocus value={renamingTitle} aria-label="对话标题" onChange={(event) => setRenamingTitle(event.target.value)} onBlur={() => commitRename(conversation)} onKeyDown={(event) => { if (event.key === 'Escape') setRenamingId(undefined) }} /></form> : <button className="chat__history-select" aria-current={conversation.id === activeConversationId ? 'page' : undefined} onClick={() => selectConversation(conversation)}><span>{conversation.title}</span><small>{formatUpdatedAt(conversation.updatedAt)}</small></button>}
        <div className="chat__history-actions"><button type="button" title="修改标题" aria-label="修改标题" disabled={sending} onClick={() => beginRename(conversation)}>编辑</button><button type="button" className={confirmDeleteId === conversation.id ? 'chat__history-delete chat__history-delete--confirm' : 'chat__history-delete'} disabled={sending} onClick={() => void requestDeleteConversation(conversation)}>{confirmDeleteId === conversation.id ? '确认' : '删除'}</button></div>
      </div>)}
    </div>
  }

  return <section className="panel chat">
    <div className="chat__heading"><div><h2 className="panel__title">AI 助手</h2><p className="muted">输入 @ 可引用已有规则或文件夹。AI 可生成待确认的 Mock 操作，确认后才会修改规则。</p></div><IconButton icon="plus" label="新建对话" disabled={sending} onClick={startNewConversation} /></div>
    <div className="chat__layout" data-history-collapsed={historyCollapsed}>
      <aside ref={historyRoot} className="chat__history" aria-label="历史对话"><div className="chat__history-toolbar"><span className="chat__history-title">历史对话</span><IconButton className="chat__history-collapse" icon="panelLeft" label="收起历史对话" onClick={() => { setHistoryCollapsed(true); setHistoryPopoverOpen(false) }} /><IconButton className="chat__history-expand" icon="panelRight" label="展开历史对话" onClick={() => { setHistoryCollapsed(false); setHistoryPopoverOpen(false) }} /><IconButton className="chat__history-trigger" icon="history" label="打开历史对话" aria-expanded={historyPopoverOpen} onClick={() => setHistoryPopoverOpen((value) => !value)} /></div><div className="chat__history-content">{renderHistoryList('chat__history-list')}</div>{historyPopoverOpen && <div className="chat__history-popover">{renderHistoryList('chat__history-list chat__history-list--popover')}</div>}</aside>
      <div className="chat__main">
        <div className="chat__messages" aria-live="polite">{messages.map((message) => <article key={message.id} className={`chat__message chat__message--${message.role}`}>
          <div className="chat__message-actions"><button type="button" onClick={() => void copyMessage(message)}>{copiedMessageId === message.id ? '已复制' : '复制'}</button>{message.role === 'user' && <button type="button" disabled={sending} onClick={() => editMessage(message)}>编辑</button>}</div>
          {message.id === pendingAssistantId && !message.content ? <span className="chat__thinking"><i /><i /><i />AI 正在思考</span> : message.content}
          {message.attachments?.length ? <div className="chat__message-attachments">{message.attachments.map((attachment) => { const runtime = runtimeAttachmentsByMessage.current.get(message.id)?.find((item) => item.metadata.id === attachment.id); return <span key={attachment.id} title={`${attachment.type || '未知类型'} · ${formatBytes(attachment.size)}`}>{attachment.kind === 'image' && runtime?.imageDataUrls[0] ? <button type="button" className="chat__thumbnail-button" aria-label={`放大查看 ${attachment.name}`} onClick={() => setImagePreview({ url: runtime.imageDataUrls[0], name: attachment.name })}><img src={runtime.imageDataUrls[0]} alt="" /></button> : '📎'} {attachment.name}</span> })}</div> : null}
        </article>)}{toolActivities.length > 0 && <ToolActivityList activities={toolActivities} />}{!messages.length && <div className="empty">例如：把 @用户列表 的返回数据改为 20 条随机用户。</div>}<div ref={messagesEnd} /></div>
        {drafts.length > 0 && <DraftPreview drafts={drafts} rules={rules} onApply={async (draft) => { await applyDraft(draft, rules, onSaveRule, onDeleteRule); setDrafts((items) => items.filter((item) => item.id !== draft.id)) }} onDiscard={(id) => setDrafts((items) => items.filter((item) => item.id !== id))} onDiscardAll={() => setDrafts([])} />}
        <div className="chat__composer" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addAttachments([...event.dataTransfer.files]) }}>
          {options.length > 0 && <div className="mention-menu">{options.map((option, index) => <button key={`${option.type}-${option.id}`} data-active={index === active} onMouseDown={(event) => { event.preventDefault(); insertMention(index) }}><strong>@{option.label}</strong> <span className="muted">{option.type === 'rule' ? '接口规则' : '文件夹'}</span></button>)}</div>}
          <input ref={fileInput} className="chat__file-input" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.txt,.md,.markdown,.json,.yaml,.yml,.csv" onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; void addAttachments(files) }} />
          {pendingAttachments.length > 0 && <div className="chat__attachments">{pendingAttachments.map((attachment) => <div className={`chat__attachment chat__attachment--${attachment.status}`} key={attachment.metadata.id}>{attachment.metadata.kind === 'image' && attachment.runtime?.imageDataUrls[0] ? <button type="button" className="chat__thumbnail-button" aria-label={`放大查看 ${attachment.metadata.name}`} onClick={() => setImagePreview({ url: attachment.runtime!.imageDataUrls[0], name: attachment.metadata.name })}><img className="chat__attachment-preview" src={attachment.runtime.imageDataUrls[0]} alt={`${attachment.metadata.name} 缩略图`} /></button> : null}<span>{attachment.metadata.kind === 'image' ? '图片' : '文档'} · {attachment.metadata.name}</span><small>{attachment.status === 'preparing' ? '正在处理…' : attachment.status === 'error' ? attachment.error : formatBytes(attachment.metadata.size)}</small><button type="button" onClick={() => removeAttachment(attachment.metadata.id)} aria-label={`移除 ${attachment.metadata.name}`}>×</button></div>)}</div>}
          {attachmentNotice && <div className="chat__attachment-notice">{attachmentNotice}</div>}
          <textarea ref={input} value={text} aria-label="AI 助手输入框" placeholder="描述要调整的 Mock 数据，输入 @ 引用规则或文件夹，也可直接粘贴图片" onChange={(event) => { setText(event.target.value); setCursor(event.target.selectionStart); setActive(0) }} onClick={(event) => setCursor(event.currentTarget.selectionStart)} onPaste={(event) => { const images = [...event.clipboardData.items].filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file)); if (images.length) { if (!event.clipboardData.getData('text/plain')) event.preventDefault(); void addAttachments(images) } }} onKeyDown={(event) => { if (options.length && event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, options.length - 1)) } else if (options.length && event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)) } else if (options.length && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); insertMention(active) } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit() } }} />
          <div className="chat__composer-footer"><span className="muted">Ctrl / Cmd + Enter 发送</span><div className="row"><IconButton icon="attachment" label="添加附件" disabled={sending} onClick={() => fileInput.current?.click()} /><button className="button" disabled={sending || pendingAttachments.some((attachment) => attachment.status === 'preparing') || (!text.trim() && !pendingAttachments.some((attachment) => attachment.status === 'ready'))} onClick={() => void submit()}>{sending ? '思考中…' : '发送'}</button></div></div>
        </div>
      </div>
    </div>
    {imagePreview && <div className="chat__image-preview" role="dialog" aria-modal="true" aria-label={`${imagePreview.name} 预览`} onMouseDown={(event) => { if (event.target === event.currentTarget) setImagePreview(undefined) }}><button type="button" className="chat__image-preview-close" aria-label="关闭图片预览" onClick={() => setImagePreview(undefined)}>×</button><img src={imagePreview.url} alt={imagePreview.name} /></div>}
  </section>
}

function DraftPreview({ drafts, rules, onApply, onDiscard, onDiscardAll }: { drafts: RuleChangeDraft[]; rules: MockRule[]; onApply: (draft: RuleChangeDraft) => Promise<void>; onDiscard: (id: string) => void; onDiscardAll: () => void }) {
  const [savingId, setSavingId] = useState<string>()
  const [error, setError] = useState('')
  async function applyOne(draft: RuleChangeDraft): Promise<void> {
    setError(''); setSavingId(draft.id)
    try { await onApply(draft) } catch (cause) { setError(cause instanceof Error ? cause.message : '应用操作失败') } finally { setSavingId(undefined) }
  }
  async function applyAll(): Promise<void> {
    setError('')
    for (const draft of drafts) {
      setSavingId(draft.id)
      try { await onApply(draft) } catch (cause) { setError(cause instanceof Error ? cause.message : '应用操作失败'); break }
    }
    setSavingId(undefined)
  }
  return <div className="list-item list-item--warn ai-actions"><strong>待确认的 AI 操作（{drafts.length}）</strong><div className="ai-actions__list">{drafts.map((draft) => <div className="ai-actions__item" key={draft.id}><div><span className={`badge ai-actions__type ai-actions__type--${draft.type}`}>{draft.type === 'create' ? '新建' : draft.type === 'update' ? '修改' : '删除'}</span><strong>{draftTitle(draft, rules)}</strong><p className="muted">{draft.reason}</p></div><div className="row ai-actions__item-actions"><IconButton icon={savingId === draft.id ? 'refresh' : 'check'} label={savingId === draft.id ? '应用中' : '应用此草稿'} disabled={Boolean(savingId)} onClick={() => void applyOne(draft)} /><IconButton icon="close" className="icon-button--danger" label="丢弃此草稿" disabled={Boolean(savingId)} onClick={() => onDiscard(draft.id)} /></div></div>)}</div>{error && <p className="ai-actions__error" role="alert">{error}</p>}<div className="row" style={{ marginTop: 8 }}><IconButton icon={savingId ? 'refresh' : 'check'} label={savingId ? '应用中' : '确认全部应用'} disabled={Boolean(savingId)} onClick={() => void applyAll()} /><IconButton icon="close" className="icon-button--danger" label="丢弃全部草稿" disabled={Boolean(savingId)} onClick={onDiscardAll} /></div></div>
}

function ToolActivityList({ activities }: { activities: ToolActivity[] }) {
  return <div className="chat__tool-activities" aria-label="本轮工具调用">{activities.map((activity) => <span key={activity.id} className={`chat__tool-activity chat__tool-activity--${activity.status}`}>{activity.status === 'running' ? '…' : activity.status === 'success' ? '✓' : '!'} {toolActivityLabel(activity.name)}</span>)}</div>
}

function toolActivityLabel(name: string): string {
  const labels: Record<string, string> = { get_current_page_context: '已读取当前页面', list_current_page_traffic: '已查询当前页接口', list_traffic_apis: '已查询流量接口', get_traffic_api_detail: '已读取接口详情', list_mock_rules: '已查询 Mock 列表', get_mock_rule: '已读取 Mock 详情', search_mock_rules: '已检索 Mock 规则', create_mock_rule: '已生成 Mock 草稿', update_mock_rule: '已生成修改草稿', delete_mock_rule: '已生成删除草稿' }
  return labels[name] ?? `已调用 ${name}`
}

async function applyDraft(draft: RuleChangeDraft, rules: MockRule[], onSaveRule: (rule: MockRule) => Promise<void>, onDeleteRule: (id: string) => Promise<void>): Promise<void> {
  if (draft.type === 'create') { await onSaveRule({ ...draft.rule, metadata: { ...draft.rule.metadata, updatedAt: Date.now(), source: 'ai' } }); return }
  const rule = rules.find((item) => item.id === draft.ruleId)
  if (!rule) throw new Error(`目标规则已不存在：${draft.ruleId}`)
  if (draft.type === 'delete') { await onDeleteRule(rule.id); return }
  await onSaveRule(applyPatch(rule, draft))
}

function applyPatch(rule: MockRule, draft: Extract<RuleChangeDraft, { type: 'update' }>): MockRule {
  return { ...rule, ...draft.patch, match: draft.patch.match ? { ...rule.match, ...draft.patch.match } : rule.match, response: draft.patch.response ? { ...rule.response, ...draft.patch.response } : rule.response }
}

function draftTitle(draft: RuleChangeDraft, rules: MockRule[]): string {
  if (draft.type === 'create') return `${draft.rule.match.methods.join(', ')} ${draft.rule.match.url}`
  return rules.find((rule) => rule.id === draft.ruleId)?.name ?? draft.ruleId
}

function normalizeDrafts(value: unknown): RuleChangeDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<RuleChangeDraft> & { ruleId?: unknown; reason?: unknown; patch?: unknown }
    if (candidate.type === 'create' || candidate.type === 'update' || candidate.type === 'delete') return typeof candidate.id === 'string' ? [candidate as RuleChangeDraft] : []
    if (typeof candidate.ruleId === 'string' && typeof candidate.reason === 'string' && candidate.patch && typeof candidate.patch === 'object') return [{ type: 'update', id: `legacy-${index}-${candidate.ruleId}`, ruleId: candidate.ruleId, reason: candidate.reason, patch: candidate.patch as Extract<RuleChangeDraft, { type: 'update' }>['patch'] }]
    return []
  })
}

function findReferences(text: string, rules: MockRule[], folders: Folder[]) {
  return [...rules.map((rule) => ({ type: 'rule' as const, id: rule.id, label: rule.name })), ...folders.map((folder) => ({ type: 'folder' as const, id: folder.id, label: folder.name }))].filter((item) => text.includes(`@${item.label}`))
}
 
function getConversationTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.replace(/\s+/g, ' ').trim()
  if (!firstUserMessage) return '新对话'
  return firstUserMessage.length > 24 ? `${firstUserMessage.slice(0, 24)}…` : firstUserMessage
}

function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt)
}

function formatUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(updatedAt)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function getTrafficForTools(): Promise<import('../../core/models').TrafficEntry[]> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_TRAFFIC' } satisfies RuntimeMessage) as RuntimeResponse
  return response.ok && 'traffic' in response ? response.traffic : []
}

async function getPageContextForTools(): Promise<import('../../shared/messages').PageContext | undefined> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' } satisfies RuntimeMessage) as RuntimeResponse
  return response.ok && 'page' in response ? response.page : undefined
}
