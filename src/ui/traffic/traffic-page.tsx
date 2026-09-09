import { useCallback, useEffect, useState } from 'react'
import type { TrafficEntry } from '../../core/models'
import type { RuntimeMessage, RuntimeResponse } from '../../shared/messages'
import { IconButton } from '../components/icon-button'

export function TrafficPage({ onCreateMock, onEditMock }: { onCreateMock: (entry: TrafficEntry) => void; onEditMock: (ruleId: string) => void }) {
  const [traffic, setTraffic] = useState<TrafficEntry[]>([])
  const [filter, setFilter] = useState('')
  const refresh = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TRAFFIC' } satisfies RuntimeMessage) as RuntimeResponse
    if (response.ok && 'traffic' in response) setTraffic(response.traffic.sort((left, right) => right.startedAt - left.startedAt))
  }, [])
  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(id) }, [refresh])
  const rows = traffic.filter((item) => `${item.method} ${item.url}`.toLowerCase().includes(filter.toLowerCase()))

  return <section className="panel">
    <div className="row row--space"><div><h2 className="panel__title">fetch / XHR 流量</h2><p className="muted">仅记录页面 fetch 和 XHR；全部 HTTP 监听将在后续更新。</p></div><div className="row"><IconButton icon="refresh" label="刷新流量" onClick={() => void refresh()} /><IconButton icon="trash" className="icon-button--danger" label="清空流量" onClick={() => void clearTraffic(refresh)} /></div></div>
    <div className="traffic-filter">
      <svg className="traffic-filter__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
      <input className="traffic-filter__input" placeholder="按 URL 或方法筛选…" value={filter} onChange={(event) => setFilter(event.target.value)} />
      {filter && <button className="traffic-filter__clear" type="button" aria-label="清除筛选" onClick={() => setFilter('')}>×</button>}
    </div>
    <div className="traffic-table-scroll"><table className="traffic-table"><thead><tr><th className="traffic-marker" aria-label="Mock 状态" /><th>方法</th><th>请求</th><th className="traffic-action">操作</th></tr></thead><tbody>
      {rows.map((item) => {
        const mockedRuleId = item.decision === 'mocked' ? item.matchedRuleId : undefined
        return <tr key={item.id}><td className="traffic-marker">{mockedRuleId && <span className="traffic-mock-marker" title="此请求已由 Mock 规则响应" />}</td><td>{item.method}</td><td className="traffic-url" title={item.url}>{item.url}</td><td className="traffic-action">{mockedRuleId ? <button className="button button--warning" onClick={() => onEditMock(mockedRuleId)}>修改</button> : <button className="button button--ghost" onClick={() => onCreateMock(item)}>创建 Mock</button>}</td></tr>
      })}
    </tbody></table></div>
    {!rows.length && <div className="empty">尚未观察到请求。访问页面或触发一次接口调用后再查看。</div>}
  </section>
}

async function clearTraffic(done: () => Promise<void>): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'CLEAR_TRAFFIC' } satisfies RuntimeMessage)
  await done()
}
