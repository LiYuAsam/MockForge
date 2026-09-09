import { useRef, useState } from 'react'
import { exportRules, importRules } from '../../core/storage/transfer'

export function TransferActions({ onImported, compact = false }: { onImported: () => Promise<void>; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const actions = <><button className="button button--ghost" onClick={() => void exportRules()}>导出 JSON</button><button className="button button--ghost" onClick={() => input.current?.click()}>导入 JSON</button><input hidden ref={input} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void importRules(file).then(onImported).then(() => setNotice('导入完成（同 ID 规则会覆盖）。')).catch((error: unknown) => setNotice(error instanceof Error ? error.message : '导入失败')).finally(() => { event.target.value = '' }) }} /></>
  if (compact) return <div className="row transfer-actions__compact">{actions}{notice && <span className="muted">{notice}</span>}</div>
  return <section className="panel"><h2 className="panel__title">规则文件</h2><div className="row transfer-actions__buttons">{actions}</div>{notice && <p className="muted">{notice}</p>}</section>
}
