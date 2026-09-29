import type { BodyType, FileAssetReference } from './rule'

export type TrafficBodyType = BodyType | 'file'

export type TrafficResponse = {
  bodyType: TrafficBodyType
  body: unknown
  headers: Record<string, string>
  file?: FileAssetReference
}

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
