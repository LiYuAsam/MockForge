import type { MockRule } from './rule'

export type TrafficResponse = Pick<MockRule['response'], 'bodyType' | 'body' | 'headers'>

export type TrafficEntry = {
  id: string
  tabId?: number
  url: string
  method: string
  status?: number
  requestHeaders?: Record<string, string>
  requestBody?: string
  startedAt: number
  durationMs?: number
  source: 'fetch' | 'xhr'
  matchedRuleId?: string
  response?: TrafficResponse
  decision: 'mocked' | 'passed' | 'error'
}
