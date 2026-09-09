import type { Folder, MockRule } from '../models'
import type { RuntimeMessage, RuntimeResponse, WorkspaceSnapshot } from '../../shared/messages'

type ExportPayload = { version: 1; folders: Folder[]; rules: MockRule[] }

export async function exportRules(): Promise<void> {
  const workspace = await getWorkspace()
  const payload: ExportPayload = { version: 1, ...workspace }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `api-mook-rules-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importRules(file: File): Promise<void> {
  const raw = JSON.parse(await file.text()) as Partial<ExportPayload>
  if (raw.version !== 1 || !Array.isArray(raw.folders) || !Array.isArray(raw.rules)) throw new Error('不是有效的 API Mook 导出文件。')
  raw.folders.forEach(assertFolder)
  raw.rules.forEach(assertRule)
  await sendWorkspaceMessage({ type: 'IMPORT_WORKSPACE', payload: { folders: raw.folders, rules: raw.rules } })
}

function assertFolder(value: unknown): asserts value is Folder {
  if (!value || typeof value !== 'object' || typeof (value as Folder).id !== 'string' || typeof (value as Folder).name !== 'string') throw new Error('导入文件包含无效文件夹。')
}

function assertRule(value: unknown): asserts value is MockRule {
  const rule = value as MockRule
  if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' || typeof rule.name !== 'string' || !rule.match || !rule.response) throw new Error('导入文件包含无效规则。')
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
