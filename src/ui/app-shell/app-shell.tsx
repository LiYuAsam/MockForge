import { useEffect, useState } from 'react'
import type { TrafficEntry } from '../../core/models'
import { ChatPage } from '../chat/chat-page'
import { RulesPage } from '../rules/rules-page'
import { SettingsPage } from '../settings/settings-page'
import { TrafficPage } from '../traffic/traffic-page'
import { workspaceTabs, type WorkspaceTab } from './tab-types'
import { useWorkspaceData } from './use-workspace-data'
import '../styles/app.css'

type AppShellProps = { compact?: boolean; showScrollTop?: boolean }

export function AppShell({ compact = false, showScrollTop = false }: AppShellProps) {
  const [tab, setTab] = useState<WorkspaceTab>('traffic')
  const [selectedRuleId, setSelectedRuleId] = useState<string>()
  const [scrollTopVisible, setScrollTopVisible] = useState(false)
  const data = useWorkspaceData()

  useEffect(() => {
    if (!showScrollTop) return
    const updateVisibility = () => setScrollTopVisible(window.scrollY > 240)
    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [showScrollTop])

  return <main className={compact ? 'app app--compact' : 'app'}>
    {!compact && <header className="app__header app__header--actions"><button className="button button--ghost" onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })}>固定到侧边栏</button></header>}
    <nav className="tabs" aria-label="功能导航">
      {workspaceTabs.map((item) => <button key={item.id} className={tab === item.id ? 'tabs__item tabs__item--active' : 'tabs__item'} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    <section className="app__content">
      {tab === 'rules' && <RulesPage data={data} selectedId={selectedRuleId} onSelectedIdChange={setSelectedRuleId} />}
      {tab === 'traffic' && <TrafficPage onCreateMock={(entry) => void createFromTraffic(entry, data.createRuleFromTraffic, setSelectedRuleId, setTab)} onEditMock={(ruleId) => { setSelectedRuleId(ruleId); setTab('rules') }} />}
      <div hidden={tab !== 'chat'}><ChatPage rules={data.rules} folders={data.folders} onSaveRule={data.saveRule} onDeleteRule={data.deleteRule} /></div>
      {tab === 'settings' && <SettingsPage />}
    </section>
    {showScrollTop && scrollTopVisible && <button className="app-scroll-top" title="返回顶部" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>}
  </main>
}

async function createFromTraffic(entry: TrafficEntry, createRule: (traffic: TrafficEntry) => Promise<{ id: string }>, selectRule: (id: string) => void, selectTab: (tab: WorkspaceTab) => void): Promise<void> {
  const rule = await createRule(entry)
  selectRule(rule.id)
  selectTab('rules')
}
