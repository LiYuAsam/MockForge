import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Folder, MockRule, TrafficEntry } from '../../core/models'
import { appRepository as legacyWorkspaceRepository } from '../../core/storage/app-repository'
import { findConflicts } from '../../core/rules/conflicts'
import { createId } from '../../shared/ids'
import type { RuntimeMessage, RuntimeResponse, WorkspaceSnapshot } from '../../shared/messages'

const LEGACY_MIGRATION_STORAGE_KEY = 'legacyWorkspaceMigrated'

export function useWorkspaceData() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [rules, setRules] = useState<MockRule[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      let workspace = await getWorkspace()
      const migration = await chrome.storage.local.get(LEGACY_MIGRATION_STORAGE_KEY)
      if (!migration[LEGACY_MIGRATION_STORAGE_KEY]) {
        if (!workspace.folders.length && !workspace.rules.length) {
          const [legacyFolders, legacyRules] = await Promise.all([legacyWorkspaceRepository.listFolders(), legacyWorkspaceRepository.listRules()])
          if (legacyFolders.length || legacyRules.length) {
            await sendWorkspaceMessage({ type: 'IMPORT_WORKSPACE', payload: { folders: legacyFolders, rules: legacyRules } })
            workspace = { folders: legacyFolders, rules: legacyRules }
          }
        }
        await chrome.storage.local.set({ [LEGACY_MIGRATION_STORAGE_KEY]: true })
      }
      setFolders(workspace.folders.sort((left, right) => left.name.localeCompare(right.name)))
      setRules(workspace.rules)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
    const now = Date.now()
    const folder: Folder = { id: createId('folder'), name: name.trim(), parentId, enabled: true, createdAt: now, updatedAt: now }
    await sendWorkspaceMessage({ type: 'SAVE_FOLDER', payload: folder })
    await refresh()
  }, [refresh])

  const saveFolder = useCallback(async (folder: Folder) => {
    await sendWorkspaceMessage({ type: 'SAVE_FOLDER', payload: { ...folder, updatedAt: Date.now() } })
    await refresh()
  }, [refresh])

  const saveRule = useCallback(async (rule: MockRule) => {
    await sendWorkspaceMessage({ type: 'SAVE_RULE', payload: { ...rule, metadata: { ...rule.metadata, updatedAt: Date.now() } } })
    await refresh()
  }, [refresh])

  const createRule = useCallback(async (folderId: string | null = null) => {
    const now = Date.now()
    const rule: MockRule = {
      id: createId('rule'), name: '未命名接口', folderId, enabled: true, priority: 0,
      match: { url: '', urlMode: 'exact', methods: ['GET'] },
      response: { status: 200, headersEnabled: false, headers: { 'content-type': 'application/json' }, bodyType: 'json', body: {}, delayMs: 0 },
      metadata: { createdAt: now, updatedAt: now, sortOrder: nextSortOrder(rules, folderId), source: 'manual' },
    }
    await sendWorkspaceMessage({ type: 'SAVE_RULE', payload: rule })
    await refresh()
    return rule
  }, [refresh, rules])

  const createRuleFromTraffic = useCallback(async (traffic: TrafficEntry) => {
    const now = Date.now()
    const rule: MockRule = {
      id: createId('rule'), name: `${traffic.method} ${new URL(traffic.url).pathname}`, folderId: null, enabled: true, priority: 0,
      match: { url: traffic.url, urlMode: 'exact', methods: [traffic.method] },
      requestRewrite: { enabled: false, headers: traffic.requestHeaders ?? {} },
      response: { status: traffic.status ?? 200, headersEnabled: false, headers: traffic.response?.headers ?? { 'content-type': 'application/json' }, bodyType: traffic.response?.bodyType ?? 'json', body: traffic.response?.body ?? {}, delayMs: 0 },
      metadata: { createdAt: now, updatedAt: now, sortOrder: nextSortOrder(rules, null), source: 'traffic' },
    }
    await sendWorkspaceMessage({ type: 'SAVE_RULE', payload: rule })
    await refresh()
    return rule
  }, [refresh, rules])

  const saveRuleOrder = useCallback(async (rulesToOrder: MockRule[]) => {
    await sendWorkspaceMessage({ type: 'SAVE_RULE_ORDER', payload: rulesToOrder.map((rule, index) => ({ ...rule, metadata: { ...rule.metadata, sortOrder: index } })) })
    await refresh()
  }, [refresh])

  const deleteRule = useCallback(async (id: string) => {
    await sendWorkspaceMessage({ type: 'DELETE_RULE', payload: { id } })
    await refresh()
  }, [refresh])

  const deleteFolder = useCallback(async (id: string) => {
    await sendWorkspaceMessage({ type: 'DELETE_FOLDER', payload: { id } })
    await refresh()
  }, [refresh])

  return {
    folders, rules, loading, refresh, createFolder, saveFolder, saveRule, saveRuleOrder, createRule, createRuleFromTraffic, deleteRule, deleteFolder,
    conflicts: useMemo(() => findConflicts(rules), [rules]),
  }
}

function nextSortOrder(rules: MockRule[], folderId: string | null): number {
  const orders = rules.filter((rule) => rule.folderId === folderId).map((rule) => rule.metadata.sortOrder ?? rule.metadata.createdAt)
  return orders.length ? Math.max(...orders) + 1 : 0
}

async function getWorkspace(): Promise<WorkspaceSnapshot> {
  const response = await sendWorkspaceMessage({ type: 'GET_WORKSPACE' })
  if ('workspace' in response) return response.workspace
  throw new Error('无法读取 API Mook 工作区。')
}

async function sendWorkspaceMessage(message: RuntimeMessage): Promise<Exclude<RuntimeResponse, { ok: false }>> {
  const response = await chrome.runtime.sendMessage(message) as RuntimeResponse
  if (!response.ok) throw new Error(response.error)
  return response
}
