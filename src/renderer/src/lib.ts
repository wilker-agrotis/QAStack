import type { Suite, SuiteStatus } from '@shared/types'

export function formatTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function suiteStatus(suite: Suite, running: boolean): SuiteStatus {
  if (running) return 'running'
  if (suite.cases.some((c) => c.status === 'failed')) return 'failed'
  if (suite.cases.some((c) => c.status === 'passed')) return 'passed'
  return 'idle'
}

/** Casa o arquivo vindo do reporter com o da descoberta (podem ter raízes diferentes). */
export function sameFile(a: string, b: string): boolean {
  const x = a.replace(/\\/g, '/')
  const y = b.replace(/\\/g, '/')
  return x === y || x.endsWith('/' + y) || y.endsWith('/' + x)
}

export function caseTitleFromKey(key: string): string {
  const i = key.indexOf('::')
  return i >= 0 ? key.slice(i + 2) : key
}
