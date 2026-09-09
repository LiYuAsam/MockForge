import type { DragEvent, ReactNode } from 'react'
import type { MockRule } from '../../core/models'
import type { RuleConflict } from '../../core/rules/conflicts'
import { IconButton } from '../components/icon-button'
import { ToggleSwitch } from '../components/toggle-switch'

type RuleListProps = {
  rules: MockRule[]
  conflicts: RuleConflict[]
  selectedId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onCreate: () => Promise<void>
  showCreateOnEmpty?: boolean
  emptyContent?: ReactNode
  title?: string
  headerStart?: ReactNode
  onRuleDragStart?: (rule: MockRule, event: DragEvent<HTMLElement>) => void
  onRuleDrop?: (draggedRuleId: string, targetRuleId: string) => void
  onToggleEnabled: (rule: MockRule, enabled: boolean) => Promise<void>
  headerActions?: ReactNode
}

export function RuleList({ rules, conflicts, selectedId, onSelect, onDelete, onCreate, showCreateOnEmpty = true, emptyContent, title = '规则', headerStart, onRuleDragStart, onRuleDrop, onToggleEnabled, headerActions }: RuleListProps) {
  return <section className="panel">
    <div className="row row--space rule-list__header">{headerStart ?? (title && <h2 className="panel__title">{title}</h2>)}<div className="row rule-list__header-actions">{headerActions}<span className="muted">{rules.length} 条</span></div></div>
    <div className="list">
      {rules.map((rule) => {
        const conflict = conflicts.find((item) => item.ruleId === rule.id || item.otherRuleId === rule.id)
        const className = conflict?.level === 'duplicate' ? 'list-item list-item--danger' : conflict ? 'list-item list-item--warn' : 'list-item'
        return <article key={rule.id} draggable={Boolean(onRuleDragStart)} onDragStart={(event) => onRuleDragStart?.(rule, event)} onDragOver={(event) => { if (onRuleDrop && Array.from(event.dataTransfer.types).includes('application/x-api-mook-item')) event.preventDefault() }} onDrop={(event) => { if (!onRuleDrop) return; event.preventDefault(); const draggedRuleId = readDraggedRuleId(event); if (draggedRuleId) onRuleDrop(draggedRuleId, rule.id) }} className={`${className} rule-card${selectedId === rule.id ? ' list-item--selected' : ''}`}>
          <button aria-expanded={selectedId === rule.id} className="rule-card__select" onClick={() => onSelect(rule.id)}>
            <div className="row row--space"><span className="rule-name" title={rule.name}>{rule.name}</span></div>
            <div className="rule-url" title={rule.match.url}>{rule.match.methods.join(', ')} · {rule.match.url || '未配置 URL'}</div>
            {conflict && <div style={{ marginTop: 5 }}><span className={conflict.level === 'duplicate' ? 'badge badge--danger' : 'badge badge--warn'}>{conflict.level === 'duplicate' ? '明确重复' : '可能冲突'}</span></div>}
          </button>
          <div className="rule-card__actions"><ToggleSwitch checked={rule.enabled} label={rule.enabled ? '启用' : '停用'} onChange={(enabled) => void onToggleEnabled(rule, enabled)} /><IconButton icon="trash" className="rule-card__delete" label={`删除 ${rule.name}`} onClick={() => void onDelete(rule.id)} /></div>
        </article>
      })}
      {!rules.length && <div className="empty">{emptyContent ?? (showCreateOnEmpty && <button className="button" onClick={() => void onCreate()}>创建第一条规则</button>)}</div>}
    </div>
  </section>
}

function readDraggedRuleId(event: DragEvent<HTMLElement>): string | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData('application/x-api-mook-item')) as { type?: string; id?: string }
    return value.type === 'rule' && typeof value.id === 'string' ? value.id : undefined
  } catch {
    return undefined
  }
}
