import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ResizeEdge } from './overlay-layout'

const edges: ResizeEdge[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

export function ResizeHandles({ onResize }: { onResize: (edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>) => void }) {
  return <>{edges.map((edge) => <span key={edge} className={`mook-resize mook-resize--${edge}`} onPointerDown={(event) => onResize(edge, event)} />)}</>
}
