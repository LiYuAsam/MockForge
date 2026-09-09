import { PAGE_REQUEST_EVENT, PAGE_RESPONSE_EVENT, PAGE_TRAFFIC_RESPONSE_EVENT } from '../shared/constants'
import type { TrafficResponse } from '../core/models'
import type { PageRequest, RuntimeMessage, RuntimeResponse } from '../shared/messages'
import { mountOverlay, unmountOverlay } from './overlay-root'

window.addEventListener(PAGE_REQUEST_EVENT, (event) => {
  const payload = (event as CustomEvent<PageRequest>).detail
  if (!payload?.id) return
  chrome.runtime.sendMessage({ type: 'MATCH_REQUEST', payload } satisfies RuntimeMessage)
    .then((response: RuntimeResponse) => {
      if (!response.ok || !('decision' in response)) return { matched: false }
      return response.decision
    })
    .catch(() => ({ matched: false }))
    .then((decision) => window.dispatchEvent(new CustomEvent(PAGE_RESPONSE_EVENT, { detail: { id: payload.id, decision } })))
})

window.addEventListener(PAGE_TRAFFIC_RESPONSE_EVENT, (event) => {
  const payload = (event as CustomEvent<{ id: string; response: TrafficResponse; status?: number }>).detail
  if (!payload?.id || !payload.response) return
  void chrome.runtime.sendMessage({ type: 'SAVE_TRAFFIC_RESPONSE', payload } satisfies RuntimeMessage).catch(() => undefined)
})

function syncOverlay(config: { showFloatingLauncher?: boolean } | undefined): void {
  if (config?.showFloatingLauncher ?? true) mountOverlay()
  else unmountOverlay()
}

function loadOverlayPreference(): void {
  void chrome.storage.local.get('interfaceConfig').then((items) => syncOverlay(items.interfaceConfig as { showFloatingLauncher?: boolean } | undefined))
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.interfaceConfig) syncOverlay(changes.interfaceConfig.newValue as { showFloatingLauncher?: boolean } | undefined)
})

if (document.documentElement) loadOverlayPreference()
else document.addEventListener('DOMContentLoaded', loadOverlayPreference, { once: true })
