import type { PageRequest } from '../shared/messages'
import { appRepository } from '../core/storage/app-repository'
import type { MockDecision } from '../shared/messages'
import type { TrafficResponse } from '../core/models'

export async function recordTraffic(
  request: PageRequest,
  decision: 'mocked' | 'passed' | 'error',
  mockDecision?: MockDecision,
  tabId?: number,
): Promise<void> {
  await appRepository.saveTraffic({
    id: request.id,
    tabId,
    url: request.url,
    method: request.method,
    startedAt: Date.now(),
    source: request.source,
    decision,
    matchedRuleId: mockDecision?.ruleId,
    status: mockDecision?.response?.status,
    response: toTrafficResponse(mockDecision?.response),
    requestHeaders: request.headers,
    requestBody: request.body,
  })
}

export function saveTrafficResponse(id: string, response: TrafficResponse, status?: number): Promise<void> {
  return appRepository.saveTrafficResponse(id, response, status)
}

function toTrafficResponse(response: MockDecision['response']): TrafficResponse | undefined {
  if (!response) return undefined
  const headers = response.headersEnabled ? { ...response.headers } : {}
  if (response.bodyType === 'json' && !hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json'
  return { bodyType: response.bodyType, body: response.body, headers }
}

function hasHeader(headers: Record<string, string>, target: string): boolean {
  return Object.keys(headers).some((header) => header.toLowerCase() === target.toLowerCase())
}
