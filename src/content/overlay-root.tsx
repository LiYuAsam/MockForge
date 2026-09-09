import { createRoot, type Root } from 'react-dom/client'
import { useRef, useState } from 'react'
import appStyles from '../ui/styles/app.css?inline'
import { AppShell } from '../ui/app-shell/app-shell'
import { ResizeHandles } from './resize-handles'
import { useOverlayLayout } from './overlay-layout'

const ROOT_ID = 'api-mook-overlay-root'
let overlayHost: HTMLDivElement | undefined
let overlayRoot: Root | undefined

export function mountOverlay(): void {
  if (document.getElementById(ROOT_ID)) return
  const host = document.createElement('div')
  host.id = ROOT_ID
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `${appStyles}\n:host { display:block; } .app { min-height:100%; background:#f6f8fb; } .mook-float { position:fixed; min-height:480px; overflow-x:hidden; overflow-y:auto; border:1px solid #d7e0ec; border-radius:12px; background:#f6f8fb; box-shadow:0 14px 40px rgba(15,23,42,.25); } .mook-titlebar { height:14px; cursor:move; touch-action:none; background:#eaf0f8; } .mook-trigger { position:fixed; border:0; border-radius:999px; background:#2563eb; color:white; width:52px; height:52px; box-shadow:0 8px 24px rgba(37,99,235,.38); font-weight:700; cursor:move; touch-action:none; } .mook-close,.mook-side-panel { position:absolute; top:19px; z-index:10; border:0; border-radius:50%; width:26px; height:26px; background:#e2e8f0; color:#334155; } .mook-close { right:8px; } .mook-side-panel { right:42px; display:grid; place-items:center; } .mook-side-panel:hover { background:#cbd5e1; } .mook-side-panel svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; } .mook-scroll-top { position:fixed; z-index:11; border:0; border-radius:50%; width:36px; height:36px; background:#2563eb; color:white; box-shadow:0 5px 15px rgba(37,99,235,.32); font-size:20px; line-height:1; } .mook-resize { position:absolute; z-index:3; touch-action:none; } .mook-resize--n,.mook-resize--s { left:10px; right:10px; height:8px; cursor:ns-resize; } .mook-resize--n { top:-4px; }.mook-resize--s { bottom:-4px; }.mook-resize--e,.mook-resize--w { top:10px; bottom:10px; width:8px; cursor:ew-resize; }.mook-resize--e { right:-4px; }.mook-resize--w { left:-4px;}.mook-resize--ne,.mook-resize--nw,.mook-resize--se,.mook-resize--sw { width:14px; height:14px; }.mook-resize--ne { top:-5px;right:-5px;cursor:nesw-resize;}.mook-resize--nw { top:-5px;left:-5px;cursor:nwse-resize;}.mook-resize--se { bottom:-5px;right:-5px;cursor:nwse-resize;}.mook-resize--sw { bottom:-5px;left:-5px;cursor:nesw-resize;}`
  style.textContent += '\n.mook-trigger { overflow:hidden; padding:0; } .mook-trigger img { display:block; width:100%; height:100%; object-fit:cover; }'
  const root = document.createElement('div')
  shadow.append(style, root)
  document.documentElement.append(host)
  overlayHost = host
  overlayRoot = createRoot(root)
  overlayRoot.render(<Overlay />)
}

export function unmountOverlay(): void {
  overlayRoot?.unmount()
  overlayRoot = undefined
  overlayHost?.remove()
  overlayHost = undefined
}

function Overlay() {
  const [open, setOpen] = useState(false)
  const { layout, triggerPosition, startDrag, startResize, startTriggerDrag, fitForOpen } = useOverlayLayout()
  const triggerWasDragged = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const panelPosition = { left: layout.left, top: layout.top }
  if (!open) return <button className="mook-trigger" style={triggerPosition} title="拖动图标调整位置，点击打开 API Mook" onPointerDown={(event) => { triggerWasDragged.current = false; startTriggerDrag(event, () => { triggerWasDragged.current = true }) }} onClick={() => { if (!triggerWasDragged.current) { fitForOpen(); setOpen(true) } }}><img src={chrome.runtime.getURL('icons/api-mook-128.png')} alt="API Mook" /></button>
  return <div ref={panelRef} className="mook-float" style={{ ...panelPosition, width: layout.width, height: layout.height }} onScroll={(event) => setShowScrollTop(event.currentTarget.scrollTop > 240)}><div className="mook-titlebar" title="拖动以移动面板" onPointerDown={startDrag} /><button className="mook-side-panel" title="切换到侧边栏" aria-label="切换到侧边栏" onClick={() => { void chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).then((response: { ok?: boolean }) => { if (response.ok) setOpen(false) }).catch(() => undefined) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM14 5v14M9 12h5m-2-3 3 3-3 3" /></svg></button><button className="mook-close" title="收起面板" onClick={() => setOpen(false)}>×</button><ResizeHandles onResize={startResize} /><AppShell compact />{showScrollTop && <button className="mook-scroll-top" style={{ left: layout.left + layout.width - 52, top: layout.top + layout.height - 52 }} title="返回顶部" onClick={() => panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>}</div>
}
