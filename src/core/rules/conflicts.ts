import type { MockRule } from '../models'
import { matchesUrl } from './url-match'

export type ConflictLevel = 'duplicate' | 'overlap'
export type RuleConflict = { ruleId: string; otherRuleId: string; level: ConflictLevel }

export function findConflicts(rules: MockRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = []
  for (let index = 0; index < rules.length; index += 1) {
    for (let next = index + 1; next < rules.length; next += 1) {
      const left = rules[index]
      const right = rules[next]
      if (!sharesMethod(left, right)) continue
      const level = compareScope(left, right)
      if (level) conflicts.push({ ruleId: left.id, otherRuleId: right.id, level })
    }
  }
  return conflicts
}

function sharesMethod(left: MockRule, right: MockRule): boolean {
  return left.match.methods.some((method) => right.match.methods.includes(method))
}

function compareScope(left: MockRule, right: MockRule): ConflictLevel | undefined {
  const same = left.match.url === right.match.url && left.match.urlMode === right.match.urlMode
  const sameConditions = JSON.stringify(left.match.query ?? {}) === JSON.stringify(right.match.query ?? {})
    && JSON.stringify(left.match.requestHeaders ?? {}) === JSON.stringify(right.match.requestHeaders ?? {})
    && left.match.requestBodyMatcher === right.match.requestBodyMatcher
  if (same && sameConditions) return 'duplicate'

  const mayOverlap = matchesUrl(left.match.url, right.match.url, right.match.urlMode)
    || matchesUrl(right.match.url, left.match.url, left.match.urlMode)
    || left.match.urlMode === 'regex'
    || right.match.urlMode === 'regex'
  return mayOverlap ? 'overlap' : undefined
}
