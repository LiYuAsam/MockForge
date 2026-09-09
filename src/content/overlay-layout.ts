import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type OverlayLayout = { left: number; top: number; width: number; height: number }
export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const STORAGE_KEY = 'overlayLayout'
const TRIGGER_STORAGE_KEY = 'overlayTriggerPosition'
// 180px sidebar + 12px gap + 338px content + 28px app padding + 2px border.
const MIN_WIDTH = 560
const MIN_HEIGHT = 480
const KEEP_VISIBLE = 48
const TRIGGER_SIZE = 52

export function useOverlayLayout() {
  const [layout, setLayout] = useState<OverlayLayout>(() => defaultLayout())
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const [triggerPosition, setTriggerPosition] = useState(() => defaultTriggerPosition())
  const triggerPositionRef = useRef(triggerPosition)
  triggerPositionRef.current = triggerPosition

  useEffect(() => {
    void chrome.storage.local.get(STORAGE_KEY).then((value) => {
      const stored = value[STORAGE_KEY] as Partial<OverlayLayout> | undefined
      if (stored && isLayout(stored)) setLayout(clamp(stored as OverlayLayout))
    })
  }, [])

  useEffect(() => {
    void chrome.storage.local.get(TRIGGER_STORAGE_KEY).then((value) => {
      const stored = value[TRIGGER_STORAGE_KEY] as Partial<Pick<OverlayLayout, 'left' | 'top'>> | undefined
      if (stored && isPosition(stored)) setTriggerPosition(clampTrigger(stored))
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void chrome.storage.local.set({ [STORAGE_KEY]: layout }), 180)
    return () => window.clearTimeout(timer)
  }, [layout])

  useEffect(() => {
    const timer = window.setTimeout(() => void chrome.storage.local.set({ [TRIGGER_STORAGE_KEY]: triggerPosition }), 180)
    return () => window.clearTimeout(timer)
  }, [triggerPosition])

  function startDrag(event: ReactPointerEvent<HTMLElement>, onMoved?: () => void, allowInteractiveTarget = false): void {
    if (!allowInteractiveTarget && (event.target as HTMLElement).closest('button, input, textarea, select')) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, layout: layoutRef.current }
    let moved = false
    track(event, (move) => {
      if (!moved && Math.abs(move.clientX - start.x) + Math.abs(move.clientY - start.y) > 4) {
        moved = true
        onMoved?.()
      }
      setLayout(clamp({ ...start.layout, left: start.layout.left + move.clientX - start.x, top: start.layout.top + move.clientY - start.y }))
    })
  }

  function startResize(edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>): void {
    event.preventDefault()
    event.stopPropagation()
    const start = { x: event.clientX, y: event.clientY, layout: layoutRef.current }
    track(event, (move) => setLayout(clamp(resize(start.layout, edge, move.clientX - start.x, move.clientY - start.y))))
  }

  function startTriggerDrag(event: ReactPointerEvent<HTMLElement>, onMoved?: () => void): void {
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, position: triggerPositionRef.current }
    let moved = false
    track(event, (move) => {
      if (!moved && Math.abs(move.clientX - start.x) + Math.abs(move.clientY - start.y) > 4) {
        moved = true
        onMoved?.()
      }
      setTriggerPosition(clampTrigger({ left: start.position.left + move.clientX - start.x, top: start.position.top + move.clientY - start.y }))
    })
  }

  function fitForOpen(): void {
    setLayout((current) => ({
      ...current,
      left: Math.min(Math.max(current.left, 0), Math.max(0, window.innerWidth - current.width)),
      top: Math.min(Math.max(current.top, 0), Math.max(0, window.innerHeight - current.height)),
    }))
  }

  return { layout, triggerPosition, startDrag, startResize, startTriggerDrag, fitForOpen }
}

function track(event: ReactPointerEvent<HTMLElement>, move: (event: PointerEvent) => void): void {
  const target = event.currentTarget
  target.setPointerCapture(event.pointerId)
  const onMove = (item: PointerEvent) => move(item)
  const stop = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', stop); target.removeEventListener('pointercancel', stop) }
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
}

function resize(layout: OverlayLayout, edge: ResizeEdge, dx: number, dy: number): OverlayLayout {
  const next = { ...layout }
  if (edge.includes('e')) next.width += dx
  if (edge.includes('s')) next.height += dy
  if (edge.includes('w')) { next.left += dx; next.width -= dx }
  if (edge.includes('n')) { next.top += dy; next.height -= dy }
  if (next.width < MIN_WIDTH && edge.includes('w')) next.left -= MIN_WIDTH - next.width
  if (next.height < MIN_HEIGHT && edge.includes('n')) next.top -= MIN_HEIGHT - next.height
  next.width = Math.max(MIN_WIDTH, next.width)
  next.height = Math.max(MIN_HEIGHT, next.height)
  return next
}

function defaultLayout(): OverlayLayout {
  return { ...defaultTriggerPosition(), width: 680, height: 640 }
}

function defaultTriggerPosition(): Pick<OverlayLayout, 'left' | 'top'> {
  // The collapsed trigger starts 16px from the viewport's bottom-right corner.
  return { left: Math.max(0, window.innerWidth - 68), top: Math.max(0, window.innerHeight - 68) }
}

function clampTrigger(position: Pick<OverlayLayout, 'left' | 'top'>): Pick<OverlayLayout, 'left' | 'top'> {
  return {
    left: Math.min(Math.max(position.left, 0), Math.max(0, window.innerWidth - TRIGGER_SIZE)),
    top: Math.min(Math.max(position.top, 0), Math.max(0, window.innerHeight - TRIGGER_SIZE)),
  }
}

function clamp(layout: OverlayLayout): OverlayLayout {
  const width = Math.max(layout.width, MIN_WIDTH)
  const height = Math.max(layout.height, MIN_HEIGHT)
  return {
    width,
    height,
    left: Math.min(Math.max(layout.left, KEEP_VISIBLE - width), window.innerWidth - KEEP_VISIBLE),
    top: Math.min(Math.max(layout.top, 0), window.innerHeight - KEEP_VISIBLE),
  }
}

function isLayout(value: Partial<OverlayLayout>): value is OverlayLayout {
  return [value.left, value.top, value.width, value.height].every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isPosition(value: Partial<Pick<OverlayLayout, 'left' | 'top'>>): value is Pick<OverlayLayout, 'left' | 'top'> {
  return [value.left, value.top].every((item) => typeof item === 'number' && Number.isFinite(item))
}
