import { SIDE_PANEL_PATH, WORKSPACE_PATH } from '../shared/constants'

export async function openWorkspace(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(WORKSPACE_PATH) })
}

export async function openSidePanel(tabId?: number): Promise<void> {
  const targetTabId = tabId ?? (await getActiveTabId())
  if (targetTabId === undefined) return
  await chrome.sidePanel.open({ tabId: targetTabId })
}

export function enableSidePanel(tabId: number): Promise<void> {
  return chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true })
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tab?.id
}
