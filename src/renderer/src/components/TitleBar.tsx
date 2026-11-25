import type { AppState, EnvCheckItem } from '@shared/types'
import { IconCheck, IconFolder } from './ui'

export function TitleBar(props: { state: AppState | null; env: EnvCheckItem[]; envBusy: boolean; onOpenEnv: () => void }) {
  const { state, env, envBusy } = props
  const pend = env.filter((c) => c.status === 'missing').length
  const node = env.find((c) => c.id === 'node')
  const nodeOk = node?.status === 'ok'
  const base = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition '
  let chipClass = base + 'border-slate-700/80 bg-[#0d1117] text-slate-300'
  let chipText = 'Verificando ambiente…'
  if (!envBusy && env.length) {
    if (pend > 0) {
      chipClass = base + 'border-amber-500/45 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
      chipText = `⚠ ${pend} ${pend > 1 ? 'pendências' : 'pendência'} no ambiente`
    } else {
      chipClass = base + 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
      chipText = '✓ Ambiente OK'
    }
  }

  return (
    <header className="h-11 bg-[#161b22] border-b border-slate-800 px-4 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-emerald-500/20">
          <IconCheck className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-sm tracking-tight text-white">QAStack</span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {state?.playwrightVersion ? `Playwright v${state.playwrightVersion}` : 'Playwright —'}
        </span>
        <span
          title={node?.detail ?? 'Verificando Node.js...'}
          className={`text-[11px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
            !node || nodeOk
              ? 'bg-lime-500/10 text-lime-300 border-lime-500/25'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/35'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${!node || nodeOk ? 'bg-lime-400' : 'bg-amber-400'}`} />
          {node?.version ? `Node ${node.version}` : 'Node —'}
        </span>
      </div>

      <div className="hidden md:flex items-center gap-2 text-xs font-mono text-slate-400 bg-[#0d1117] px-3 py-1 rounded-md border border-slate-800/90">
        <IconFolder className="w-3.5 h-3.5 text-slate-500" />
        <span>{state?.clonePath ?? '—'}</span>
        <span className="text-slate-600">|</span>
        <span className="text-sky-400">{state?.branch ?? '—'}</span>
      </div>

      <div className="flex items-center gap-2.5">
        <button onClick={props.onOpenEnv} title="Ver verificação do ambiente" className={chipClass}>
          {chipText}
        </button>
        <div
          className="flex items-center gap-1.5 bg-[#0d1117] border border-slate-700/80 rounded-lg px-2.5 py-1 cursor-default"
          title={
            state?.tenant
              ? `Tenant lido de ${state.tenantSource} no repositório clonado (somente leitura)`
              : 'Tenant não encontrado no repositório (.env, playwright.config ou Jenkinsfile)'
          }
        >
          <span className="text-[11px] text-slate-400">Tenant:</span>
          <span className="text-xs font-semibold font-mono text-amber-400">{state?.tenant ?? '—'}</span>
        </div>
      </div>
    </header>
  )
}
