import { useState } from 'react'
import type { MockRule, RuleChangeDraft } from '../../core/models'
import { IconButton } from '../components/icon-button'
import { draftTitle } from './chat-utils'

type DraftPreviewProps = {
  drafts: RuleChangeDraft[]
  rules: MockRule[]
  onApply: (draft: RuleChangeDraft) => Promise<void>
  onDiscard: (id: string) => void
  onDiscardAll: () => void
}

export function DraftPreview({
  drafts,
  rules,
  onApply,
  onDiscard,
  onDiscardAll,
}: DraftPreviewProps) {
  const [savingId, setSavingId] = useState<string>()
  const [error, setError] = useState('')

  async function applyOne(draft: RuleChangeDraft): Promise<void> {
    setError('')
    setSavingId(draft.id)
    try {
      await onApply(draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '应用操作失败')
    } finally {
      setSavingId(undefined)
    }
  }

  async function applyAll(): Promise<void> {
    setError('')
    for (const draft of drafts) {
      setSavingId(draft.id)
      try {
        await onApply(draft)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '应用操作失败')
        break
      }
    }
    setSavingId(undefined)
  }

  return <div className="list-item list-item--warn ai-actions">
    <strong>待确认的 AI 操作（{drafts.length}）</strong>
    <div className="ai-actions__list">
      {drafts.map((draft) => <div className="ai-actions__item" key={draft.id}>
        <div>
          <span className={`badge ai-actions__type ai-actions__type--${draft.type}`}>
            {draft.type === 'create' ? '新建' : draft.type === 'update' ? '修改' : '删除'}
          </span>
          <strong>{draftTitle(draft, rules)}</strong>
          <p className="muted">{draft.reason}</p>
        </div>
        <div className="row ai-actions__item-actions">
          <IconButton
            icon={savingId === draft.id ? 'refresh' : 'check'}
            label={savingId === draft.id ? '应用中' : '应用此草稿'}
            disabled={Boolean(savingId)}
            onClick={() => void applyOne(draft)}
          />
          <IconButton
            icon="close"
            className="icon-button--danger"
            label="丢弃此草稿"
            disabled={Boolean(savingId)}
            onClick={() => onDiscard(draft.id)}
          />
        </div>
      </div>)}
    </div>
    {error && <p className="ai-actions__error" role="alert">{error}</p>}
    <div className="row" style={{ marginTop: 8 }}>
      <IconButton
        icon={savingId ? 'refresh' : 'check'}
        label={savingId ? '应用中' : '确认全部应用'}
        disabled={Boolean(savingId)}
        onClick={() => void applyAll()}
      />
      <IconButton
        icon="close"
        className="icon-button--danger"
        label="丢弃全部草稿"
        disabled={Boolean(savingId)}
        onClick={onDiscardAll}
      />
    </div>
  </div>
}
