import type { Folder, MockRule } from '../models'
import type { MockDecision, PageRequest } from '../../shared/messages'
import { appRepository } from '../storage/app-repository'
import { isRuleActive } from './folder-state'
import { matchesRule, sortByMatchPriority } from './rule-match'

export async function decideRequest(request: PageRequest): Promise<MockDecision> {
  const [rules, folders] = await Promise.all([appRepository.listRules(), appRepository.listFolders()])
  const candidates = rules.filter((rule) => isRuleActive(rule, folders) && matchesRule(rule, request))
  const selected = sortByMatchPriority(candidates)[0]
  if (!selected) return { matched: false }
  return {
    matched: true,
    ruleId: selected.id,
    requestHeaders: selected.requestRewrite?.enabled ? selected.requestRewrite.headers : undefined,
    response: selected.response,
  }
}

export function createRuleFromDraft(draft: Omit<MockRule, 'id' | 'metadata'>, id: string): MockRule {
  const now = Date.now()
  return { ...draft, id, metadata: { createdAt: now, updatedAt: now, source: 'manual' } }
}

export function getRuleState(rule: MockRule, folders: Folder[]): 'active' | 'inactive' {
  return isRuleActive(rule, folders) ? 'active' : 'inactive'
}
