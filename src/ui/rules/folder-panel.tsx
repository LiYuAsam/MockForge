import { useState, type DragEvent, type FormEvent } from 'react'
import type { Folder, MockRule } from '../../core/models'
import { isRuleActive } from '../../core/rules/folder-state'
import { IconButton } from '../components/icon-button'

type FolderPanelProps = {
  folders: Folder[]
  rules: MockRule[]
  selectedId: string | null
  onSelectedIdChange: (id: string | null) => void
  onCreate: (name: string, parentId: string | null) => Promise<void>
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>
  onMoveRule: (id: string, folderId: string | null) => Promise<void>
  onSave: (folder: Folder) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

type DragPayload = { type: 'folder' | 'rule'; id: string }

export function FolderPanel({ folders, rules, selectedId, onSelectedIdChange, onCreate, onMoveFolder, onMoveRule, onSave, onDelete }: FolderPanelProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null | undefined>()
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string>()
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set())
  const selectedFolder = folders.find((folder) => folder.id === selectedId)

  function toggleFolder(folderId: string): void {
    setCollapsedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) return
    await onCreate(nextName, selectedId)
    setName('')
    setAdding(false)
  }

  function beginDrag(event: DragEvent<HTMLElement>, payload: DragPayload): void {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-api-mook-item', JSON.stringify(payload))
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string | null): void {
    if (!Array.from(event.dataTransfer.types).includes('application/x-api-mook-item')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(targetId)
  }

  async function handleDrop(event: DragEvent<HTMLElement>, targetId: string | null): Promise<void> {
    event.preventDefault()
    setDropTarget(undefined)
    const payload = readPayload(event)
    if (!payload || !canDrop(payload, targetId, folders)) return
    if (payload.type === 'folder') await onMoveFolder(payload.id, targetId)
    else await onMoveRule(payload.id, targetId)
  }

  return <section className="panel folder-panel">
    <div className="row row--space folder-panel__heading"><h2 className="panel__title folder-panel__title" aria-label="文件夹" title="文件夹"><FolderIcon /></h2><IconButton icon="plus" label="新建文件夹" onClick={() => setAdding(true)} /></div>
    {adding && <form className="folder-panel__create-popover" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>新建到：{selectedFolder?.name ?? 'root'}</span><input autoFocus aria-label="文件夹名称" placeholder="文件夹名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="row"><button className="button" type="submit">创建</button><button className="button button--ghost" type="button" onClick={() => { setAdding(false); setName('') }}>取消</button></div>
    </form>}
    <div className="folder-tree">
      <div className={`folder-tree__drop-zone${dropTarget === null ? ' folder-tree__drop-zone--active' : ''}`} onDragOver={(event) => handleDragOver(event, null)} onDragLeave={() => setDropTarget(undefined)} onDrop={(event) => void handleDrop(event, null)}>
        <button className={selectedId === null ? 'folder-tree__item folder-tree__item--selected' : 'folder-tree__item'} onClick={() => onSelectedIdChange(null)}><span className="folder-tree__name">root</span><RuleCount folderId={null} rules={rules} folders={folders} /></button>
      </div>
      {folders.filter((folder) => folder.parentId === null).map((folder) => <FolderNode key={folder.id} folder={folder} folders={folders} rules={rules} selectedId={selectedId} dropTarget={dropTarget} deleteConfirmationId={deleteConfirmationId} collapsedFolderIds={collapsedFolderIds} onSelect={onSelectedIdChange} onToggle={toggleFolder} onBeginDrag={beginDrag} onDragOver={handleDragOver} onDragLeave={() => setDropTarget(undefined)} onDrop={handleDrop} onSave={onSave} onDelete={onDelete} onDeleteConfirmationChange={setDeleteConfirmationId} />)}
      {!folders.length && <p className="muted folder-tree__empty">拖拽 API 到“root”以归类，或点击右上角新建文件夹。</p>}
    </div>
  </section>
}

function FolderNode({ folder, folders, rules, selectedId, dropTarget, deleteConfirmationId, collapsedFolderIds, onSelect, onToggle, onBeginDrag, onDragOver, onDragLeave, onDrop, onSave, onDelete, onDeleteConfirmationChange }: { folder: Folder; folders: Folder[]; rules: MockRule[]; selectedId: string | null; dropTarget: string | null | undefined; deleteConfirmationId?: string; collapsedFolderIds: Set<string>; onSelect: (id: string) => void; onToggle: (id: string) => void; onBeginDrag: (event: DragEvent<HTMLElement>, payload: DragPayload) => void; onDragOver: (event: DragEvent<HTMLElement>, targetId: string | null) => void; onDragLeave: () => void; onDrop: (event: DragEvent<HTMLElement>, targetId: string | null) => Promise<void>; onSave: (folder: Folder) => Promise<void>; onDelete: (id: string) => Promise<void>; onDeleteConfirmationChange: (id?: string) => void }) {
  const children = folders.filter((item) => item.parentId === folder.id)
  const hasChildren = children.length > 0
  const collapsed = collapsedFolderIds.has(folder.id)
  return <div className="folder-tree__branch">
    <div className={dropTarget === folder.id ? 'folder-tree__drop-zone folder-tree__drop-zone--active' : 'folder-tree__drop-zone'} draggable onDragStart={(event) => onBeginDrag(event, { type: 'folder', id: folder.id })} onDragOver={(event) => onDragOver(event, folder.id)} onDragLeave={onDragLeave} onDrop={(event) => void onDrop(event, folder.id)}>
      <div className="folder-tree__row" onMouseLeave={() => { if (deleteConfirmationId === folder.id) onDeleteConfirmationChange(undefined) }}>
        {hasChildren ? <button className="folder-tree__expand" type="button" aria-label={`${collapsed ? '展开' : '收起'}文件夹 ${folder.name}`} aria-expanded={!collapsed} onClick={(event) => { event.stopPropagation(); onToggle(folder.id) }}><svg viewBox="0 0 16 16" aria-hidden="true"><polyline points={collapsed ? '6,3 11,8 6,13' : '3,6 8,11 13,6'} /></svg></button> : <span className="folder-tree__expand-placeholder" aria-hidden="true" />}
        <button className={selectedId === folder.id ? 'folder-tree__item folder-tree__item--selected' : 'folder-tree__item'} title={folder.name} onClick={() => onSelect(folder.id)} onDoubleClick={() => renameFolder(folder, onSave)}><span className="folder-tree__name">{folder.name}</span><RuleCount folderId={folder.id} rules={rules} folders={folders} /></button><IconButton icon={deleteConfirmationId === folder.id ? 'check' : 'trash'} className={deleteConfirmationId === folder.id ? 'folder-tree__delete folder-tree__delete--confirm' : 'folder-tree__delete'} label={deleteConfirmationId === folder.id ? `确认删除文件夹 ${folder.name}` : `删除文件夹 ${folder.name}`} onClick={() => { if (deleteConfirmationId === folder.id) { onDeleteConfirmationChange(undefined); void onDelete(folder.id) } else onDeleteConfirmationChange(folder.id) }} />
      </div>
    </div>
    {!collapsed && children.map((child) => <FolderNode key={child.id} folder={child} folders={folders} rules={rules} selectedId={selectedId} dropTarget={dropTarget} deleteConfirmationId={deleteConfirmationId} collapsedFolderIds={collapsedFolderIds} onSelect={onSelect} onToggle={onToggle} onBeginDrag={onBeginDrag} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onSave={onSave} onDelete={onDelete} onDeleteConfirmationChange={onDeleteConfirmationChange} />)}
  </div>
}

function RuleCount({ folderId, rules, folders }: { folderId: string | null; rules: MockRule[]; folders: Folder[] }) {
  const folderRules = rules.filter((rule) => rule.folderId === folderId)
  const enabledCount = folderRules.filter((rule) => isRuleActive(rule, folders)).length
  return <span className={enabledCount > 0 ? 'folder-tree__count folder-tree__count--active' : 'folder-tree__count'}>({enabledCount} / {folderRules.length})</span>
}

function readPayload(event: DragEvent<HTMLElement>): DragPayload | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData('application/x-api-mook-item')) as DragPayload
    return value && (value.type === 'folder' || value.type === 'rule') && typeof value.id === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

function canDrop(payload: DragPayload, targetId: string | null, folders: Folder[]): boolean {
  if (payload.type === 'rule') return true
  return payload.id !== targetId && !isDescendant(targetId, payload.id, folders)
}

function isDescendant(id: string | null, ancestorId: string, folders: Folder[]): boolean {
  let currentId = id
  while (currentId) {
    const folder = folders.find((item) => item.id === currentId)
    if (!folder) return false
    if (folder.id === ancestorId) return true
    currentId = folder.parentId
  }
  return false
}

function renameFolder(folder: Folder, onSave: (folder: Folder) => Promise<void>): void {
  const name = window.prompt('文件夹名称', folder.name)?.trim()
  if (name && name !== folder.name) void onSave({ ...folder, name })
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2h8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /></svg>
}
