import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Folder, MockRule, UrlMode } from '../../core/models'
import type { RuleConflict } from '../../core/rules/conflicts'
import { ToggleSwitch } from '../components/toggle-switch'

type RuleEditorProps = {
  rule: MockRule
  folders: Folder[]
  conflicts: RuleConflict[]
  onSave: (rule: MockRule) => Promise<void>
}

export function RuleEditor({ rule, folders, conflicts, onSave }: RuleEditorProps) {
  const [draft, setDraft] = useState(rule)
  const [bodyText, setBodyText] = useState(stringify(rule.response.body))
  const [queryText, setQueryText] = useState(formatQuery(rule.match.query))
  const [requestBodyText, setRequestBodyText] = useState(formatRequestBody(rule.match.requestBodyMatcher))
  const [notice, setNotice] = useState('')
  const savedSignature = useRef(signature(rule))

  useEffect(() => {
    setDraft(rule)
    setBodyText(stringify(rule.response.body))
    setQueryText(formatQuery(rule.match.query))
    setRequestBodyText(formatRequestBody(rule.match.requestBodyMatcher))
    savedSignature.current = signature(rule)
    setNotice('')
  }, [rule.id])

  const candidate = useMemo(() => parseCandidate(draft, bodyText, queryText, requestBodyText), [draft, bodyText, queryText, requestBodyText])
  useEffect(() => {
    if (!candidate.ok) { setNotice(candidate.field === 'request' ? '请求 Body JSON 格式无效，修正后将自动保存。' : candidate.field === 'query' ? 'Query 参数 JSON 格式无效，修正后将自动保存。' : 'JSON 响应体格式无效，修正后将自动保存。'); return }
    const nextSignature = signature(candidate.rule)
    if (nextSignature === savedSignature.current) return
    setNotice('正在自动保存…')
    const timer = window.setTimeout(() => {
      void onSave(candidate.rule).then(() => {
        savedSignature.current = nextSignature
        setNotice(conflicts.length ? '已自动保存；该规则仍与其他规则存在重叠。' : '已自动保存')
      }).catch(() => setNotice('自动保存失败，请检查后重试。'))
    }, 550)
    return () => window.clearTimeout(timer)
  }, [candidate, conflicts.length, onSave])

  return <section className="panel">
    <div className="row row--space"><div><h2 className="panel__title">修改接口</h2><span className="muted">{notice || '编辑内容将自动保存'}</span></div><ToggleSwitch checked={draft.enabled} label="启用" onChange={(enabled) => setDraft({ ...draft, enabled })} /></div>
    {conflicts.length > 0 && <div className="list-item list-item--warn" style={{ marginBottom: 12 }}>此规则有 {conflicts.length} 条{conflicts.some((item) => item.level === 'duplicate') ? '明确重复' : '可能冲突'}规则。最终命中会按 URL 精确度、优先级和更新时间选择。</div>}
    <div className="form-grid">
      <Field label="规则名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
      <Field label="文件夹"><select value={draft.folderId ?? ''} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || null })}><option value="">root</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field>
      <Field label="请求方法"><select value={draft.match.methods[0]} onChange={(event) => { const method = event.target.value; setDraft({ ...draft, match: { ...draft.match, methods: [method], ...(canCarryBody(method) ? {} : { requestBodyMatcher: undefined }) } }) }}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <option key={method}>{method}</option>)}</select></Field>
      <Field label="URL 模式"><select value={draft.match.urlMode} onChange={(event) => setDraft({ ...draft, match: { ...draft.match, urlMode: event.target.value as UrlMode } })}>{['exact', 'prefix', 'wildcard', 'regex'].map((mode) => <option key={mode}>{mode}</option>)}</select></Field>
      <Field label="请求 URL" full><input placeholder="https://api.example.com/users" value={draft.match.url} onChange={(event) => setDraft({ ...draft, match: { ...draft.match, url: event.target.value } })} /></Field>
      <QueryField value={queryText} invalid={!candidate.ok && candidate.field === 'query'} onChange={setQueryText} />
      {canCarryBody(draft.match.methods[0]) && <RequestBodyField value={requestBodyText} invalid={!candidate.ok && candidate.field === 'request'} onChange={setRequestBodyText} />}
      <Field label="响应状态码"><input type="number" value={draft.response.status} onChange={(event) => setDraft({ ...draft, response: { ...draft.response, status: Number(event.target.value) } })} /></Field>
      <Field label="延迟（ms）"><input type="number" min="0" value={draft.response.delayMs} onChange={(event) => setDraft({ ...draft, response: { ...draft.response, delayMs: Number(event.target.value) } })} /></Field>
      <Field label="响应类型"><select value={draft.response.bodyType} onChange={(event) => setDraft({ ...draft, response: { ...draft.response, bodyType: event.target.value as MockRule['response']['bodyType'] } })}><option value="json">JSON</option><option value="text">文本</option><option value="empty">空响应</option></select></Field>
      <Field label="优先级"><input type="number" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} /></Field>
      <Field label="响应体" full><textarea rows={8} value={bodyText} onChange={(event) => setBodyText(event.target.value)} placeholder="JSON 响应内容" /></Field>
      <HeaderField label="Request Header" enabled={Boolean(draft.requestRewrite?.enabled)} onEnabledChange={(enabled) => setDraft({ ...draft, requestRewrite: { enabled, headers: draft.requestRewrite?.headers ?? {} } })} value={formatHeaders(draft.requestRewrite?.headers ?? {})} onChange={(value) => setDraft({ ...draft, requestRewrite: { enabled: draft.requestRewrite?.enabled ?? false, headers: parseHeaders(value) } })} hint="未启用时保留页面原始请求 Header。" />
      <HeaderField label="Response Header" enabled={Boolean(draft.response.headersEnabled)} onEnabledChange={(enabled) => setDraft({ ...draft, response: { ...draft.response, headersEnabled: enabled } })} value={formatHeaders(draft.response.headers)} onChange={(value) => setDraft({ ...draft, response: { ...draft.response, headers: parseHeaders(value) } })} hint="未启用时仅自动补充 Content-Type。" />
    </div>
  </section>
}

function HeaderField({ label, enabled, onEnabledChange, value, onChange, hint }: { label: string; enabled: boolean; onEnabledChange: (enabled: boolean) => void; value: string; onChange: (value: string) => void; hint: string }) {
  return <div className="field form-grid--full"><div className="header-field__title"><strong>{label}</strong><label><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />启用</label></div><textarea disabled={!enabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder="每行 key: value" /><span className="muted">{hint}</span></div>
}

function QueryField({ value, invalid, onChange }: { value: string; invalid: boolean; onChange: (value: string) => void }) {
  return <label className="field form-grid--full"><span>Query 参数（JSON）</span><textarea className={invalid ? 'field__input--invalid' : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={'例如：\n{\n  "page": 1,\n  "size": 20\n}'} /><span className={invalid ? 'field__error' : 'muted'}>{invalid ? 'Query JSON 格式校验失败，请修正后再保存。' : 'Query 参数可用于任意请求方法；对象中的值会按字符串与 URL 原始 Query 参数匹配。'}</span></label>
}

function RequestBodyField({ value, invalid, onChange }: { value: string; invalid: boolean; onChange: (value: string) => void }) {
  return <label className="field form-grid--full"><span>请求 Body（JSON）</span><textarea className={invalid ? 'field__input--invalid' : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={'例如：\n{\n  "grant_type": "client_credentials"\n}'} /><span className={invalid ? 'field__error' : 'muted'}>{invalid ? 'JSON 格式校验失败，请修正后再保存。' : '仅当请求 Body 中包含此 JSON 结构时才命中；留空则不限制请求 Body。'}</span></label>
}

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) { return <label className={full ? 'field form-grid--full' : 'field'}><span>{label}</span>{children}</label> }
function stringify(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
function formatHeaders(headers: Record<string, string>): string { return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n') }
function parseHeaders(value: string): Record<string, string> { return Object.fromEntries(value.split('\n').map((line) => line.split(/:(.*)/)).filter(([key, item]) => key.trim() && item !== undefined).map(([key, item]) => [key.trim(), item.trim()])) }
function signature(rule: MockRule): string { const { metadata: _metadata, ...content } = rule; return JSON.stringify(content) }
function formatQuery(value: Record<string, string> | undefined): string { return value && Object.keys(value).length ? JSON.stringify(value, null, 2) : '' }
function formatRequestBody(value: string | undefined): string { if (!value) return ''; try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value } }
function canCarryBody(method: string): boolean { return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) }
function parseCandidate(draft: MockRule, bodyText: string, queryText: string, requestBodyText: string): { ok: true; rule: MockRule } | { ok: false; field: 'response' | 'query' | 'request' } {
  let responseBody: unknown
  try { responseBody = draft.response.bodyType === 'json' ? JSON.parse(bodyText) : bodyText } catch { return { ok: false, field: 'response' } }
  let query: Record<string, string> | undefined
  try { query = parseQuery(queryText) } catch { return { ok: false, field: 'query' } }
  let requestBodyMatcher = draft.match.requestBodyMatcher
  if (canCarryBody(draft.match.methods[0]) && requestBodyText.trim()) {
    try { requestBodyMatcher = JSON.stringify(JSON.parse(requestBodyText)) } catch { return { ok: false, field: 'request' } }
  } else if (canCarryBody(draft.match.methods[0])) requestBodyMatcher = undefined
  return { ok: true, rule: { ...draft, match: { ...draft.match, query, requestBodyMatcher }, response: { ...draft.response, body: responseBody } } }
}

function parseQuery(value: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined
  const parsed: unknown = JSON.parse(value)
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Query 必须是 JSON 对象')
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => {
    if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') throw new Error('Query 值必须是字符串、数字或布尔值')
    return [key, String(item)]
  }))
}
