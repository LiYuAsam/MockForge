import type { UrlMode } from '../models'

export function matchesUrl(candidate: string, pattern: string, mode: UrlMode): boolean {
  try {
    if (mode === 'exact') return candidate === pattern
    if (mode === 'prefix') return candidate.startsWith(pattern)
    if (mode === 'wildcard') return new RegExp(`^${escapeWildcard(pattern)}$`).test(candidate)
    return new RegExp(pattern).test(candidate)
  } catch {
    return false
  }
}

export function specificity(mode: UrlMode): number {
  return { exact: 4, prefix: 3, wildcard: 2, regex: 1 }[mode]
}

function escapeWildcard(pattern: string): string {
  return pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
}
