import type { Folder, MockRule } from '../models'

export function isRuleActive(rule: MockRule, folders: Folder[]): boolean {
  if (!rule.enabled) return false
  let folderId = rule.folderId
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  while (folderId) {
    const folder = byId.get(folderId)
    if (!folder || !folder.enabled) return false
    folderId = folder.parentId
  }
  return true
}
