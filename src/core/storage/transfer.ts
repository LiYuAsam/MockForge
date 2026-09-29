import type { FileAsset, FileAssetReference, Folder, MockRule } from '../models'
import type { RuntimeMessage, RuntimeResponse, WorkspaceSnapshot } from '../../shared/messages'
import { appRepository } from './app-repository'
import { decodeBlob, encodeBlob } from '../../shared/base64'
import { MAX_MOCK_FILE_SIZE_BYTES } from '../../shared/file-limits'

type ExportedFileAsset = FileAssetReference & { base64: string }
type ExportPayload = { version: 2; folders: Folder[]; rules: MockRule[]; fileAssets: ExportedFileAsset[] }

export async function exportRules(): Promise<void> {
  const workspace = await getWorkspace()
  const assetIds = [...new Set(workspace.rules.flatMap((rule) => rule.response.file?.id ?? []))]
  const fileAssets = await Promise.all(assetIds.map(exportFileAsset))
  const payload: ExportPayload = { version: 2, ...workspace, fileAssets }
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
  if (![1, 2].includes(raw.version ?? 0) || !Array.isArray(raw.folders) || !Array.isArray(raw.rules)) {
    throw new Error('不是有效的 API Mook 导出文件。')
  }
  raw.folders.forEach(assertFolder)
  raw.rules.forEach(assertRule)

  const exportedAssets = raw.version === 2 ? raw.fileAssets : []
  if (!Array.isArray(exportedAssets)) throw new Error('导入文件缺少响应文件数据。')
  const assets = exportedAssets.map(importFileAsset)
  const assetIds = new Set(assets.map((asset) => asset.id))
  raw.rules.forEach((rule) => {
    if (rule.response.bodyType === 'file' && (!rule.response.file || !assetIds.has(rule.response.file.id))) {
      throw new Error(`规则“${rule.name}”引用的响应文件不在导入文件中。`)
    }
  })

  await appRepository.saveWorkspace(raw.folders, raw.rules, assets)
}

async function exportFileAsset(id: string): Promise<ExportedFileAsset> {
  const asset = await appRepository.getFileAsset(id)
  if (!asset) throw new Error(`找不到规则引用的响应文件：${id}`)
  if (asset.blob.size > MAX_MOCK_FILE_SIZE_BYTES) throw new Error(`响应文件“${asset.name}”超过导出上限。`)
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    base64: await encodeBlob(asset.blob),
  }
}

function importFileAsset(value: unknown): FileAsset {
  if (!value || typeof value !== 'object') throw new Error('导入文件包含无效响应文件。')
  const asset = value as ExportedFileAsset
  if (
    typeof asset.id !== 'string' || !asset.id ||
    typeof asset.name !== 'string' ||
    typeof asset.mimeType !== 'string' ||
    !asset.mimeType || /[\u0000-\u001f\u007f]/.test(asset.mimeType) ||
    typeof asset.size !== 'number' ||
    asset.size < 0 || asset.size > MAX_MOCK_FILE_SIZE_BYTES ||
    typeof asset.base64 !== 'string'
  ) {
    throw new Error('导入文件包含无效响应文件。')
  }

  const blob = decodeBlob(asset.base64, asset.mimeType)
  if (blob.size !== asset.size) throw new Error(`响应文件“${asset.name}”的数据长度无效。`)
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    blob,
    createdAt: Date.now(),
  }
}

function assertFolder(value: unknown): asserts value is Folder {
  if (!value || typeof value !== 'object' || typeof (value as Folder).id !== 'string' || typeof (value as Folder).name !== 'string') throw new Error('导入文件包含无效文件夹。')
}

function assertRule(value: unknown): asserts value is MockRule {
  const rule = value as MockRule
  if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' || typeof rule.name !== 'string' || !rule.match || !rule.response) throw new Error('导入文件包含无效规则。')
  if (rule.response.bodyType === 'file' && (!rule.response.file || typeof rule.response.file.id !== 'string')) {
    throw new Error('导入文件包含缺少响应文件引用的规则。')
  }
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
