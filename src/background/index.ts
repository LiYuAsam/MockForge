import { registerMessageRouter } from './message-router'
import { enableSidePanel } from './workspace'

registerMessageRouter()

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') void enableSidePanel(tabId)
})
