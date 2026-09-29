import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatConfig, ChatConversation, ChatMessage, Folder, MockRule, RuleChangeDraft } from '../../core/models'
import { appRepository, CHAT_HISTORY_SYNC_KEY } from '../../core/storage/app-repository'
import { createId } from '../../shared/ids'
import type { RuntimeMessage, RuntimeResponse } from '../../shared/messages'
import { IconButton } from '../components/icon-button'
import { askModel, type ToolActivity } from './model-client'
import { createPendingAttachment, MAX_ATTACHMENTS, parseAttachment, type PendingAttachment, type RuntimeAttachment } from './file-parser'
import { getMentionQuery, searchMentions } from './mention-search'
import { ChatComposer } from './chat-composer'
import { DraftPreview } from './chat-drafts'
import { ChatHistory } from './chat-history'
import { ChatMessages, type ImagePreview } from './chat-messages'
import {
  deleteChatConversation,
  getChatConversations,
  loadChatConversations,
  saveChatConversation,
} from './chat-storage-client'
import {
  findReferences,
  getConversationTitle,
  normalizeDrafts,
  sortConversations,
} from './chat-utils'

type ChatPageProps = {
  rules: MockRule[]
  folders: Folder[]
  onSaveRule: (rule: MockRule) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
}

export function ChatPage({ rules, folders, onSaveRule, onDeleteRule }: ChatPageProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>()
  const [activeTitle, setActiveTitle] = useState('')
  const [historyLimit, setHistoryLimit] = useState(10)
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    historyLimit: 10,
    enablePdfParsing: false,
    enableDocxParsing: false,
    pdfProcessing: 'hybrid',
    pdfTextThreshold: 30,
    pdfMaxVisualPages: 10,
  })
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
  const [imagePreview, setImagePreview] = useState<ImagePreview>()
  const input = useRef<HTMLTextAreaElement>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const historyRoot = useRef<HTMLElement>(null)
  const currentSnapshot = useRef<ChatConversation | undefined>(undefined)
  const conversationsRef = useRef(conversations)
  const [historySyncSource] = useState(() => createId('chat-context'))
  const skipHistoryPersist = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const deletedConversationIds = useRef(new Set<string>())
  const runtimeAttachmentsByMessage = useRef(new Map<string, RuntimeAttachment[]>())
  const query = getMentionQuery(text, cursor)
  const options = useMemo(() => query === undefined ? [] : searchMentions(query, rules, folders), [query, rules, folders])
  conversationsRef.current = conversations

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      loadChatConversations(historySyncSource),
      appRepository.getChatConfig(),
    ]).then(([items, config]) => {
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
    const reloadAfterStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return
      const historyChange = changes[CHAT_HISTORY_SYNC_KEY]
      const historyValue = historyChange?.newValue as { source?: unknown } | undefined
      if (historyChange && historyValue?.source !== historySyncSource) {
        void getChatConversations().then((items) => {
          const sorted = sortConversations(items)
          setConversations(sorted)
          if (!activeConversationId) return
          const active = sorted.find((item) => item.id === activeConversationId)
          if (!active) {
            if (saveTimer.current) window.clearTimeout(saveTimer.current)
            currentSnapshot.current = undefined
            skipHistoryPersist.current = true
            setActiveConversationId(undefined); setActiveTitle(''); setMessages([]); setDrafts([]); setText('')
            return
          }
          if (sending || active.updatedAt <= (currentSnapshot.current?.updatedAt ?? 0)) return
          if (saveTimer.current) window.clearTimeout(saveTimer.current)
          currentSnapshot.current = active
          skipHistoryPersist.current = true
          setActiveTitle(active.title); setMessages(active.messages); setDrafts(normalizeDrafts(active.drafts)); setToolActivities([])
        })
      }
      if (!changes.chatConfig) return
      void Promise.all([
        getChatConversations(),
        appRepository.getChatConfig(),
      ]).then(([items, config]) => {
        const sorted = sortConversations(items)
        setConversations(sorted); setHistoryLimit(config.historyLimit); setChatConfig(config)
        if (activeConversationId && !sorted.some((item) => item.id === activeConversationId)) {
          currentSnapshot.current = undefined
          setActiveConversationId(undefined); setActiveTitle(''); setMessages([]); setDrafts([]); setText('')
        }
      })
    }
    chrome.storage.onChanged.addListener(reloadAfterStorageChange)
    return () => chrome.storage.onChanged.removeListener(reloadAfterStorageChange)
  }, [activeConversationId, sending])

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
    if (skipHistoryPersist.current) {
      skipHistoryPersist.current = false
      return
    }
    if (!historyReady || !activeConversationId) {
      currentSnapshot.current = undefined
      return
    }
    const existing = conversationsRef.current.find((item) => item.id === activeConversationId)
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
  }, [historyReady, activeConversationId, activeTitle, drafts, historyLimit, messages])

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const snapshot = currentSnapshot.current
    if (snapshot && !deletedConversationIds.current.has(snapshot.id)) {
      void saveChatConversation(snapshot, historyLimit, historySyncSource)
    }
  }, [historyLimit])

  async function persistConversation(conversation: ChatConversation): Promise<void> {
    if (deletedConversationIds.current.has(conversation.id)) return
    const expired = await saveChatConversation(conversation, historyLimit, historySyncSource)
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
    const user: ChatMessage = {
      id: createId('chat'),
      role: 'user',
      content: text.trim() || '请分析附件中的接口定义，并提出 Mock 规则建议。',
      references,
      attachments: readyAttachments.map((attachment) => attachment.metadata),
      createdAt: Date.now(),
    }
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
    setActiveConversationId(undefined)
    setActiveTitle('')
    setMessages([])
    setDrafts([])
    setToolActivities([])
    setText('')
    setCursor(0)
    setConfirmDeleteId(undefined)
    setRenamingId(undefined)
    setHistoryPopoverOpen(false)
    setPendingAttachments([])
    setAttachmentNotice('')
    requestAnimationFrame(() => input.current?.focus())
  }

  function selectConversation(conversation: ChatConversation): void {
    if (conversation.id === activeConversationId || sending) return
    flushCurrentConversation()
    setActiveConversationId(conversation.id)
    setActiveTitle(conversation.title)
    setMessages(conversation.messages)
    setDrafts(normalizeDrafts(conversation.drafts))
    setText('')
    setCursor(0)
    setConfirmDeleteId(undefined)
    setRenamingId(undefined)
    setHistoryPopoverOpen(false)
    setPendingAttachments([])
    setAttachmentNotice('')
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
    await deleteChatConversation(conversation.id, historySyncSource)
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

  return <section className="panel chat">
    <div className="chat__heading">
      <div>
        <h2 className="panel__title">AI 助手</h2>
        <p className="muted">
          输入 @ 可引用已有规则或文件夹。AI 可生成待确认的 Mock 操作，确认后才会修改规则。
        </p>
      </div>
      <IconButton
        icon="plus"
        label="新建对话"
        disabled={sending}
        onClick={startNewConversation}
      />
    </div>
    <div className="chat__layout" data-history-collapsed={historyCollapsed}>
      <ChatHistory
        rootRef={historyRoot}
        conversations={conversations}
        activeConversationId={activeConversationId}
        historyPopoverOpen={historyPopoverOpen}
        renamingId={renamingId}
        renamingTitle={renamingTitle}
        confirmDeleteId={confirmDeleteId}
        sending={sending}
        onSelect={selectConversation}
        onBeginRename={beginRename}
        onRenameTitleChange={setRenamingTitle}
        onCommitRename={commitRename}
        onCancelRename={() => setRenamingId(undefined)}
        onRequestDelete={(conversation) => void requestDeleteConversation(conversation)}
        onCollapse={() => {
          setHistoryCollapsed(true)
          setHistoryPopoverOpen(false)
        }}
        onExpand={() => {
          setHistoryCollapsed(false)
          setHistoryPopoverOpen(false)
        }}
        onTogglePopover={() => setHistoryPopoverOpen((value) => !value)}
      />
      <div className="chat__main">
        <ChatMessages
          messages={messages}
          pendingAssistantId={pendingAssistantId}
          copiedMessageId={copiedMessageId}
          sending={sending}
          toolActivities={toolActivities}
          runtimeAttachmentsByMessage={runtimeAttachmentsByMessage.current}
          messagesEndRef={messagesEnd}
          onCopy={(message) => void copyMessage(message)}
          onEdit={editMessage}
          onPreview={setImagePreview}
        />
        {drafts.length > 0 && <DraftPreview
          drafts={drafts}
          rules={rules}
          onApply={async (draft) => {
            await applyDraft(draft, rules, onSaveRule, onDeleteRule)
            setDrafts((items) => items.filter((item) => item.id !== draft.id))
          }}
          onDiscard={(id) => setDrafts((items) => items.filter((item) => item.id !== id))}
          onDiscardAll={() => setDrafts([])}
        />}
        <ChatComposer
          inputRef={input}
          text={text}
          cursor={cursor}
          activeMention={active}
          mentionOptions={options}
          pendingAttachments={pendingAttachments}
          attachmentNotice={attachmentNotice}
          sending={sending}
          onTextChange={(value, nextCursor) => {
            setText(value)
            setCursor(nextCursor)
            setActive(0)
          }}
          onCursorChange={setCursor}
          onActiveMentionChange={setActive}
          onInsertMention={insertMention}
          onAddAttachments={(files) => void addAttachments(files)}
          onRemoveAttachment={removeAttachment}
          onPreviewImage={setImagePreview}
          onSubmit={() => void submit()}
        />
      </div>
    </div>
    {imagePreview && <div
      className="chat__image-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`${imagePreview.name} 预览`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setImagePreview(undefined)
      }}
    >
      <button
        type="button"
        className="chat__image-preview-close"
        aria-label="关闭图片预览"
        onClick={() => setImagePreview(undefined)}
      >×</button>
      <img src={imagePreview.url} alt={imagePreview.name} />
    </div>}
  </section>
}

async function applyDraft(draft: RuleChangeDraft, rules: MockRule[], onSaveRule: (rule: MockRule) => Promise<void>, onDeleteRule: (id: string) => Promise<void>): Promise<void> {
  if (draft.type === 'create') { await onSaveRule({ ...draft.rule, metadata: { ...draft.rule.metadata, updatedAt: Date.now(), source: 'ai' } }); return }
  const rule = rules.find((item) => item.id === draft.ruleId)
  if (!rule) throw new Error(`目标规则已不存在：${draft.ruleId}`)
  if (draft.type === 'delete') { await onDeleteRule(rule.id); return }
  await onSaveRule(applyPatch(rule, draft))
}

function applyPatch(rule: MockRule, draft: Extract<RuleChangeDraft, { type: 'update' }>): MockRule {
  return {
    ...rule,
    ...draft.patch,
    match: draft.patch.match
      ? { ...rule.match, ...draft.patch.match }
      : rule.match,
    response: draft.patch.response
      ? { ...rule.response, ...draft.patch.response }
      : rule.response,
  }
}

async function getTrafficForTools(): Promise<import('../../core/models').TrafficEntry[]> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_TRAFFIC' } satisfies RuntimeMessage) as RuntimeResponse
  return response.ok && 'traffic' in response ? response.traffic : []
}

async function getPageContextForTools(): Promise<import('../../shared/messages').PageContext | undefined> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' } satisfies RuntimeMessage) as RuntimeResponse
  return response.ok && 'page' in response ? response.page : undefined
}
