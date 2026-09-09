import { PAGE_REQUEST_EVENT, PAGE_RESPONSE_EVENT } from '../shared/constants'
import type { MockDecision, PageRequest } from '../shared/messages'

const pending = new Map<string, (decision: MockDecision) => void>()

window.addEventListener(PAGE_RESPONSE_EVENT, (event) => {
  const response = (event as CustomEvent<{ id: string; decision: MockDecision }>).detail
  const resolve = pending.get(response?.id)
  if (!resolve) return
  pending.delete(response.id)
  resolve(response.decision)
})

export function requestDecision(request: PageRequest): Promise<MockDecision> {
  return new Promise((resolve) => {
    pending.set(request.id, resolve)
    window.dispatchEvent(new CustomEvent(PAGE_REQUEST_EVENT, { detail: request }))
    window.setTimeout(() => {
      const fallback = pending.get(request.id)
      if (!fallback) return
      pending.delete(request.id)
      fallback({ matched: false })
    }, 3_000)
  })
}
