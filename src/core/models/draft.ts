import type { MockRule } from './rule'

export type CreateRuleDraft = {
  type: 'create'
  id: string
  reason: string
  rule: MockRule
}

export type UpdateRuleDraft = {
  type: 'update'
  id: string
  ruleId: string
  reason: string
  patch: {
    name?: string
    folderId?: string | null
    enabled?: boolean
    priority?: number
    match?: Partial<MockRule['match']>
    requestRewrite?: MockRule['requestRewrite']
    response?: Partial<MockRule['response']>
  }
}

export type DeleteRuleDraft = {
  type: 'delete'
  id: string
  ruleId: string
  reason: string
}

export type RuleChangeDraft = CreateRuleDraft | UpdateRuleDraft | DeleteRuleDraft

export type AssistantResult = {
  reply: string
  actions: RuleChangeDraft[]
}
