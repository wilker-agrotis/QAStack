import type { ExecMode, RunOptions } from '@shared/types'
import { IconPlay, IconStop } from './ui'

export type ExecSettings = Omit<RunOptions, 'files' | 'grepTag'>

const MODES: { id: ExecMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'ui', label: 'UI Mode (--ui)' },
  { id: 'debug', label: 'Debug (--debug)' }
]

function Flag(props: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; name: string; desc: string }) {
  return (
    <label className="cursor-pointer select-none">
      <input
        type="checkbox"
        className="flag-in sr-only"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="flag-chip">
        <span className="flag-trk" />
        <span>
          <span className="block font-mono text-xs font-medium text-[#e6edf3] leading-tight">{props.name}</span>
          <span className="block text-[10px] text-[#8b949e] leading-tight mt-0.5">{props.desc}</span>
        </span>
      </span>
    </label>
  )
}

export function ExecPanel(props: {
  opts: ExecSettings
  setOpts: (o: ExecSettings) => void
  projects: string[]
  canRun: boolean
  anyRunning: boolean
  onRunAll: () => void
  onStopAll: () => void
  onCodegen: () => void
}) {
  const { opts, setOpts } = props
  const set = (patch: Partial<ExecSettings>) => setOpts({ ...opts, ...patch })
  const projects = props.projects.length ? props.projects : ['chromium', 'firefox', 'webkit']

  return (
    <section className="xl:col-span-6 bg-[#161b22] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPlay className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Modo & Opções de Execução (Playwright)</h2>
        </div>
        <button
          onClick={props.onCodegen}
          disabled={!props.canRun}
          className="text-[11px] font-mono bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-md transition flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span>Codegen</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex bg-[#0d1117] p-1 rounded-lg border border-slate-800" role="group">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => set({ mode: m.id })}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                opts.mode === m.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 bg-[#0d1117] border border-slate-700/90 rounded-lg px-2.5 py-1.5">
          <span className="text-[11px] text-slate-400">Browser:</span>
          <select
            value={opts.project}
            onChange={(e) => set({ project: e.target.value })}
            className="bg-transparent text-xs font-medium text-slate-100 focus:outline-none cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p} value={p} className="bg-[#161b22]">{p}</option>
            ))}
            <option value="all" className="bg-[#161b22]">Todos ({projects.length} projetos)</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-[#0d1117] border border-slate-700/90 rounded-lg px-2.5 py-1.5">
          <span className="text-[11px] text-slate-400">Workers:</span>
          <input
            type="number"
            min={1}
            max={8}
            value={opts.workers}
            onChange={(e) => set({ workers: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
            className="w-9 bg-transparent text-xs font-mono text-center text-slate-100 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <Flag name="--headed" desc="Navegador visível" checked={opts.headed} disabled={opts.mode !== 'normal'} onChange={(v) => set({ headed: v })} />
          <Flag name="--trace on-first-retry" desc="Trace ao repetir falha" checked={opts.trace} onChange={(v) => set({ trace: v })} />
          <Flag name="--last-failed" desc="Só os que falharam" checked={opts.lastFailed} onChange={(v) => set({ lastFailed: v })} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={props.onRunAll}
            disabled={!props.canRun}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:scale-[0.99] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-sm shadow-emerald-950"
          >
            <IconPlay className="w-3.5 h-3.5" />
            <span>Rodar Tudo</span>
          </button>
          <button
            onClick={props.onStopAll}
            disabled={!props.anyRunning}
            className="bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-medium px-2.5 py-1.5 rounded-lg transition flex items-center gap-1"
          >
            <IconStop className="w-3.5 h-3.5" />
            <span>Parar</span>
          </button>
        </div>
      </div>
    </section>
  )
}
