import { decideRequest } from '../core/rules/rule-service'
import { appRepository } from '../core/storage/app-repository'
import type { RuntimeMessage, RuntimeResponse } from '../shared/messages'
import { recordTraffic, saveTrafficResponse } from './traffic-service'
import { openSidePanel, openWorkspace } from './workspace'

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    void handleMessage(message, sender.tab?.id)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : '未知错误' }))
    return true
  })
}

async function handleMessage(message: RuntimeMessage, tabId?: number): Promise<RuntimeResponse> {
  if (message.type === 'MATCH_REQUEST') {
    const decision = await decideRequest(message.payload)
    await recordTraffic(message.payload, decision.matched ? 'mocked' : 'passed', decision, tabId)
    return { ok: true, decision }
  }
  if (message.type === 'GET_WORKSPACE') return { ok: true, workspace: { folders: await appRepository.listFolders(), rules: await appRepository.listRules() } }
  if (message.type === 'SAVE_FOLDER') {
    await appRepository.saveFolder(message.payload)
    return { ok: true }
  }
  if (message.type === 'SAVE_RULE') {
    await appRepository.saveRule(message.payload)
    return { ok: true }
  }
  if (message.type === 'SAVE_RULE_ORDER') {
    await Promise.all(message.payload.map((rule) => appRepository.saveRule(rule)))
    return { ok: true }
  }
  if (message.type === 'DELETE_FOLDER') {
    await appRepository.deleteFolderAndContents(message.payload.id)
    return { ok: true }
  }
  if (message.type === 'DELETE_RULE') {
    await appRepository.deleteRule(message.payload.id)
    return { ok: true }
  }
  if (message.type === 'IMPORT_WORKSPACE') {
    await appRepository.saveWorkspace(message.payload.folders, message.payload.rules)
    return { ok: true }
  }
  if (message.type === 'GET_TRAFFIC') return { ok: true, traffic: await appRepository.listTraffic() }
  if (message.type === 'GET_PAGE_CONTEXT') return { ok: true, page: await getPageContext(tabId) }
  if (message.type === 'SAVE_TRAFFIC_RESPONSE') {
    await saveTrafficResponse(message.payload.id, message.payload.response, message.payload.status)
    return { ok: true }
  }
  if (message.type === 'CLEAR_TRAFFIC') {
    await appRepository.clearTraffic()
    return { ok: true }
  }
  if (message.type === 'OPEN_WORKSPACE') {
    await openWorkspace()
    return { ok: true }
  }
  await openSidePanel(message.tabId ?? tabId)
  return { ok: true }
}

async function getPageContext(requestingTabId?: number): Promise<import('../shared/messages').PageContext | undefined> {
  const candidateIds = [requestingTabId]
  if (requestingTabId === undefined) {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    candidateIds.push(activeTab?.id)
  }
  const traffic = await appRepository.listTraffic()
  traffic.sort((left, right) => right.startedAt - left.startedAt).forEach((entry) => candidateIds.push(entry.tabId))
  for (const id of candidateIds) {
    if (id === undefined) continue
    try {
      const tab = await chrome.tabs.get(id)
      if (!tab.url || !/^https?:/i.test(tab.url)) continue
      return { tabId: id, url: tab.url, title: tab.title ?? '' }
    } catch {
      // The tab may have been closed while resolving the chat context.
    }
  }
  return undefined
}
