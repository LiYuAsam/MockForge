export type WorkspaceTab = 'rules' | 'traffic' | 'chat' | 'settings'

export const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'traffic', label: '流量监听' },
  { id: 'rules', label: 'Mock 规则' },
  { id: 'chat', label: 'AI 助手' },
  { id: 'settings', label: '设置' },
]
