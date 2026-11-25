import { useEffect, useState } from 'react'
import type { AppState } from '@shared/types'
import { IconSync, IconTerminal } from './ui'

export function RepoPanel(props: {
  state: AppState | null
  branches: string[]
  syncing: boolean
  syncError: string | null
  /** Bloqueia a troca enquanto há testes rodando. */
  busy: boolean
  onSync: (repoUrl: string, branch: string) => void
}) {
  const { state, branches, syncing } = props
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (state) {
      setUrl(state.repoUrl)
      setBranch(state.branch)
      setSwitching(false)
    }
  }, [state?.repoUrl, state?.branch])

  const cloned = !!state?.cloned
  const editable = !cloned || switching
  const validUrl = /^(git@[\w.-]+:.+|ssh:\/\/.+|https?:\/\/.+)/.test(url.trim())
  const changed = !!state && url.trim() !== state.repoUrl.trim()

  function cancelSwitch() {
    setSwitching(false)
    if (state) setUrl(state.repoUrl)
  }

  function submit() {
    // trocando para outro repositório: a branch da lista é do repositório atual, então usa a padrão do novo
    props.onSync(url.trim(), switching && changed ? '' : branch)
  }

  const options = Array.from(new Set([branch, ...branches]))
  let badge = (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
      Não baixado
    </span>
  )
  if (syncing) {
    badge = (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
        Sincronizando...
      </span>
    )
  } else if (props.syncError) {
    badge = (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        Falha no Sync
      </span>
    )
  } else if (state?.cloned) {
    badge = (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Sincronizado
      </span>
    )
  }

  const lastSync = state?.lastSync
    ? new Date(state.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'nunca'

  return (
    <section className="xl:col-span-6 bg-[#161b22] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconTerminal className="w-4 h-4 text-sky-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Repositório de Testes Automatizados</h2>
        </div>
        {badge}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!editable || syncing}
            autoFocus={switching}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && switching) cancelSwitch()
              if (e.key === 'Enter' && editable && validUrl) submit()
            }}
            placeholder="git@ssh.bitbucket.org:workspace/repositorio.git"
            className={`w-full bg-[#0d1117] border rounded-lg pl-3 ${cloned && !switching ? 'pr-20' : 'pr-3'} py-2 text-xs font-mono text-slate-200 focus:outline-none transition disabled:text-slate-400 ${
              switching ? 'border-amber-500/60 focus:border-amber-400' : 'border-slate-700/90 focus:border-sky-500'
            }`}
          />
          {cloned && !switching && (
            <button
              onClick={() => setSwitching(true)}
              disabled={syncing || props.busy}
              title={props.busy ? 'Aguarde as execuções terminarem' : 'Usar outro repositório de testes (outro produto)'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Trocar
            </button>
          )}
        </div>
        {switching && changed ? (
          <span className="bg-[#0d1117] border border-slate-700/90 rounded-lg px-3 py-2 text-xs font-mono text-slate-400 whitespace-nowrap" title="O novo repositório é clonado na branch padrão dele; depois você pode trocar a branch">
            ⎇ padrão
          </span>
        ) : (
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={syncing}
            className="bg-[#0d1117] border border-slate-700/90 rounded-lg px-3 py-2 text-xs font-mono text-sky-300 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {options.map((b) => (
              <option key={b} value={b}>⎇ {b}</option>
            ))}
          </select>
        )}
        <button
          onClick={submit}
          disabled={syncing || !validUrl || (switching && !changed)}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-60 active:scale-[0.99] text-white font-medium text-xs px-3.5 py-2 rounded-lg transition flex items-center justify-center gap-1.5 shrink-0 shadow-sm shadow-sky-900/40"
        >
          <IconSync className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{switching ? 'Usar este repositório' : cloned ? 'Baixar / Sync' : 'Clonar repositório'}</span>
        </button>
        {switching && (
          <button
            onClick={cancelSwitch}
            disabled={syncing}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg transition shrink-0"
          >
            Cancelar
          </button>
        )}
      </div>

      {switching && (
        <p className="text-[11px] text-amber-200/90 -mt-1">
          Informe a URL SSH do repositório do outro produto. Ele é clonado em uma pasta própria em <code className="font-mono">C:\QASTACK</code>;
          o repositório atual continua na máquina e você pode voltar para ele depois.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 border-t border-slate-800/80">
        <div className="flex items-center gap-3 pt-2">
          <span>Config: <code className="text-slate-300 font-mono">playwright.config.ts</code></span>
          <span>Último pull: <span className="text-slate-300">{lastSync}</span></span>
        </div>
        <span className="pt-2" title="Local onde o repositório é clonado">
          Clonado em: <code className="text-sky-300 font-mono select-text">{state?.clonePath ?? '—'}</code>
        </span>
      </div>
    </section>
  )
}
