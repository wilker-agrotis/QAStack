import type { Suite, SuiteStatus } from '@shared/types'
import { formatTime } from '../lib'
import { IconPlay, IconStop } from './ui'

export function SuiteCard(props: {
  suite: Suite
  status: SuiteStatus
  elapsedSec: number
  /** Faz parte de uma execução, mas nenhum caso dela começou ainda. */
  queued?: boolean
  canRun: boolean
  onPlay: () => void
  onStop: () => void
  onDetails: () => void
}) {
  const { suite, status } = props
  const total = suite.cases.length
  const passed = suite.cases.filter((c) => c.status === 'passed').length
  const failed = suite.cases.filter((c) => c.status === 'failed').length
  const done = suite.cases.filter((c) => c.status === 'passed' || c.status === 'failed' || c.status === 'skipped').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const newCases = suite.cases.filter((c) => c.isNew).length
  const running = status === 'running'

  let badge = <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 shrink-0">Pronto</span>
  let border = 'border-slate-800 hover:border-slate-700'
  let bar = 'bg-sky-500'
  if (running && props.queued) {
    badge = (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 border border-slate-600 flex items-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
        Na fila
      </span>
    )
    border = 'border-slate-600'
  } else if (running) {
    badge = (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
        Rodando
      </span>
    )
    border = 'border-sky-500/60 running-card'
    bar = 'bg-sky-400'
  } else if (status === 'passed') {
    badge = <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">Aprovado</span>
    border = 'border-emerald-500/35'
    bar = 'bg-emerald-500'
  } else if (status === 'failed') {
    badge = <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">{failed} Falha(s)</span>
    border = 'border-rose-500/45'
    bar = 'bg-rose-500'
  }

  return (
    <article className={`bg-[#161b22] border ${border} rounded-xl p-4 flex flex-col justify-between transition shadow-sm`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm text-white leading-snug">{suite.title}</h4>
              {suite.isNew && (
                <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">NOVA</span>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5 break-all">{suite.file}</p>
          </div>
          {badge}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div className="flex flex-wrap gap-1">
            {suite.tags.map((t) => (
              <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0d1117] text-slate-300 border border-slate-800">{t}</span>
            ))}
          </div>
          <span className="text-[11px] font-mono text-slate-300 bg-[#0d1117] px-2 py-0.5 rounded border border-slate-800">
            {total} casos
            {!suite.isNew && newCases > 0 && <span className="text-sky-300"> · +{newCases} novos</span>}
          </span>
        </div>

        <div className="mt-3.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span>
              Progresso: <strong className="text-slate-200 font-mono">{done}/{total}</strong> ({passed} ok
              {failed > 0 && <span className="text-rose-400">, {failed} erro</span>})
            </span>
            <span className="font-mono text-slate-400" title="Tempo de execução desta suíte">
              {props.queued ? '--:--' : formatTime(props.elapsedSec)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
            <div className={`h-full ${bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <button
            onClick={props.onPlay}
            disabled={running || !props.canRun}
            title="Iniciar suíte"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
              running || !props.canRun ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
          >
            <IconPlay className="w-3.5 h-3.5" />
            <span>Play</span>
          </button>
          <button
            onClick={props.onStop}
            disabled={!running}
            title="Parar a execução desta suíte"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border transition ${
              running
                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                : 'bg-[#0d1117] text-slate-600 border-slate-800 cursor-not-allowed'
            }`}
          >
            <IconStop className="w-3.5 h-3.5" />
            <span>Parar</span>
          </button>
        </div>
        <button
          onClick={props.onDetails}
          className="text-[11px] font-medium text-slate-300 hover:text-white bg-[#0d1117] hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1.5 rounded-lg transition"
        >
          Ver Casos
        </button>
      </div>
    </article>
  )
}
