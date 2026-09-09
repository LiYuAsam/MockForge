import type { MockRule } from '../models'
import type { PageRequest } from '../../shared/messages'
import { matchesUrl, specificity } from './url-match'

export function matchesRule(rule: MockRule, request: PageRequest): boolean {
  if (!rule.enabled || !rule.match.methods.includes(request.method.toUpperCase())) return false
  if (!matchesUrl(request.url, rule.match.url, rule.match.urlMode)) return false
  if (!containsValues(request.headers, rule.match.requestHeaders)) return false
  if (rule.match.requestBodyMatcher && !matchesRequestBody(request.body, rule.match.requestBodyMatcher)) return false
  return queryMatches(request.url, rule.match.query)
}

export function sortByMatchPriority(rules: MockRule[]): MockRule[] {
  return [...rules].sort((left, right) => {
    const specificityGap = specificity(right.match.urlMode) - specificity(left.match.urlMode)
    if (specificityGap !== 0) return specificityGap
    if (right.priority !== left.priority) return right.priority - left.priority
    return right.metadata.updatedAt - left.metadata.updatedAt
  })
}

function containsValues(actual: Record<string, string>, expected?: Record<string, string>): boolean {
  return Object.entries(expected ?? {}).every(([key, value]) => actual[key.toLowerCase()] === value)
}

function queryMatches(url: string, expected?: Record<string, string>): boolean {
  if (!expected) return true
  try {
    const query = new URL(url).searchParams
    return Object.entries(expected).every(([key, value]) => query.get(key) === value)
  } catch {
    return false
  }
}

function matchesRequestBody(actual: string | undefined, expected: string): boolean {
  if (!actual) return false
  try { return containsJson(JSON.parse(actual), JSON.parse(expected)) } catch { return actual.includes(expected) }
}

function containsJson(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((value, index) => containsJson(actual[index], value))
  if (expected && typeof expected === 'object') return Boolean(actual) && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(expected).every(([key, value]) => containsJson((actual as Record<string, unknown>)[key], value))
  return Object.is(actual, expected)
}
