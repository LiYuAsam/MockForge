import type {
  ChatConversation,
  ChatMessage,
  Folder,
  MockRule,
  RuleChangeDraft,
} from '../../core/models'

export function normalizeDrafts(value: unknown): RuleChangeDraft[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<RuleChangeDraft> & {
      ruleId?: unknown
      reason?: unknown
      patch?: unknown
    }

    if (
      (candidate.type === 'create' || candidate.type === 'update' || candidate.type === 'delete') &&
      typeof candidate.id === 'string'
    ) {
      return [candidate as RuleChangeDraft]
    }

    if (
      typeof candidate.ruleId === 'string' &&
      typeof candidate.reason === 'string' &&
      candidate.patch &&
      typeof candidate.patch === 'object'
    ) {
      return [{
        type: 'update',
        id: `legacy-${index}-${candidate.ruleId}`,
        ruleId: candidate.ruleId,
        reason: candidate.reason,
        patch: candidate.patch as Extract<RuleChangeDraft, { type: 'update' }>['patch'],
      }]
    }

    return []
  })
}

export function findReferences(text: string, rules: MockRule[], folders: Folder[]) {
  const references = [
    ...rules.map((rule) => ({ type: 'rule' as const, id: rule.id, label: rule.name })),
    ...folders.map((folder) => ({ type: 'folder' as const, id: folder.id, label: folder.name })),
  ]
  return references.filter((item) => text.includes(`@${item.label}`))
}

export function getConversationTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages
    .find((message) => message.role === 'user')
    ?.content.replace(/\s+/g, ' ')
    .trim()

  if (!firstUserMessage) return '新对话'
  return firstUserMessage.length > 24
    ? `${firstUserMessage.slice(0, 24)}…`
    : firstUserMessage
}

export function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function formatUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function draftTitle(draft: RuleChangeDraft, rules: MockRule[]): string {
  if (draft.type === 'create') {
    return `${draft.rule.match.methods.join(', ')} ${draft.rule.match.url}`
  }
  return rules.find((rule) => rule.id === draft.ruleId)?.name ?? draft.ruleId
}

export function toolActivityLabel(name: string): string {
  const labels: Record<string, string> = {
    get_current_page_context: '已读取当前页面',
    list_current_page_traffic: '已查询当前页接口',
    list_traffic_apis: '已查询流量接口',
    get_traffic_api_detail: '已读取接口详情',
    list_mock_rules: '已查询 Mock 列表',
    get_mock_rule: '已读取 Mock 详情',
    search_mock_rules: '已检索 Mock 规则',
    create_mock_rule: '已生成 Mock 草稿',
    update_mock_rule: '已生成修改草稿',
    delete_mock_rule: '已生成删除草稿',
  }
  return labels[name] ?? `已调用 ${name}`
}
