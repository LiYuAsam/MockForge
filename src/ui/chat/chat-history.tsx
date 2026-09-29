import type { FormEvent, Ref } from 'react'
import type { ChatConversation } from '../../core/models'
import { IconButton } from '../components/icon-button'
import { formatUpdatedAt } from './chat-utils'

type ChatHistoryProps = {
  conversations: ChatConversation[]
  activeConversationId?: string
  historyPopoverOpen: boolean
  renamingId?: string
  renamingTitle: string
  confirmDeleteId?: string
  sending: boolean
  rootRef: Ref<HTMLElement>
  onSelect: (conversation: ChatConversation) => void
  onBeginRename: (conversation: ChatConversation) => void
  onRenameTitleChange: (title: string) => void
  onCommitRename: (conversation: ChatConversation) => void
  onCancelRename: () => void
  onRequestDelete: (conversation: ChatConversation) => void
  onCollapse: () => void
  onExpand: () => void
  onTogglePopover: () => void
}

export function ChatHistory({
  conversations,
  activeConversationId,
  historyPopoverOpen,
  renamingId,
  renamingTitle,
  confirmDeleteId,
  sending,
  rootRef,
  onSelect,
  onBeginRename,
  onRenameTitleChange,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onCollapse,
  onExpand,
  onTogglePopover,
}: ChatHistoryProps) {
  function renderHistoryList(className: string) {
    return <div className={className}>
      {!conversations.length && <div className="chat__history-empty">暂无历史对话</div>}
      {conversations.map((conversation) => <div
        className={`chat__history-item${conversation.id === activeConversationId ? ' chat__history-item--active' : ''}`}
        key={conversation.id}
      >
        {renamingId === conversation.id
          ? <form
              className="chat__history-rename"
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                onCommitRename(conversation)
              }}
            >
              <input
                autoFocus
                value={renamingTitle}
                aria-label="对话标题"
                onChange={(event) => onRenameTitleChange(event.target.value)}
                onBlur={() => onCommitRename(conversation)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onCancelRename()
                }}
              />
            </form>
          : <button
              className="chat__history-select"
              aria-current={conversation.id === activeConversationId ? 'page' : undefined}
              onClick={() => onSelect(conversation)}
            >
              <span>{conversation.title}</span>
              <small>{formatUpdatedAt(conversation.updatedAt)}</small>
            </button>}
        <div className="chat__history-actions">
          <button
            type="button"
            title="修改标题"
            aria-label="修改标题"
            disabled={sending}
            onClick={() => onBeginRename(conversation)}
          >编辑</button>
          <button
            type="button"
            className={confirmDeleteId === conversation.id
              ? 'chat__history-delete chat__history-delete--confirm'
              : 'chat__history-delete'}
            disabled={sending}
            onClick={() => onRequestDelete(conversation)}
          >{confirmDeleteId === conversation.id ? '确认' : '删除'}</button>
        </div>
      </div>)}
    </div>
  }

  return <aside
    ref={rootRef}
    className="chat__history"
    aria-label="历史对话"
  >
    <div className="chat__history-toolbar">
      <span className="chat__history-title">历史对话</span>
      <IconButton
        className="chat__history-collapse"
        icon="panelLeft"
        label="收起历史对话"
        onClick={onCollapse}
      />
      <IconButton
        className="chat__history-expand"
        icon="panelRight"
        label="展开历史对话"
        onClick={onExpand}
      />
      <IconButton
        className="chat__history-trigger"
        icon="history"
        label="打开历史对话"
        aria-expanded={historyPopoverOpen}
        onClick={onTogglePopover}
      />
    </div>
    <div className="chat__history-content">
      {renderHistoryList('chat__history-list')}
    </div>
    {historyPopoverOpen && <div className="chat__history-popover">
      {renderHistoryList('chat__history-list chat__history-list--popover')}
    </div>}
  </aside>
}
