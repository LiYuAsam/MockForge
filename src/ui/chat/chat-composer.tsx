import { useRef, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react'
import type { ChatReference } from '../../core/models/chat'
import { IconButton } from '../components/icon-button'
import { formatBytes } from './chat-utils'
import type { PendingAttachment } from './file-parser'

type ChatComposerProps = {
  inputRef: Ref<HTMLTextAreaElement>
  text: string
  cursor: number
  activeMention: number
  mentionOptions: ChatReference[]
  pendingAttachments: PendingAttachment[]
  attachmentNotice: string
  sending: boolean
  onTextChange: (value: string, cursor: number) => void
  onCursorChange: (cursor: number) => void
  onActiveMentionChange: (index: number) => void
  onInsertMention: (index: number) => void
  onAddAttachments: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onPreviewImage: (image: { url: string; name: string }) => void
  onSubmit: () => void
}

export function ChatComposer({
  inputRef,
  text,
  cursor,
  activeMention,
  mentionOptions,
  pendingAttachments,
  attachmentNotice,
  sending,
  onTextChange,
  onCursorChange,
  onActiveMentionChange,
  onInsertMention,
  onAddAttachments,
  onRemoveAttachment,
  onPreviewImage,
  onSubmit,
}: ChatComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const isPreparingAttachment = pendingAttachments.some(
    (attachment) => attachment.status === 'preparing',
  )
  const hasReadyAttachment = pendingAttachments.some(
    (attachment) => attachment.status === 'ready',
  )

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (mentionOptions.length && event.key === 'ArrowDown') {
      event.preventDefault()
      onActiveMentionChange(Math.min(activeMention + 1, mentionOptions.length - 1))
    } else if (mentionOptions.length && event.key === 'ArrowUp') {
      event.preventDefault()
      onActiveMentionChange(Math.max(activeMention - 1, 0))
    } else if (mentionOptions.length && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onInsertMention(activeMention)
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const images = [...event.clipboardData.items]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (!images.length) return
    if (!event.clipboardData.getData('text/plain')) event.preventDefault()
    onAddAttachments(images)
  }

  return <div
    className="chat__composer"
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault()
      onAddAttachments([...event.dataTransfer.files])
    }}
  >
    {mentionOptions.length > 0 && <div className="mention-menu">
      {mentionOptions.map((option, index) => <button
        key={`${option.type}-${option.id}`}
        data-active={index === activeMention}
        onMouseDown={(event) => {
          event.preventDefault()
          onInsertMention(index)
        }}
      >
        <strong>@{option.label}</strong>
        {' '}<span className="muted">
          {option.type === 'rule' ? '接口规则' : '文件夹'}
        </span>
      </button>)}
    </div>}
    <input
      ref={fileInput}
      className="chat__file-input"
      type="file"
      multiple
      accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.txt,.md,.markdown,.json,.yaml,.yml,.csv"
      onChange={(event) => {
        const files = [...(event.currentTarget.files ?? [])]
        event.currentTarget.value = ''
        onAddAttachments(files)
      }}
    />
    {pendingAttachments.length > 0 && <div className="chat__attachments">
      {pendingAttachments.map((attachment) => {
        const imageUrl = attachment.runtime?.imageDataUrls[0]
        return <div
          className={`chat__attachment chat__attachment--${attachment.status}`}
          key={attachment.metadata.id}
        >
          {attachment.metadata.kind === 'image' && imageUrl
            ? <button
                type="button"
                className="chat__thumbnail-button"
                aria-label={`放大查看 ${attachment.metadata.name}`}
                onClick={() => onPreviewImage({ url: imageUrl, name: attachment.metadata.name })}
              >
                <img
                  className="chat__attachment-preview"
                  src={imageUrl}
                  alt={`${attachment.metadata.name} 缩略图`}
                />
              </button>
            : null}
          <span>
            {attachment.metadata.kind === 'image' ? '图片' : '文档'}
            {' · '}{attachment.metadata.name}
          </span>
          <small>{attachment.status === 'preparing'
            ? '正在处理…'
            : attachment.status === 'error'
              ? attachment.error
              : formatBytes(attachment.metadata.size)}</small>
          <button
            type="button"
            onClick={() => onRemoveAttachment(attachment.metadata.id)}
            aria-label={`移除 ${attachment.metadata.name}`}
          >×</button>
        </div>
      })}
    </div>}
    {attachmentNotice && <div className="chat__attachment-notice">{attachmentNotice}</div>}
    <textarea
      ref={inputRef}
      value={text}
      aria-label="AI 助手输入框"
      placeholder="描述要调整的 Mock 数据，输入 @ 引用规则或文件夹，也可直接粘贴图片"
      onChange={(event) => onTextChange(
        event.target.value,
        event.currentTarget.selectionStart,
      )}
      onClick={(event) => onCursorChange(event.currentTarget.selectionStart)}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
    />
    <div className="chat__composer-footer">
      <span className="muted">Ctrl / Cmd + Enter 发送</span>
      <div className="row">
        <IconButton
          icon="attachment"
          label="添加附件"
          disabled={sending}
          onClick={() => fileInput.current?.click()}
        />
        <button
          className="button"
          disabled={sending || isPreparingAttachment || (!text.trim() && !hasReadyAttachment)}
          onClick={onSubmit}
        >{sending ? '思考中…' : '发送'}</button>
      </div>
    </div>
  </div>
}
