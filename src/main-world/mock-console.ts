import { fileContentDisposition } from '../shared/file-response'
import type { MockDecision, PageRequest } from '../shared/messages'

export function logMockedRequest(request: PageRequest, decision: MockDecision): void {
  const response = decision.response
  if (!response) return

  let groupOpened = false
  try {
    const label = `[Mock Forge] Mocked ${request.method} ${request.url} → ${response.status}`
    console.groupCollapsed(label)
    groupOpened = true
    console.log('Request', {
      id: request.id,
      source: request.source,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    })
    console.log('Mock rule', {
      id: decision.ruleId,
      name: decision.ruleName,
      delayMs: response.delayMs,
    })
    console.log('Response', {
      status: response.status,
      headers: responseHeaders(decision),
      body: responseBody(decision),
    })
  } catch {
    // Console logging must never interfere with a mocked request.
  } finally {
    if (groupOpened) {
      try {
        console.groupEnd()
      } catch {
        // Ignore console errors from the page context.
      }
    }
  }
}

function responseHeaders(decision: MockDecision): Record<string, string> {
  const response = decision.response!
  const headers = response.headersEnabled ? { ...response.headers } : {}
  if (response.bodyType === 'json' && !hasHeader(headers, 'content-type')) {
    headers['content-type'] = 'application/json'
  }
  if (response.bodyType === 'file') {
    const file = response.resolvedFile ?? response.file
    if (!file) return headers
    if (!hasHeader(headers, 'content-type')) headers['content-type'] = file.mimeType
    if (!hasHeader(headers, 'content-disposition')) {
      headers['content-disposition'] = fileContentDisposition(file.name)
    }
  }
  return headers
}

function responseBody(decision: MockDecision): unknown {
  const response = decision.response!
  if ([204, 205, 304].includes(response.status)) return null
  if (response.bodyType === 'file') {
    if (response.file) {
      return {
        fileName: response.file.name,
        mimeType: response.file.mimeType,
        size: response.file.size,
      }
    }
    const file = response.resolvedFile
    return file ? { fileName: file.name, mimeType: file.mimeType } : null
  }
  if (response.bodyType === 'empty') return null
  if (response.bodyType === 'text') return String(response.body ?? '')
  return response.body
}

function hasHeader(headers: Record<string, string>, target: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === target)
}
