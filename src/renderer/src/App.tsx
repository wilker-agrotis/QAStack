import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildPlaywrightArgs,
  type AppState,
  type CaseStatus,
  type EnvCheckItem,
  type LogLine,
  type RunFinished,
  type Suite,
  type TestEvent
} from '@shared/types'
import { caseTitleFromKey, sameFile, suiteStatus } from './lib'
import { ConsolePanel } from './components/ConsolePanel'
import { ExecPanel, type ExecSettings } from './components/ExecPanel'
import { FilterBar, type StatusFilter } from './components/FilterBar'
import { Metrics } from './components/Metrics'
import { CodegenModal, EnvCheckModal, SuiteDetailsModal } from './components/Modals'
import { RepoPanel } from './components/RepoPanel'
import { SuiteCard } from './components/SuiteCard'
import { TitleBar } from './components/TitleBar'
import { Toast } from './components/ui'

const api = window.qastack
const MAX_LOG = 3000

interface RunInfo {
  runId: string
  /** Primeiro caso da suíte começou (antes disso a suíte está na fila). */
  startedAt: number | null
  /** Casos planejados para esta suíte nesta execução (chave → vezes, uma por projeto). */
  expected: Record<string, number> | null
  /** Casos já finalizados (chave → vezes). */
  done: Record<string, number>
}

function mapStatus(s: string): CaseStatus {
  if (s === 'passed') return 'passed'
  if (s === 'skipped') return 'skipped'
  return 'failed'
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [suites, setSuites] = useState<Suite[]>([])

  const [env, setEnv] = useState<EnvCheckItem[]>([])
  const [envBusy, setEnvBusy] = useState(true)
  const [envOpen, setEnvOpen] = useState(false)
  const [installing, setInstalling] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [runs, setRuns] = useState<Record<string, RunInfo>>({}) // por arquivo
  const runsRef = useRef(runs)
  runsRef.current = runs
  const [elapsed, setElapsed] = useState<Record<string, number>>({}) // tempo congelado ao fim
  const [, setTick] = useState(0)

  const [logs, setLogs] = useState<LogLine[]>([
    { text: '[QAStack] Pronto.', level: 'default', at: new Date().toISOString() }
  ])
  const [lastCommand, setLastCommand] = useState('')

  const [opts, setOpts] = useState<ExecSettings>({
    mode: 'normal', project: 'chromium', workers: 2, headed: true, trace: true, lastFailed: false
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [detailsFile, setDetailsFile] = useState<string | null>(null)
  const [codegenOpen, setCodegenOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const log = useCallback((text: string, level: LogLine['level'] = 'default') => {
    setLogs((l) => [...l, { text, level, at: new Date().toISOString() }].slice(-MAX_LOG))
  }, [])

  // ---------- carregamento ----------
  const refreshEnv = useCallback(async (): Promise<EnvCheckItem[]> => {
    setEnvBusy(true)
    try {
      const items = await api.checkEnv()
      setEnv(items)
      return items
    } finally {
      setEnvBusy(false)
    }
  }, [])

  const loadRepo = useCallback(async () => {
    const st = await api.getState()
    setState(st)
    if (!st.cloned) {
      // antes do clone, busca as branches reais do remoto (precisa da chave SSH)
      const br = await api.listBranches()
      setBranches(br)
      setState(await api.getState())
      return
    }
    const [br, disc] = await Promise.all([api.listBranches(), api.discover()])
    setBranches(br)
    setSuites(disc.suites)
    if (disc.projects.length) {
      setProjects(disc.projects)
      setOpts((o) => (disc.projects.includes(o.project) || o.project === 'all' ? o : { ...o, project: disc.projects[0] }))
    }
    if (!disc.ok && disc.error) showToast(disc.error)
  }, [showToast])

  useEffect(() => {
    const offs = [
      api.onLog((line) => setLogs((l) => [...l, line].slice(-MAX_LOG))),
      api.onTestEvent(handleTestEvent),
      api.onRunFinished(handleRunFinished)
    ]
    // A verificação abre sozinha na inicialização, a menos que o usuário tenha marcado
    // "Não mostrar novamente". Se houver pendência, abre de qualquer jeito.
    api.getState().then((st) => {
      if (st.showEnvOnStartup) setEnvOpen(true)
      loadRepo()
        .then(refreshEnv)
        .then((items) => {
          if (items.some((c) => c.status === 'missing')) setEnvOpen(true)
        })
    })
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // relógio dos cards em execução
  const anyRunning = Object.keys(runs).length > 0
  useEffect(() => {
    if (!anyRunning) return
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [anyRunning])

  // ---------- eventos da execução ----------
  /** Atualiza o mapa de execuções já no ref, para eventos em sequência enxergarem o valor novo. */
  function commitRuns(next: Record<string, RunInfo>) {
    runsRef.current = next
    setRuns(next)
  }

  /** Encerra uma suíte assim que o último caso dela termina, sem esperar o resto da execução. */
  function finishSuite(next: Record<string, RunInfo>, file: string, now: number) {
    const info = next[file]
    delete next[file]
    const sec = info?.startedAt ? Math.round((now - info.startedAt) / 1000) : 0
    setElapsed((e) => ({ ...e, [file]: sec }))
  }

  function allDone(info: RunInfo): boolean {
    if (!info.expected) return false
    return Object.entries(info.expected).every(([k, n]) => (info.done[k] ?? 0) >= n)
  }

  function handleTestEvent(ev: TestEvent) {
    const now = Date.now()
    const runs0 = runsRef.current
    const files = Object.keys(runs0).filter((f) => runs0[f].runId === ev.runId)
    if (!files.length) return

    if (ev.type === 'begin') {
      if (!ev.tests) return // reporter antigo: cai no fim do processo como antes
      const next = { ...runs0 }
      for (const f of files) {
        const expected: Record<string, number> = {}
        for (const t of ev.tests) if (sameFile(f, t.file)) expected[t.key] = (expected[t.key] ?? 0) + 1
        next[f] = { ...next[f], expected }
        // suíte sem nenhum caso nesta execução (filtrada por tag ou --last-failed)
        if (!Object.keys(expected).length) finishSuite(next, f, now)
      }
      commitRuns(next)
      return
    }

    const file = files.find((f) => sameFile(f, ev.file))
    const title = caseTitleFromKey(ev.key)

    if (file) {
      const next = { ...runs0 }
      const info = { ...next[file], done: { ...next[file].done } }
      if (ev.type === 'testBegin' && !info.startedAt) info.startedAt = now
      if (ev.type === 'testEnd') info.done[ev.key] = (info.done[ev.key] ?? 0) + 1
      next[file] = info
      if (ev.type === 'testEnd' && allDone(info)) finishSuite(next, file, now)
      commitRuns(next)
    }

    setSuites((prev) =>
      prev.map((s) => {
        if (!sameFile(s.file, ev.file)) return s
        return {
          ...s,
          cases: s.cases.map((c) => {
            if (c.key !== ev.key && c.title !== title) return c
            // "mesma execução" = o caso já rodou neste runId (outro projeto/navegador)
            const sameRun = c.runId === ev.runId
            if (ev.type === 'testBegin') {
              if (sameRun && c.status === 'failed') return c
              return { ...c, status: 'running' as const, startedAt: now, runId: ev.runId, ...(sameRun ? {} : { error: undefined, durationMs: undefined }) }
            }
            // vários projetos (navegadores) podem rodar o mesmo caso: falha prevalece na mesma execução
            const next = mapStatus(ev.status)
            const keepFailed = sameRun && c.status === 'failed'
            return {
              ...c,
              runId: ev.runId,
              status: keepFailed ? ('failed' as const) : next,
              durationMs: ev.durationMs,
              startedAt: undefined,
              error: next === 'failed' ? ev.error ?? c.error : keepFailed ? c.error : undefined
            }
          })
        }
      })
    )
  }

  function handleRunFinished(ev: RunFinished) {
    const now = Date.now()
    const prev = runsRef.current
    // só sobram aqui as suítes que não terminaram sozinhas (parada pelo usuário, erro, UI Mode...)
    const left = Object.keys(prev).filter((f) => prev[f].runId === ev.runId)
    const next = { ...prev }
    for (const f of left) {
      // suíte que chegou a rodar guarda o tempo até o Parar; a que ficou na fila mantém o anterior
      if (ev.stopped && !prev[f].startedAt) delete next[f]
      else finishSuite(next, f, now)
    }
    commitRuns(next)
    setSuites((ss) =>
      ss.map((s) =>
        !left.includes(s.file)
          ? s
          : {
              ...s,
              cases: s.cases.map((c) =>
                c.status === 'running' ? { ...c, status: 'pending' as const, startedAt: undefined } : c
              )
            }
      )
    )
  }

  // ---------- ações ----------
  const envBlocked = env.some((c) => c.status === 'missing' && c.blocking)
  const canRun = !!state?.cloned && !syncing

  async function doSync(repoUrl: string, branch: string) {
    if (envBusy) return showToast('Aguarde a verificação do ambiente terminar')
    if (envBlocked) {
      showToast('Resolva as pendências do ambiente antes de baixar o repositório')
      setEnvOpen(true)
      return
    }
    const switching = !!state && repoUrl.trim() !== state.repoUrl.trim()
    if (switching && anyRunning) return showToast('Aguarde as execuções terminarem para trocar de repositório')
    setSyncing(true)
    setSyncError(null)
    if (switching) {
      // resultados, suítes e branches eram do repositório anterior
      setSuites([])
      setElapsed({})
      setBranches([])
      setProjects([])
      setActiveTag(null)
      setLastCommand('')
    }
    try {
      const r = await api.sync({ repoUrl, branch })
      setState(r.state)
      if (!r.ok) {
        setSyncError(r.error ?? 'Falha no Sync')
        showToast(r.error ?? 'Falha no Sync')
      }
      if (r.state.cloned) {
        await loadRepo()
        if (r.ok) showToast('Repositório sincronizado com sucesso!')
        refreshEnv()
      }
    } finally {
      setSyncing(false)
    }
  }

  async function startRun(files: string[], grepTag: string | null = null) {
    const targets = files.length
      ? suites.filter((s) => files.includes(s.file))
      : suites.filter((s) => !grepTag || s.tags.includes(grepTag))
    if (targets.some((s) => runs[s.file])) return showToast('Essa suíte já está em execução')
    try {
      // "Rodar Tudo" começa do zero; Play em uma suíte mantém os resultados anteriores
      if (files.length === 0) await clearAllResults(false)
      const started = await api.run({ ...opts, files, grepTag })
      setLastCommand(started.command)
      const n = { ...runsRef.current }
      for (const s of targets) n[s.file] = { runId: started.runId, startedAt: null, expected: null, done: {} }
      commitRuns(n)
    } catch (e) {
      const msg = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      log(`[QAStack] ${msg}`, 'error')
      showToast(msg)
    }
  }

  async function stopFile(file: string) {
    const info = runs[file]
    if (!info) return
    const shared = Object.values(runs).filter((r) => r.runId === info.runId).length
    if (shared > 1) showToast(`Esta execução inclui ${shared} suítes: todas serão paradas`)
    await api.stop(info.runId)
  }

  async function clearAllResults(notify = true) {
    await api.clearResults()
    setElapsed({})
    setSuites((ss) =>
      ss.map((s) => ({
        ...s,
        lastElapsedSec: undefined,
        lastRunAt: undefined,
        cases: s.cases.map((c) =>
          c.status === 'running' ? c : { ...c, status: 'pending' as const, error: undefined, durationMs: undefined, runId: undefined }
        )
      }))
    )
    if (notify) {
      log('[QAStack] Resultados limpos.', 'info')
      showToast('Resultados das suítes limpos')
    }
  }

  async function downloadReport() {
    const r = await api.downloadReport()
    if (r.ok) showToast('HTML Report salvo')
    else if (r.error) showToast(r.error)
  }

  async function stopAll() {
    await api.stopAll()
    showToast('Todas as execuções foram interrompidas.')
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(previewCommand)
    showToast('Comando Playwright copiado!')
  }

  // ---------- derivados ----------
  const previewCommand = useMemo(
    () => lastCommand || 'npx ' + buildPlaywrightArgs({ ...opts, files: [], grepTag: activeTag }).join(' '),
    [lastCommand, opts, activeTag]
  )
  useEffect(() => setLastCommand(''), [opts])

  const allTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const s of suites) for (const t of s.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [suites])

  const visible = suites.filter((s) => {
    const q = search.toLowerCase().trim()
    const matchQ = !q || s.title.toLowerCase().includes(q) || s.file.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q))
    const matchTag = !activeTag || s.tags.includes(activeTag)
    const st = suiteStatus(s, !!runs[s.file])
    return matchQ && matchTag && (statusFilter === 'all' || st === statusFilter)
  })

  const hasResults = suites.some((s) => s.lastElapsedSec !== undefined || s.cases.some((c) => c.status !== 'pending'))
  const newSuites = suites.filter((s) => s.isNew).length
  const newCases = suites.filter((s) => !s.isNew).reduce((a, s) => a + s.cases.filter((c) => c.isNew).length, 0)
  const details = suites.find((s) => s.file === detailsFile) ?? null

  // cada suíte conta o próprio tempo: do primeiro caso dela até o último
  function elapsedFor(file: string): number {
    const r = runs[file]
    if (r) return r.startedAt ? Math.round((Date.now() - r.startedAt) / 1000) : 0
    return elapsed[file] ?? suites.find((s) => s.file === file)?.lastElapsedSec ?? 0
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117] overflow-hidden">
      <TitleBar state={state} env={env} envBusy={envBusy} onOpenEnv={() => setEnvOpen(true)} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <RepoPanel state={state} branches={branches} syncing={syncing} syncError={syncError} busy={anyRunning} onSync={doSync} />
          <ExecPanel
            opts={opts}
            setOpts={setOpts}
            projects={projects}
            canRun={canRun}
            anyRunning={anyRunning}
            onRunAll={() => startRun([], activeTag)}
            onStopAll={stopAll}
            onCodegen={() => setCodegenOpen(true)}
          />
        </div>

        <Metrics suites={suites} />

        <FilterBar
          search={search}
          setSearch={setSearch}
          status={statusFilter}
          setStatus={setStatusFilter}
          tags={allTags}
          activeTag={activeTag}
          setActiveTag={setActiveTag}
        />

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Suítes Mapeadas ({visible.length})</h3>
              <button
                onClick={() => clearAllResults()}
                disabled={anyRunning || !hasResults}
                title={anyRunning ? 'Aguarde as execuções terminarem' : 'Apaga o resultado e o tempo de todas as suítes'}
                className="text-[11px] font-medium text-slate-300 hover:text-white bg-[#161b22] hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Limpar resultados
              </button>
            </div>
            <span className="text-[11px] text-slate-500">
              {activeTag ? <>Rodar Tudo vai executar só os testes com <strong className="text-slate-300">{activeTag}</strong>.</> : <>Os resultados ficam até você fechar o QAStack, clicar em <strong className="text-slate-300">Limpar resultados</strong> ou em <strong className="text-slate-300">Rodar Tudo</strong>.</>}
            </span>
          </div>

          {(newSuites > 0 || newCases > 0) && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2.5 text-sky-200">
                <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                <span>
                  Detectado no último Sync:{' '}
                  {[
                    newSuites ? `${newSuites} ${newSuites > 1 ? 'suítes novas' : 'suíte nova'}` : '',
                    newCases ? `${newCases} ${newCases > 1 ? 'casos novos' : 'caso novo'} em suítes existentes` : ''
                  ].filter(Boolean).join(' · ')}
                  .
                </span>
              </div>
              <button
                onClick={async () => {
                  await api.markSeen()
                  setSuites((ss) => ss.map((s) => ({ ...s, isNew: false, cases: s.cases.map((c) => ({ ...c, isNew: false })) })))
                }}
                className="shrink-0 text-sky-300 hover:text-white font-medium px-2.5 py-1 rounded-md hover:bg-sky-500/15 transition"
              >
                Marcar como vistas
              </button>
            </div>
          )}

          {!state?.cloned ? (
            <div className="bg-[#161b22] border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
              Nenhum repositório baixado ainda. Confira a verificação do ambiente e clique em <strong className="text-slate-200">Clonar repositório</strong>.
            </div>
          ) : visible.length === 0 ? (
            <div className="bg-[#161b22] border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
              {suites.length ? 'Nenhuma suíte de teste encontrada com os filtros atuais.' : 'Nenhuma suíte encontrada no repositório.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((s) => (
                <SuiteCard
                  key={s.file}
                  suite={s}
                  status={suiteStatus(s, !!runs[s.file])}
                  elapsedSec={elapsedFor(s.file)}
                  queued={!!runs[s.file] && !runs[s.file].startedAt}
                  canRun={canRun}
                  onPlay={() => startRun([s.file])}
                  onStop={() => stopFile(s.file)}
                  onDetails={() => setDetailsFile(s.file)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <ConsolePanel
        lines={logs}
        command={previewCommand}
        onClear={() => setLogs([])}
        onCopy={copyCommand}
        onReport={() => api.openReport()}
        onDownloadReport={downloadReport}
        canReport={!!state?.cloned}
      />

      <EnvCheckModal
        open={envOpen}
        onClose={() => setEnvOpen(false)}
        items={env}
        busy={envBusy}
        installing={installing}
        onRecheck={refreshEnv}
        showOnStartup={state?.showEnvOnStartup ?? true}
        onShowOnStartupChange={async (show) => {
          await api.setShowEnvOnStartup(show)
          setState((s) => (s ? { ...s, showEnvOnStartup: show } : s))
        }}
        onInstallBrowsers={async () => {
          setInstalling(true)
          try {
            await api.installBrowsers()
          } finally {
            setInstalling(false)
            refreshEnv()
          }
        }}
      />
      <SuiteDetailsModal
        suite={details}
        canRun={canRun && !!details && !runs[details.file]}
        onClose={() => setDetailsFile(null)}
        onRun={() => {
          if (details) startRun([details.file])
          setDetailsFile(null)
        }}
      />
      <CodegenModal
        open={codegenOpen}
        onClose={() => setCodegenOpen(false)}
        onLaunch={(o) => {
          api.codegen(o)
          setCodegenOpen(false)
          showToast('Playwright Codegen iniciado!')
        }}
      />
      <Toast message={toast} />
    </div>
  )
}
