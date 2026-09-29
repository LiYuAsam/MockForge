import type { ChatConfig, ChatConversation } from '../../core/models'
import { appRepository } from '../../core/storage/app-repository'
import type { RuntimeMessage, RuntimeResponse } from '../../shared/messages'

export async function loadChatConversations(source: string): Promise<ChatConversation[]> {
  await migrateLegacyConversations(source)
  return getChatConversations()
}

export async function getChatConversations(): Promise<ChatConversation[]> {
  const response = await sendRuntimeMessage({ type: 'GET_CHAT_CONVERSATIONS' })
  if (!response.ok || !('conversations' in response)) {
    throw new Error(response.ok ? '无法读取历史对话。' : response.error)
  }
  return response.conversations
}

export async function saveChatConversation(
  conversation: ChatConversation,
  historyLimit: number,
  source: string,
): Promise<string[]> {
  const response = await sendRuntimeMessage({
    type: 'SAVE_CHAT_CONVERSATION',
    payload: { conversation, historyLimit, source },
  })
  if (!response.ok || !('expiredConversationIds' in response)) {
    throw new Error(response.ok ? '无法保存历史对话。' : response.error)
  }
  return response.expiredConversationIds
}

export async function deleteChatConversation(id: string, source: string): Promise<void> {
  await sendRuntimeMessage({ type: 'DELETE_CHAT_CONVERSATION', payload: { id, source } })
}

export async function saveChatConfig(config: ChatConfig): Promise<void> {
  await sendRuntimeMessage({ type: 'SAVE_CHAT_CONFIG', payload: config })
}

async function migrateLegacyConversations(source: string): Promise<void> {
  const migrationKey = `chatHistoryMigrated:${encodeURIComponent(location.origin)}`
  const migrationState = await chrome.storage.local.get(migrationKey)
  if (migrationState[migrationKey]) return

  try {
    const conversations = await appRepository.listChatConversations()
    await sendRuntimeMessage({
      type: 'IMPORT_CHAT_CONVERSATIONS',
      payload: { conversations, source },
    })
    await chrome.storage.local.set({ [migrationKey]: true })
  } catch {
    // Leave the marker unset so a later load can retry the migration.
  }
}

async function sendRuntimeMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  const response = await chrome.runtime.sendMessage(message) as RuntimeResponse
  if (!response.ok) throw new Error(response.error)
  return response
}
