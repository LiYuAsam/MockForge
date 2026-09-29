import type { Folder, MockRule } from '../models'
import type { MockDecision, PageRequest, ResolvedMockFile } from '../../shared/messages'
import { appRepository } from '../storage/app-repository'
import { isRuleActive } from './folder-state'
import { matchesRule, sortByMatchPriority } from './rule-match'
import { encodeBlob } from '../../shared/base64'

export async function decideRequest(request: PageRequest): Promise<MockDecision> {
  const [rules, folders] = await Promise.all([appRepository.listRules(), appRepository.listFolders()])
  const candidates = rules.filter((rule) => isRuleActive(rule, folders) && matchesRule(rule, request))
  const selected = sortByMatchPriority(candidates)[0]
  if (!selected) return { matched: false }
  let resolvedFile: ResolvedMockFile | undefined
  if (selected.response.bodyType === 'file') {
    const assetId = selected.response.file?.id
    const asset = assetId ? await appRepository.getFileAsset(assetId) : undefined
    if (!asset) return { matched: false }
    resolvedFile = {
      name: asset.name,
      mimeType: asset.mimeType,
      base64: await encodeBlob(asset.blob),
    }
  }
  return {
    matched: true,
    ruleId: selected.id,
    ruleName: selected.name,
    requestHeaders: selected.requestRewrite?.enabled ? selected.requestRewrite.headers : undefined,
    response: { ...selected.response, ...(resolvedFile ? { resolvedFile } : {}) },
  }
}

export function createRuleFromDraft(draft: Omit<MockRule, 'id' | 'metadata'>, id: string): MockRule {
  const now = Date.now()
  return { ...draft, id, metadata: { createdAt: now, updatedAt: now, source: 'manual' } }
}

export function getRuleState(rule: MockRule, folders: Folder[]): 'active' | 'inactive' {
  return isRuleActive(rule, folders) ? 'active' : 'inactive'
}
