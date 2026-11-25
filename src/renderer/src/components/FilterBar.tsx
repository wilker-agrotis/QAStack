import { IconSearch } from './ui'

export type StatusFilter = 'all' | 'running' | 'passed' | 'failed' | 'idle'

export function FilterBar(props: {
  search: string
  setSearch: (v: string) => void
  status: StatusFilter
  setStatus: (v: StatusFilter) => void
  tags: string[]
  activeTag: string | null
  setActiveTag: (t: string | null) => void
}) {
  return (
    <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#161b22]/70 border border-slate-800/90 rounded-xl p-3">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={props.search}
            onChange={(e) => props.setSearch(e.target.value)}
            placeholder="Buscar suíte, arquivo .spec.ts ou @tag..."
            className="w-full bg-[#0d1117] border border-slate-700/90 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
        </div>
        <select
          value={props.status}
          onChange={(e) => props.setStatus(e.target.value as StatusFilter)}
          className="bg-[#0d1117] border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
        >
          <option value="all">Status: Todos</option>
          <option value="running">Rodando</option>
          <option value="passed">Aprovados</option>
          <option value="failed">Com Falhas</option>
          <option value="idle">Não executados</option>
        </select>
      </div>

      {props.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">Tags:</span>
          {props.tags.map((t) => {
            const on = props.activeTag === t
            return (
              <button
                key={t}
                onClick={() => props.setActiveTag(on ? null : t)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-md border transition ${
                  on
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-[#0d1117] border-slate-700 text-slate-300 hover:border-emerald-500/50'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
