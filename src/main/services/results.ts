import type { CaseStatus, Suite, TestEvent } from '@shared/types'

// Último resultado de cada caso e de cada suíte, guardado só em memória enquanto o app
// está aberto. Sobrevive a novas execuções de outras suítes e ao Sync (nova descoberta),
// e é apagado ao fechar o programa, ao clicar em "Limpar resultados" ou em "Rodar Tudo".

interface CaseResult {
  file: string
  title: string
  status: CaseStatus
  durationMs?: number
  error?: string
  at: string
}

interface SuiteResult {
  elapsedSec: number
  at: string
}

let data: { cases: Record<string, CaseResult>; suites: Record<string, SuiteResult> } = { cases: {}, suites: {} }

function load() {
  return data
}

export function clearResults(): void {
  data = { cases: {}, suites: {} }
}

const norm = (f: string) => f.replace(/\\/g, '/')
const sameFile = (a: string, b: string) => {
  const x = norm(a)
  const y = norm(b)
  return x === y || x.endsWith('/' + y) || y.endsWith('/' + x)
}

/** Acompanha uma execução para gravar resultados e o tempo de cada suíte. */
export class RunRecorder {
  private failed = new Set<string>()
  private fileStart = new Map<string, number>()
  private fileDone = new Set<string>()
  private expected = new Map<string, number>()
  private finished = new Map<string, number>()

  onEvent(ev: TestEvent): void {
    if (ev.type === 'begin') {
      for (const t of ev.tests ?? []) this.expected.set(t.file, (this.expected.get(t.file) ?? 0) + 1)
      return
    }
    const now = Date.now()
    if (ev.type === 'testBegin') {
      if (!this.fileStart.has(ev.file)) this.fileStart.set(ev.file, now)
      return
    }
    const data = load()
    // o mesmo caso pode rodar em vários projetos (navegadores): falha prevalece na mesma execução
    const already = this.failed.has(ev.key)
    const status: CaseStatus = already ? 'failed' : ev.status === 'passed' ? 'passed' : ev.status === 'skipped' ? 'skipped' : 'failed'
    if (status === 'failed') this.failed.add(ev.key)
    const prev = data.cases[ev.key]
    const i = ev.key.indexOf('::')
    data.cases[ev.key] = {
      file: ev.file,
      title: i >= 0 ? ev.key.slice(i + 2) : ev.key,
      status,
      durationMs: ev.durationMs,
      error: status === 'failed' ? ev.error ?? (already ? prev?.error : undefined) : undefined,
      at: new Date(now).toISOString()
    }
    const n = (this.finished.get(ev.file) ?? 0) + 1
    this.finished.set(ev.file, n)
    if (n >= (this.expected.get(ev.file) ?? Infinity)) this.markDone(ev.file)
    const start = this.fileStart.get(ev.file) ?? now
    data.suites[ev.file] = { elapsedSec: Math.round((now - start) / 1000), at: new Date(now).toISOString() }
  }

  /**
   * Ao parar: grava o tempo que cada suíte ainda em andamento ficou rodando
   * (do primeiro caso dela até o momento do Parar).
   */
  onStopped(): void {
    const now = Date.now()
    for (const [file, start] of this.fileStart) {
      if (this.fileDone.has(file)) continue
      data.suites[file] = { elapsedSec: Math.round((now - start) / 1000), at: new Date(now).toISOString() }
    }
  }

  /** Suíte cujos casos planejados já terminaram (não recebe o tempo do Parar). */
  markDone(file: string): void {
    this.fileDone.add(file)
  }
}

/** Aplica os resultados salvos nas suítes recém-descobertas. */
export function applyResults(suites: Suite[]): void {
  const data = load()
  const all = Object.entries(data.cases)
  for (const s of suites) {
    for (const c of s.cases) {
      const r = data.cases[c.key] ?? all.find(([, v]) => v.title === c.title && sameFile(v.file, s.file))?.[1]
      if (!r) continue
      c.status = r.status
      c.durationMs = r.durationMs
      c.error = r.error
    }
    const sr = data.suites[s.file] ?? Object.entries(data.suites).find(([f]) => sameFile(f, s.file))?.[1]
    if (sr) {
      s.lastElapsedSec = sr.elapsedSec
      s.lastRunAt = sr.at
    }
  }
}
