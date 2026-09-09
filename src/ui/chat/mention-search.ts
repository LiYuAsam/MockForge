import type { Folder, MockRule } from '../../core/models'
import type { ChatReference } from '../../core/models/chat'

export function getMentionQuery(text: string, cursor: number): string | undefined {
  const before = text.slice(0, cursor)
  const match = before.match(/@([^\s@]*)$/)
  return match?.[1]
}

export function searchMentions(query: string, rules: MockRule[], folders: Folder[]): ChatReference[] {
  const keyword = query.toLocaleLowerCase()
  const matchedRules = rules.filter((rule) => `${rule.name} ${rule.match.url}`.toLocaleLowerCase().includes(keyword))
    .map((rule) => ({ type: 'rule' as const, id: rule.id, label: rule.name }))
  const matchedFolders = folders.filter((folder) => folder.name.toLocaleLowerCase().includes(keyword))
    .map((folder) => ({ type: 'folder' as const, id: folder.id, label: folder.name }))
  return [...matchedRules, ...matchedFolders].slice(0, 8)
}
