import type { Ref } from 'react'
import type { ChatMessage } from '../../core/models'
import type { RuntimeAttachment } from './file-parser'
import type { ToolActivity } from './model-client'
import { formatBytes, toolActivityLabel } from './chat-utils'

type ImagePreview = { url: string; name: string }

type ChatMessagesProps = {
  messages: ChatMessage[]
  pendingAssistantId?: string
  copiedMessageId?: string
  sending: boolean
  toolActivities: ToolActivity[]
  runtimeAttachmentsByMessage: Map<string, RuntimeAttachment[]>
  messagesEndRef: Ref<HTMLDivElement>
  onCopy: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onPreview: (preview: ImagePreview) => void
}

export function ChatMessages({
  messages,
  pendingAssistantId,
  copiedMessageId,
  sending,
  toolActivities,
  runtimeAttachmentsByMessage,
  messagesEndRef,
  onCopy,
  onEdit,
  onPreview,
}: ChatMessagesProps) {
  return <div className="chat__messages" aria-live="polite">
    {messages.map((message) => <article
      key={message.id}
      className={`chat__message chat__message--${message.role}`}
    >
      <div className="chat__message-actions">
        <button type="button" onClick={() => onCopy(message)}>
          {copiedMessageId === message.id ? '已复制' : '复制'}
        </button>
        {message.role === 'user' && <button
          type="button"
          disabled={sending}
          onClick={() => onEdit(message)}
        >编辑</button>}
      </div>
      {message.id === pendingAssistantId && !message.content
        ? <span className="chat__thinking"><i /><i /><i />AI 正在思考</span>
        : message.content}
      {message.attachments?.length ? <div className="chat__message-attachments">
        {message.attachments.map((attachment) => {
          const runtime = runtimeAttachmentsByMessage
            .get(message.id)
            ?.find((item) => item.metadata.id === attachment.id)
          const imageUrl = runtime?.imageDataUrls[0]

          return <span
            key={attachment.id}
            title={`${attachment.type || '未知类型'} · ${formatBytes(attachment.size)}`}
          >
            {attachment.kind === 'image' && imageUrl
              ? <button
                  type="button"
                  className="chat__thumbnail-button"
                  aria-label={`放大查看 ${attachment.name}`}
                  onClick={() => onPreview({ url: imageUrl, name: attachment.name })}
                >
                  <img src={imageUrl} alt="" />
                </button>
              : '📎'} {attachment.name}
          </span>
        })}
      </div> : null}
    </article>)}
    {toolActivities.length > 0 && <ToolActivityList activities={toolActivities} />}
    {!messages.length && <div className="empty">
      例如：把 @用户列表 的返回数据改为 20 条随机用户。
    </div>}
    <div ref={messagesEndRef} />
  </div>
}

function ToolActivityList({ activities }: { activities: ToolActivity[] }) {
  return <div className="chat__tool-activities" aria-label="本轮工具调用">
    {activities.map((activity) => <span
      key={activity.id}
      className={`chat__tool-activity chat__tool-activity--${activity.status}`}
    >
      {activity.status === 'running' ? '…' : activity.status === 'success' ? '✓' : '!'}
      {' '}{toolActivityLabel(activity.name)}
    </span>)}
  </div>
}

export type { ImagePreview }
