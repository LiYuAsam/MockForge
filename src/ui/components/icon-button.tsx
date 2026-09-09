import type { ButtonHTMLAttributes } from 'react'

type IconName = 'chevronLeft' | 'chevronRight' | 'plus' | 'trash' | 'check' | 'close' | 'refresh' | 'history' | 'panelLeft' | 'panelRight' | 'attachment'

export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button {...props} className={`icon-button ${className}`} aria-label={label} title={label}>{icon === 'trash' ? <TrashIcon /> : icon === 'plus' ? <PlusIcon /> : icon === 'check' ? <CheckIcon /> : icon === 'close' ? <CloseIcon /> : icon === 'refresh' ? <RefreshIcon /> : icon === 'history' ? <HistoryIcon /> : icon === 'attachment' ? <AttachmentIcon /> : icon === 'panelLeft' ? <PanelIcon direction="left" /> : icon === 'panelRight' ? <PanelIcon direction="right" /> : <ChevronIcon direction={icon === 'chevronLeft' ? 'left' : 'right'} />}</button>
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const points = direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'
  return <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points={points} /></svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13" /></svg>
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" /></svg>
}

function HistoryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5M12 8v4l3 2" /></svg>
}

function PanelIcon({ direction }: { direction: 'left' | 'right' }) {
  const x = direction === 'left' ? 8 : 16
  const points = direction === 'left' ? '14 8 10 12 14 16' : '10 8 14 12 10 16'
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><line x1={x} y1="4" x2={x} y2="20" /><polyline points={points} /></svg>
}

function AttachmentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 6.5-6.5a3.5 3.5 0 1 1 5 5L11 19a5 5 0 0 1-7-7l8-8" /></svg>
}
