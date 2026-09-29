import type { ChatConfig, ChatConversation, FileAsset, Folder, InterfaceConfig, MockRule, ModelConfig, TrafficEntry } from '../models'
import { createId } from '../../shared/ids'
import { STORES } from './database'
import { clear, getAll, getById, put, remove } from './repository'
import { deleteRules, saveRule, saveRuleWithFile, saveWorkspace } from './rule-persistence'

const MODEL_CONFIG_KEY = 'modelConfig'
const CHAT_CONFIG_KEY = 'chatConfig'
const INTERFACE_CONFIG_KEY = 'interfaceConfig'
export const CHAT_HISTORY_SYNC_KEY = 'chatHistorySync'
const DEFAULT_CHAT_CONFIG: ChatConfig = { historyLimit: 10, enablePdfParsing: false, enableDocxParsing: false, pdfProcessing: 'hybrid', pdfTextThreshold: 30, pdfMaxVisualPages: 10 }

export const appRepository = {
  listFolders: () => getAll<Folder>(STORES.folders),
  listRules: () => getAll<MockRule>(STORES.rules),
  listFileAssets: () => getAll<FileAsset>(STORES.fileAssets),
  getFileAsset: (id: string) => getById<FileAsset>(STORES.fileAssets, id),
  listTraffic: () => getAll<TrafficEntry>(STORES.traffic),
  saveFolder: (folder: Folder) => put(STORES.folders, folder),
  saveRule,
  saveRuleWithFile,
  saveWorkspace,
  async saveTraffic(entry: TrafficEntry): Promise<void> {
    await put(STORES.traffic, entry)
    const traffic = await getAll<TrafficEntry>(STORES.traffic)
    const expired = traffic.sort((left, right) => right.startedAt - left.startedAt).slice(100)
    await Promise.all(expired.map((item) => remove(STORES.traffic, item.id)))
  },
  async saveTrafficResponse(id: string, response: TrafficEntry['response'], status?: number): Promise<void> {
    const traffic = await getById<TrafficEntry>(STORES.traffic, id)
    if (traffic) await put(STORES.traffic, { ...traffic, response, ...(status === undefined ? {} : { status }) })
  },
  deleteFolder: (id: string) => remove(STORES.folders, id),
  deleteRule: (id: string) => deleteRules([id]),
  clearTraffic: () => clear(STORES.traffic),
  listChatConversations: () => getAll<ChatConversation>(STORES.chats),
  async saveChatConversation(conversation: ChatConversation, historyLimit: number, source: string): Promise<string[]> {
    await put(STORES.chats, conversation)
    const conversations = await getAll<ChatConversation>(STORES.chats)
    const expired = conversations.sort((left, right) => right.updatedAt - left.updatedAt).slice(normalizeHistoryLimit(historyLimit))
    await Promise.all(expired.map((item) => remove(STORES.chats, item.id)))
    await notifyChatHistoryChanged(source)
    return expired.map((item) => item.id)
  },
  async deleteChatConversation(id: string, source: string): Promise<void> {
    await remove(STORES.chats, id)
    await notifyChatHistoryChanged(source)
  },
  async getModelConfig(): Promise<ModelConfig> {
    const result = await chrome.storage.local.get(MODEL_CONFIG_KEY)
    return result[MODEL_CONFIG_KEY] ?? { baseUrl: '', apiKey: '', model: '', extraHeaders: {} }
  },
  saveModelConfig: (config: ModelConfig) => chrome.storage.local.set({ [MODEL_CONFIG_KEY]: config }),
  async getInterfaceConfig(): Promise<InterfaceConfig> {
    const result = await chrome.storage.local.get(INTERFACE_CONFIG_KEY)
    const config = result[INTERFACE_CONFIG_KEY] as Partial<InterfaceConfig> | undefined
    return { showFloatingLauncher: config?.showFloatingLauncher ?? true }
  },
  saveInterfaceConfig: (config: InterfaceConfig) => chrome.storage.local.set({ [INTERFACE_CONFIG_KEY]: { showFloatingLauncher: Boolean(config.showFloatingLauncher) } }),
  async getChatConfig(): Promise<ChatConfig> {
    const result = await chrome.storage.local.get(CHAT_CONFIG_KEY)
    return normalizeChatConfig(result[CHAT_CONFIG_KEY] as Partial<ChatConfig> | undefined)
  },
  async saveChatConfig(config: ChatConfig): Promise<void> {
    const normalized = normalizeChatConfig(config)
    const conversations = await getAll<ChatConversation>(STORES.chats)
    const expired = conversations.sort((left, right) => right.updatedAt - left.updatedAt).slice(normalized.historyLimit)
    await Promise.all(expired.map((item) => remove(STORES.chats, item.id)))
    await chrome.storage.local.set({ [CHAT_CONFIG_KEY]: normalized })
  },
  createFolder(name: string, parentId: string | null = null): Folder {
    const now = Date.now()
    return { id: createId('folder'), name, parentId, enabled: true, createdAt: now, updatedAt: now }
  },
  async deleteFolderAndContents(id: string): Promise<void> {
    const [folders, rules] = await Promise.all([getAll<Folder>(STORES.folders), getAll<MockRule>(STORES.rules)])
    if (!folders.some((folder) => folder.id === id)) return
    const folderIds = collectFolderIds(id, folders)
    const removedRules = rules.filter((rule) => rule.folderId && folderIds.has(rule.folderId))
    await deleteRules(removedRules.map((rule) => rule.id))
    await Promise.all([...folderIds].map((folderId) => remove(STORES.folders, folderId)))
  },
}

async function notifyChatHistoryChanged(source: string): Promise<void> {
  await chrome.storage.local.set({ [CHAT_HISTORY_SYNC_KEY]: { source, revision: createId('chat-sync') } })
}

function normalizeHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_CONFIG.historyLimit
  return Math.min(100, Math.max(1, Math.trunc(value)))
}

function normalizeChatConfig(config: Partial<ChatConfig> | undefined): ChatConfig {
  return {
    historyLimit: normalizeHistoryLimit(config?.historyLimit ?? DEFAULT_CHAT_CONFIG.historyLimit),
    enablePdfParsing: config?.enablePdfParsing ?? DEFAULT_CHAT_CONFIG.enablePdfParsing,
    enableDocxParsing: config?.enableDocxParsing ?? DEFAULT_CHAT_CONFIG.enableDocxParsing,
    pdfProcessing: config?.pdfProcessing === 'text' || config?.pdfProcessing === 'vision' ? config.pdfProcessing : 'hybrid',
    pdfTextThreshold: normalizeRange(config?.pdfTextThreshold, DEFAULT_CHAT_CONFIG.pdfTextThreshold, 0, 1000),
    pdfMaxVisualPages: normalizeRange(config?.pdfMaxVisualPages, DEFAULT_CHAT_CONFIG.pdfMaxVisualPages, 1, 30),
  }
}

function normalizeRange(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}

function collectFolderIds(rootId: string, folders: Folder[]): Set<string> {
  const ids = new Set([rootId])
  let found = true
  while (found) {
    found = false
    folders.forEach((folder) => {
      if (!ids.has(folder.id) && folder.parentId && ids.has(folder.parentId)) {
        ids.add(folder.id)
        found = true
      }
    })
  }
  return ids
}
