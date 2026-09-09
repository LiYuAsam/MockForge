import { useEffect, useState } from 'react'
import type { MockRule } from '../../core/models'
import type { RuleConflict } from '../../core/rules/conflicts'
import { FolderPanel } from './folder-panel'
import { RuleEditor } from './rule-editor'
import { RuleList } from './rule-list'
import { TransferActions } from './transfer-actions'
import type { useWorkspaceData } from '../app-shell/use-workspace-data'

type WorkspaceData = ReturnType<typeof useWorkspaceData>
type RuleSortMode = 'enabled' | 'created' | 'updated' | 'manual'
const SELECTED_FOLDER_STORAGE_KEY = 'rulesSelectedFolderId'

export function RulesPage({ data, selectedId, onSelectedIdChange }: { data: WorkspaceData; selectedId?: string; onSelectedIdChange: (id?: string) => void }) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [folderSelectionLoaded, setFolderSelectionLoaded] = useState(false)
  const [sortMode, setSortMode] = useState<RuleSortMode>('enabled')
  const selected = data.rules.find((rule) => rule.id === selectedId)
  const visibleRules = sortRules(data.rules.filter((rule) => rule.folderId === selectedFolderId), sortMode)

  useEffect(() => {
    void chrome.storage.local.get(SELECTED_FOLDER_STORAGE_KEY).then((stored) => {
      const folderId = stored[SELECTED_FOLDER_STORAGE_KEY]
      if (typeof folderId === 'string') setSelectedFolderId(folderId)
      setFolderSelectionLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (folderSelectionLoaded) void chrome.storage.local.set({ [SELECTED_FOLDER_STORAGE_KEY]: selectedFolderId })
  }, [folderSelectionLoaded, selectedFolderId])

  async function createRule(): Promise<void> {
    const rule = await data.createRule(selectedFolderId)
    onSelectedIdChange(rule.id)
  }

  async function deleteRule(id: string): Promise<void> {
    await data.deleteRule(id)
    if (id === selectedId) onSelectedIdChange(undefined)
  }

  async function toggleRule(rule: MockRule, enabled: boolean): Promise<void> {
    await data.saveRule({ ...rule, enabled })
  }

  async function moveRule(id: string, folderId: string | null): Promise<void> {
    const rule = data.rules.find((item) => item.id === id)
    if (!rule || rule.folderId === folderId) return
    const siblingOrders = data.rules.filter((item) => item.id !== id && item.folderId === folderId).map((item) => item.metadata.sortOrder ?? item.metadata.createdAt)
    const sortOrder = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0
    await data.saveRule({ ...rule, folderId, metadata: { ...rule.metadata, sortOrder } })
  }

  async function reorderRules(draggedRuleId: string, targetRuleId: string): Promise<void> {
    if (draggedRuleId === targetRuleId) return
    const nextRules = [...visibleRules]
    const draggedIndex = nextRules.findIndex((rule) => rule.id === draggedRuleId)
    const targetIndex = nextRules.findIndex((rule) => rule.id === targetRuleId)
    if (draggedIndex < 0 || targetIndex < 0) return
    const [draggedRule] = nextRules.splice(draggedIndex, 1)
    nextRules.splice(targetIndex, 0, draggedRule)
    setSortMode('manual')
    await data.saveRuleOrder(nextRules)
  }

  async function moveFolder(id: string, parentId: string | null): Promise<void> {
    const folder = data.folders.find((item) => item.id === id)
    if (folder && folder.parentId !== parentId) await data.saveFolder({ ...folder, parentId })
  }

  async function deleteFolder(id: string): Promise<void> {
    const deletedFolderIds = collectFolderIds(id, data.folders)
    await data.deleteFolder(id)
    if (selectedFolderId && deletedFolderIds.has(selectedFolderId)) setSelectedFolderId(null)
  }

  if (selected) return <section className="rule-editor-page">
    <button className="button button--ghost rule-editor-page__back" onClick={() => onSelectedIdChange(undefined)}>← 返回规则总览</button>
    <div className="rule-editor-layout">
      <aside className="rule-editor-sidebar">
        <RuleList rules={sortRules(data.rules, 'enabled')} conflicts={data.conflicts} selectedId={selected.id} onSelect={onSelectedIdChange} onDelete={deleteRule} onCreate={createRule} onToggleEnabled={toggleRule} />
      </aside>
      <section className="rules-detail"><RuleEditor rule={selected} folders={data.folders} conflicts={conflictsFor(selected.id, data.conflicts)} onSave={data.saveRule} /></section>
    </div>
  </section>

  return <section className="rules-overview">
    <div className="rules-browser">
      <aside className="rules-browser__folders"><FolderPanel folders={data.folders} rules={data.rules} selectedId={selectedFolderId} onSelectedIdChange={setSelectedFolderId} onCreate={data.createFolder} onMoveFolder={moveFolder} onMoveRule={moveRule} onSave={data.saveFolder} onDelete={deleteFolder} /></aside>
      <section className="rules-browser__content">
        <div className="rules-browser__toolbar"><div className="row rules-browser__actions"><TransferActions compact onImported={data.refresh} /><button className="button" onClick={() => void createRule()}>+ 新建规则</button></div></div>
        <RuleList rules={visibleRules} conflicts={data.conflicts} onSelect={onSelectedIdChange} onDelete={deleteRule} onCreate={createRule} showCreateOnEmpty={false} emptyContent={!data.loading ? '该文件夹中还没有 Mock API，可新建规则或将其他 API 拖入此处。' : undefined} title="" headerStart={<label className="rule-list__sort"><span>排序</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as RuleSortMode)}><option value="enabled">启用优先</option><option value="created">创建时间</option><option value="updated">最新更改</option><option value="manual">手动排序</option></select></label>} onToggleEnabled={toggleRule} onRuleDragStart={(rule, event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-api-mook-item', JSON.stringify({ type: 'rule', id: rule.id })) }} onRuleDrop={(draggedRuleId, targetRuleId) => void reorderRules(draggedRuleId, targetRuleId)} />
      </section>
    </div>
  </section>
}

function conflictsFor(ruleId: string, conflicts: RuleConflict[]): RuleConflict[] {
  return conflicts.filter((item) => item.ruleId === ruleId || item.otherRuleId === ruleId)
}

function collectFolderIds(rootId: string, folders: { id: string; parentId: string | null }[]): Set<string> {
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

function sortRules(rules: MockRule[], mode: RuleSortMode): MockRule[] {
  return [...rules].sort((left, right) => {
    if (mode === 'enabled' && left.enabled !== right.enabled) return left.enabled ? -1 : 1
    if (mode === 'created') return right.metadata.createdAt - left.metadata.createdAt
    if (mode === 'updated') return right.metadata.updatedAt - left.metadata.updatedAt
    const leftOrder = left.metadata.sortOrder ?? left.metadata.createdAt
    const rightOrder = right.metadata.sortOrder ?? right.metadata.createdAt
    return leftOrder - rightOrder || left.id.localeCompare(right.id)
  })
}
