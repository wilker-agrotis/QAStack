import { formatTime } from '../lib'
import { IconX, Spinner } from './ui'

export type ProgressOutcome = 'running' | 'passed' | 'failed' | 'stopped' | 'error'

/** Progresso do "Rodar Tudo": alimentado pelos eventos do reporter do QAStack. */
export interface RunProgressState {
  runId: string
  /** null = o Playwright ainda está iniciando (antes do evento "begin"). */
  total: number | null
  passed: number
  failed: number
  skipped: number
  /** Último teste concluído. */
  lastTitle?: string
  lastStatus?: 'passed' | 'failed' | 'skipped'
  startedAt: number
  finishedAt: number | null
  outcome: ProgressOutcome
}

export function progressDone(p: RunProgressState): number {
  return p.passed + p.failed + p.skipped
}

const OUTCOME: Record<ProgressOutcome, { label: string; cls: string }> = {
  running: { label: 'Executando testes', cls: 'text-slate-100' },
  passed: { label: 'Execução concluída', cls: 'text-emerald-300' },
  failed: { label: 'Execução concluída com falhas', cls: 'text-rose-300' },
  stopped: { label: 'Execução interrompida', cls: 'text-amber-300' },
  error: { label: 'A execução terminou antes de rodar os testes. Veja o console.', cls: 'text-rose-300' }
}

export function RunProgress({ progress: p, onClose, onShowFailures }: { progress: RunProgressState; onClose: () => void; onShowFailures: () => void }) {
  const running = p.outcome === 'running'
  const total = p.total ?? 0
  const done = Math.min(progressDone(p), total)
  const pct = total ? Math.round((done / total) * 100) : 0
  const elapsedSec = Math.round(((p.finishedAt ?? Date.now()) - p.startedAt) / 1000)
  // estimativa simples: ritmo médio até aqui × testes restantes
  const etaSec = running && done > 0 && total > done ? Math.round((elapsedSec / done) * (total - done)) : null
  const w = (n: number) => (total ? `${(Math.min(n, total) / total) * 100}%` : '0%')

  const border = running
    ? 'border-sky-500/35'
    : p.outcome === 'passed'
      ? 'border-emerald-500/35'
      : p.outcome === 'stopped'
        ? 'border-amber-500/35'
        : 'border-rose-500/35'

  return (
    <section className={`bg-[#161b22] border ${border} rounded-xl px-4 py-3 space-y-2`} aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {running ? (
            <>
              <Spinner />
              <span className="font-semibold text-slate-100">
                {p.total === null ? 'Preparando a execução...' : 'Executando testes'}
              </span>
            </>
          ) : (
            <span className={`font-semibold ${OUTCOME[p.outcome].cls}`}>{OUTCOME[p.outcome].label}</span>
          )}
          {p.total !== null && (
            <span className="font-mono text-slate-300">
              {done} de {total} ({pct}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
          <span className="text-emerald-400" title="Passaram">✓ {p.passed}</span>
          <span className="text-rose-400" title="Falharam">✗ {p.failed}</span>
          {p.skipped > 0 && <span className="text-slate-400" title="Pulados">⤼ {p.skipped}</span>}
          <span className="text-slate-400" title="Tempo decorrido">⏱ {formatTime(elapsedSec)}</span>
          {etaSec !== null && <span className="text-slate-500" title="Estimativa de tempo restante">~{formatTime(etaSec)} restantes</span>}
          {p.failed > 0 && (
            <button
              onClick={onShowFailures}
              className="font-sans text-[11px] font-medium text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 px-2.5 py-0.5 rounded-md transition"
            >
              Ver falhas
            </button>
          )}
          {!running && (
            <button onClick={onClose} aria-label="Fechar" className="text-slate-500 hover:text-white p-0.5 rounded hover:bg-slate-800">
              <IconX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className="relative h-2 w-full rounded-full bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={p.total === null ? undefined : done}
      >
        {p.total === null ? (
          <div className="absolute inset-y-0 w-1/3 bg-sky-500/70 rounded-full progress-indeterminate" />
        ) : (
          <div className="flex h-full transition-all duration-300">
            <div className="bg-emerald-500 transition-all duration-300" style={{ width: w(p.passed) }} />
            <div className="bg-rose-500 transition-all duration-300" style={{ width: w(p.failed) }} />
            <div className="bg-slate-500 transition-all duration-300" style={{ width: w(p.skipped) }} />
          </div>
        )}
      </div>

      {p.lastTitle && (
        <p className="text-[11px] text-slate-500 truncate" title={p.lastTitle}>
          {running ? 'Último concluído: ' : 'Último: '}
          <span className={p.lastStatus === 'failed' ? 'text-rose-300' : p.lastStatus === 'skipped' ? 'text-slate-400' : 'text-slate-300'}>
            {p.lastTitle}
          </span>
        </p>
      )}
    </section>
  )
}
