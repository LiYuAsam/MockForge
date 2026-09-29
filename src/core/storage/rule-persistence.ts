import type { FileAsset, Folder, MockRule } from '../models'
import { MAX_MOCK_FILE_SIZE_BYTES } from '../../shared/file-limits'
import { STORES, getDatabase } from './database'

const ruleStores = [STORES.rules, STORES.fileAssets]

export async function saveRule(rule: MockRule): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(ruleStores, 'readwrite')
  const rules = transaction.objectStore(STORES.rules)
  const previousRequest = rules.get(rule.id)
  previousRequest.onsuccess = () => {
    const previous = previousRequest.result as MockRule | undefined
    rules.put(rule)
    const previousAssetId = fileAssetId(previous)
    if (previousAssetId && previousAssetId !== fileAssetId(rule)) {
      deleteAssetsIfUnused(transaction, [previousAssetId])
    }
  }
  await waitForTransaction(transaction)
}

export async function saveRuleWithFile(rule: MockRule, asset: FileAsset): Promise<void> {
  if (rule.response.file?.id !== asset.id || rule.response.bodyType !== 'file') {
    throw new Error('规则必须引用要保存的响应文件。')
  }
  if (asset.blob.size > MAX_MOCK_FILE_SIZE_BYTES) {
    throw new Error('响应文件不能超过 20 MB。')
  }
  if (asset.size !== asset.blob.size) throw new Error('响应文件大小信息无效。')
  if (!asset.mimeType || /[\u0000-\u001f\u007f]/.test(asset.mimeType)) {
    throw new Error('响应文件的 MIME 类型无效。')
  }

  const database = await getDatabase()
  const transaction = database.transaction(ruleStores, 'readwrite')
  const rules = transaction.objectStore(STORES.rules)
  const previousRequest = rules.get(rule.id)
  previousRequest.onsuccess = () => {
    const previous = previousRequest.result as MockRule | undefined
    transaction.objectStore(STORES.fileAssets).put(asset)
    rules.put(rule)
    const previousAssetId = fileAssetId(previous)
    if (previousAssetId && previousAssetId !== fileAssetId(rule)) {
      deleteAssetsIfUnused(transaction, [previousAssetId])
    }
  }
  await waitForTransaction(transaction)
}

export async function deleteRules(ruleIds: string[]): Promise<void> {
  if (!ruleIds.length) return

  const database = await getDatabase()
  const transaction = database.transaction(ruleStores, 'readwrite')
  const rules = transaction.objectStore(STORES.rules)
  const removedIds = new Set(ruleIds)
  const getAllRequest = rules.getAll()
  getAllRequest.onsuccess = () => {
    const previousRules = getAllRequest.result as MockRule[]
    const assetIds = previousRules
      .filter((rule) => removedIds.has(rule.id))
      .map(fileAssetId)
      .filter((id): id is string => Boolean(id))
    ruleIds.forEach((id) => rules.delete(id))
    deleteAssetsIfUnused(transaction, assetIds)
  }
  await waitForTransaction(transaction)
}

export async function saveWorkspace(
  folders: Folder[],
  rules: MockRule[],
  assets: FileAsset[] = [],
): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(
    [STORES.folders, ...ruleStores],
    'readwrite',
  )
  const folderStore = transaction.objectStore(STORES.folders)
  const ruleStore = transaction.objectStore(STORES.rules)
  const assetStore = transaction.objectStore(STORES.fileAssets)

  folders.forEach((folder) => folderStore.put(folder))
  rules.forEach((rule) => ruleStore.put(rule))
  assets.forEach((asset) => assetStore.put(asset))
  pruneAllUnusedAssets(transaction)
  await waitForTransaction(transaction)
}

function deleteAssetsIfUnused(transaction: IDBTransaction, candidateIds: string[]): void {
  const uniqueIds = [...new Set(candidateIds)]
  if (!uniqueIds.length) return

  const rulesRequest = transaction.objectStore(STORES.rules).getAll()
  rulesRequest.onsuccess = () => {
    const referencedIds = new Set(
      (rulesRequest.result as MockRule[])
        .map(fileAssetId)
        .filter((id): id is string => Boolean(id)),
    )
    uniqueIds.forEach((id) => {
      if (!referencedIds.has(id)) {
        transaction.objectStore(STORES.fileAssets).delete(id)
      }
    })
  }
}

function pruneAllUnusedAssets(transaction: IDBTransaction): void {
  let referencedIds: Set<string> | undefined
  let assetKeys: IDBValidKey[] | undefined
  const deleteUnreferenced = () => {
    const currentReferences = referencedIds
    const currentKeys = assetKeys
    if (!currentReferences || !currentKeys) return
    currentKeys.forEach((key) => {
      const id = String(key)
      if (!currentReferences.has(id)) transaction.objectStore(STORES.fileAssets).delete(id)
    })
  }

  const rulesRequest = transaction.objectStore(STORES.rules).getAll()
  rulesRequest.onsuccess = () => {
    referencedIds = new Set(
      (rulesRequest.result as MockRule[])
        .map(fileAssetId)
        .filter((id): id is string => Boolean(id)),
    )
    deleteUnreferenced()
  }

  const assetsRequest = transaction.objectStore(STORES.fileAssets).getAllKeys()
  assetsRequest.onsuccess = () => {
    assetKeys = assetsRequest.result
    deleteUnreferenced()
  }
}

function fileAssetId(rule: MockRule | undefined): string | undefined {
  return rule?.response.bodyType === 'file' ? rule.response.file?.id : undefined
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('保存规则失败。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('保存规则失败。'))
  })
}
