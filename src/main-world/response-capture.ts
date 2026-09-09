import type { TrafficResponse } from '../core/models'
import { PAGE_TRAFFIC_RESPONSE_EVENT } from '../shared/constants'

const MAX_RESPONSE_BYTES = 512 * 1024

export function captureFetchResponse(id: string, response: Response): void {
  if (response.type === 'opaque') return
  const headers = toHeaders(response.headers)
  if (!isTextual(response.headers.get('content-type'))) {
    emit(id, { bodyType: 'empty', body: null, headers }, response.status)
    return
  }
  void readResponse(response.clone(), headers).then((snapshot) => emit(id, snapshot, response.status)).catch(() => undefined)
}

export function captureXhrTextResponse(id: string, text: string, headers: Record<string, string>, status: number): void {
  const contentType = findHeader(headers, 'content-type')
  if (!isTextual(contentType) || byteLength(text) > MAX_RESPONSE_BYTES) return
  emit(id, parseResponse(text, contentType, headers), status)
}

export function captureXhrJsonResponse(id: string, body: unknown, headers: Record<string, string>, status: number): void {
  if (byteLength(JSON.stringify(body)) > MAX_RESPONSE_BYTES) return
  emit(id, { bodyType: 'json', body, headers }, status)
}

async function readResponse(response: Response, headers: Record<string, string>): Promise<TrafficResponse | undefined> {
  if (!response.body) return { bodyType: 'empty', body: null, headers }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      return undefined
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength })
  return parseResponse(new TextDecoder().decode(bytes), response.headers.get('content-type'), headers)
}

function parseResponse(text: string, contentType: string | null, headers: Record<string, string>): TrafficResponse {
  if (!text) return { bodyType: 'empty', body: null, headers }
  if (isJson(contentType) || /^[\[{]/.test(text.trim())) {
    try { return { bodyType: 'json', body: JSON.parse(text), headers } } catch { /* Treat malformed JSON as text. */ }
  }
  return { bodyType: 'text', body: text, headers }
}

function emit(id: string, response: TrafficResponse | undefined, status?: number): void {
  if (response) window.dispatchEvent(new CustomEvent(PAGE_TRAFFIC_RESPONSE_EVENT, { detail: { id, response, status } }))
}

function isTextual(contentType: string | null): boolean {
  if (!contentType) return true
  const type = contentType.split(';', 1)[0].trim().toLowerCase()
  return type.startsWith('text/') || type.includes('json') || type.includes('xml')
}

function isJson(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes('json') ?? false
}

function toHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]))
}

function findHeader(headers: Record<string, string>, target: string): string | null {
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target.toLowerCase())
  return key ? headers[key] : null
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
