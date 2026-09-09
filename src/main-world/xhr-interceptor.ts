import { createId } from '../shared/ids'
import type { MockDecision, PageRequest } from '../shared/messages'
import { requestDecision } from './bridge'
import { captureXhrJsonResponse, captureXhrTextResponse } from './response-capture'

type XhrEventName = 'readystatechange' | 'load' | 'loadend' | 'error' | 'abort' | 'timeout'

export function installXhrInterceptor(): void {
  const NativeXHR = window.XMLHttpRequest
  window.XMLHttpRequest = createXhrConstructor(NativeXHR) as unknown as typeof XMLHttpRequest
}

function createXhrConstructor(NativeXHR: typeof XMLHttpRequest) {
  return class MookXMLHttpRequest extends EventTarget {
    private readonly native = new NativeXHR()
    private readonly headers = new Map<string, string>()
    private method = 'GET'
    private requestUrl = ''
    private requestId?: string
    private mocked?: MockDecision
    private mockReadyState = 0
    private aborted = false
    private handlers = new Map<XhrEventName, ((event: Event) => void) | null>()

    constructor() {
      super()
      ;(['readystatechange', 'load', 'loadend', 'error', 'abort', 'timeout'] as XhrEventName[]).forEach((name) => {
        this.native.addEventListener(name, () => {
          if (name === 'loadend') this.captureNativeResponse()
          this.emit(name)
        })
      })
    }

    get readyState() { return this.mocked ? this.mockReadyState : this.native.readyState }
    get status() { return this.mocked ? this.mocked.response?.status ?? 0 : this.native.status }
    get statusText() { return this.mocked ? '' : this.native.statusText }
    get responseURL() { return this.mocked ? this.requestUrl : this.native.responseURL }
    get responseType() { return this.native.responseType }
    set responseType(value: XMLHttpRequestResponseType) { this.native.responseType = value }
    get responseText() { return this.mocked ? mockText(this.mocked) : this.native.responseText }
    get response() { return this.mocked ? mockResponse(this.mocked, this.responseType) : this.native.response }
    get timeout() { return this.native.timeout }
    set timeout(value: number) { this.native.timeout = value }
    get withCredentials() { return this.native.withCredentials }
    set withCredentials(value: boolean) { this.native.withCredentials = value }
    get upload() { return this.native.upload }
    get onreadystatechange() { return this.handlers.get('readystatechange') ?? null }
    set onreadystatechange(handler) { this.handlers.set('readystatechange', handler) }
    get onload() { return this.handlers.get('load') ?? null }
    set onload(handler) { this.handlers.set('load', handler) }
    get onloadend() { return this.handlers.get('loadend') ?? null }
    set onloadend(handler) { this.handlers.set('loadend', handler) }
    get onerror() { return this.handlers.get('error') ?? null }
    set onerror(handler) { this.handlers.set('error', handler) }

    open(method: string, url: string | URL, async = true, user?: string | null, password?: string | null): void {
      this.method = method.toUpperCase()
      this.requestUrl = new URL(String(url), location.href).href
      this.native.open(method, url, async, user ?? undefined, password ?? undefined)
    }

    setRequestHeader(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value)
      this.native.setRequestHeader(name, value)
    }

    async send(body?: Document | XMLHttpRequestBodyInit | null): Promise<void> {
      const request: PageRequest = {
        id: createId('request'), url: this.requestUrl, method: this.method,
        headers: Object.fromEntries(this.headers), body: serializeBody(body), source: 'xhr',
      }
      this.requestId = request.id
      const decision = await requestDecision(request)
      if (!decision.matched || !decision.response) {
        applyHeaders(this.native, decision.requestHeaders)
        this.native.send(body)
        return
      }
      this.mocked = decision
      this.mockReadyState = 1
      this.emit('readystatechange')
      window.setTimeout(() => this.finishMock(), decision.response.delayMs)
    }

    abort(): void {
      this.aborted = true
      if (!this.mocked) this.native.abort()
      else this.emit('abort')
    }

    getResponseHeader(name: string): string | null {
      if (!this.mocked) return this.native.getResponseHeader(name)
      return findHeader(mockHeaders(this.mocked), name)
    }

    getAllResponseHeaders(): string {
      if (!this.mocked) return this.native.getAllResponseHeaders()
      return Object.entries(mockHeaders(this.mocked)).map(([key, value]) => `${key}: ${value}`).join('\r\n')
    }

    overrideMimeType(mime: string): void { this.native.overrideMimeType(mime) }

    private finishMock(): void {
      if (this.aborted) return
      this.mockReadyState = 4
      this.emit('readystatechange')
      this.emit('load')
      this.emit('loadend')
    }

    private captureNativeResponse(): void {
      if (!this.requestId) return
      try {
        const headers = parseResponseHeaders(this.native.getAllResponseHeaders())
        if (this.native.responseType === 'json') captureXhrJsonResponse(this.requestId, this.native.response, headers, this.native.status)
        else if (this.native.responseType === '' || this.native.responseType === 'text') captureXhrTextResponse(this.requestId, this.native.responseText, headers, this.native.status)
      } catch {
        // Some XHR response types intentionally do not expose a text body.
      }
    }

    private emit(name: XhrEventName): void {
      const event = new Event(name)
      this.dispatchEvent(event)
      this.handlers.get(name)?.call(this, event)
    }
  }
}

function mockText(decision: MockDecision): string {
  const response = decision.response!
  return response.bodyType === 'json' ? JSON.stringify(response.body) : String(response.body ?? '')
}

function mockResponse(decision: MockDecision, responseType: XMLHttpRequestResponseType): unknown {
  if (responseType === 'json' && decision.response?.bodyType === 'json') return decision.response.body
  return mockText(decision)
}

function applyHeaders(xhr: XMLHttpRequest, headers?: Record<string, string>): void {
  Object.entries(headers ?? {}).forEach(([key, value]) => xhr.setRequestHeader(key, value))
}

function findHeader(headers: Record<string, string> | undefined, target: string): string | null {
  const key = Object.keys(headers ?? {}).find((header) => header.toLowerCase() === target.toLowerCase())
  return key ? headers![key] : null
}

function mockHeaders(decision: MockDecision): Record<string, string> {
  const response = decision.response!
  const headers = response.headersEnabled ? { ...response.headers } : {}
  if (response.bodyType === 'json' && !findHeader(headers, 'content-type')) headers['content-type'] = 'application/json'
  return headers
}

function parseResponseHeaders(rawHeaders: string): Record<string, string> {
  return rawHeaders.split(/\r?\n/).reduce<Record<string, string>>((headers, line) => {
    const separator = line.indexOf(':')
    if (separator < 1) return headers
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key) headers[key] = headers[key] ? `${headers[key]}, ${value}` : value
    return headers
  }, {})
}

function serializeBody(body?: Document | XMLHttpRequestBodyInit | null): string | undefined {
  return typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : undefined
}
