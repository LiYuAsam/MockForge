import type { Folder, MockRule, TrafficEntry, TrafficResponse } from '../core/models'

export type WorkspaceSnapshot = { folders: Folder[]; rules: MockRule[] }

export type PageContext = { tabId: number; url: string; title: string }

export type PageRequest = {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  source: 'fetch' | 'xhr'
}

export type MockDecision = {
  matched: boolean
  ruleId?: string
  requestHeaders?: Record<string, string>
  response?: MockRule['response']
}

export type RuntimeMessage =
  | { type: 'MATCH_REQUEST'; payload: PageRequest }
  | { type: 'GET_WORKSPACE' }
  | { type: 'SAVE_FOLDER'; payload: Folder }
  | { type: 'SAVE_RULE'; payload: MockRule }
  | { type: 'SAVE_RULE_ORDER'; payload: MockRule[] }
  | { type: 'DELETE_FOLDER'; payload: { id: string } }
  | { type: 'DELETE_RULE'; payload: { id: string } }
  | { type: 'IMPORT_WORKSPACE'; payload: WorkspaceSnapshot }
  | { type: 'SAVE_TRAFFIC_RESPONSE'; payload: { id: string; response: TrafficResponse; status?: number } }
  | { type: 'GET_TRAFFIC'; tabId?: number }
  | { type: 'GET_PAGE_CONTEXT' }
  | { type: 'CLEAR_TRAFFIC'; tabId?: number }
  | { type: 'OPEN_WORKSPACE' }
  | { type: 'OPEN_SIDE_PANEL'; tabId?: number }

export type RuntimeResponse =
  | { ok: true; decision: MockDecision }
  | { ok: true; workspace: WorkspaceSnapshot }
  | { ok: true; traffic: TrafficEntry[] }
  | { ok: true; page?: PageContext }
  | { ok: true }
  | { ok: false; error: string }
