import { createId } from '../shared/ids'
import { decodeBlob } from '../shared/base64'
import { fileContentDisposition } from '../shared/file-response'
import type { MockDecision, PageRequest } from '../shared/messages'
import { requestDecision } from './bridge'
import { logMockedRequest } from './mock-console'
import { captureFetchResponse } from './response-capture'

export function installFetchInterceptor(): void {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const candidate = await toPageRequest(request, 'fetch')
    const decision = await requestDecision(candidate)
    if (decision.matched && decision.response) {
      logMockedRequest(candidate, decision)
      await delay(decision.response.delayMs)
      return createMockResponse(decision)
    }
    const response = decision.requestHeaders ? await nativeFetch(withHeaders(request, decision.requestHeaders)) : await nativeFetch(input, init)
    captureFetchResponse(candidate.id, response)
    return response
  }
}

async function toPageRequest(request: Request, source: 'fetch'): Promise<PageRequest> {
  let body: string | undefined
  try {
    body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.clone().text()
  } catch {
    body = undefined
  }
  return {
    id: createId('request'),
    url: request.url,
    method: request.method.toUpperCase(),
    headers: toHeaders(request.headers),
    body,
    source,
  }
}

export function createMockResponse(decision: MockDecision): Response {
  const response = decision.response!
  const headers = new Headers(response.headersEnabled ? response.headers : {})
  let body: BodyInit | null = null

  if (response.bodyType === 'file' && response.resolvedFile) {
    body = decodeBlob(response.resolvedFile.base64, response.resolvedFile.mimeType)
    if (!headers.has('content-type')) {
      headers.set('content-type', response.resolvedFile.mimeType)
    }
    if (!headers.has('content-disposition')) {
      headers.set('content-disposition', fileContentDisposition(response.resolvedFile.name))
    }
  } else if (response.bodyType === 'json') {
    body = JSON.stringify(response.body)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  } else if (response.bodyType === 'text') {
    body = String(response.body ?? '')
  }

  if ([204, 205, 304].includes(response.status)) body = null
  return new Response(body, { status: response.status, headers })
}

function withHeaders(request: Request, overrides: Record<string, string>): Request {
  const headers = new Headers(request.headers)
  Object.entries(overrides).forEach(([key, value]) => headers.set(key, value))
  return new Request(request, { headers })
}

function toHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]))
}

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => window.setTimeout(resolve, milliseconds)) : Promise.resolve()
}
