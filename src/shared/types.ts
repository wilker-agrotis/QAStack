// Contrato entre o processo principal (Node) e a tela (React).
// Tudo que atravessa a ponte IPC passa por estes tipos.

export const IPC = {
  getState: 'qastack:get-state',
  checkEnv: 'qastack:check-env',
  installBrowsers: 'qastack:install-browsers',
  sync: 'qastack:sync',
  listBranches: 'qastack:list-branches',
  discover: 'qastack:discover',
  markSeen: 'qastack:mark-seen',
  setShowEnvOnStartup: 'qastack:set-show-env-on-startup',
  run: 'qastack:run',
  stop: 'qastack:stop',
  stopAll: 'qastack:stop-all',
  openReport: 'qastack:open-report',
  downloadReport: 'qastack:download-report',
  clearResults: 'qastack:clear-results',
  codegen: 'qastack:codegen',
  // eventos main → tela
  log: 'qastack:log',
  testEvent: 'qastack:test-event',
  runFinished: 'qastack:run-finished'
} as const

export type EnvStatus = 'ok' | 'missing' | 'waiting' | 'checking' | 'installing'

export interface EnvCheckItem {
  id: 'git' | 'node' | 'npm' | 'ssh' | 'browsers' | 'deps'
  name: string
  status: EnvStatus
  detail: string
  /** Bloqueia o clone do repositório enquanto estiver pendente. */
  blocking: boolean
  /** Passos manuais para resolver (exibidos quando pendente). */
  fix?: string[]
  /** O QAStack consegue resolver sozinho (botão "Instalar agora"). */
  autoFix?: boolean
  /** Versão detectada (ex.: v20.18.0), quando se aplica. */
  version?: string
}

export interface AppState {
  repoUrl: string
  clonePath: string
  branch: string
  cloned: boolean
  tenant: string | null
  tenantSource: string | null
  playwrightVersion: string | null
  lastSync: string | null
  showEnvOnStartup: boolean
}

export interface SyncRequest {
  repoUrl: string
  branch: string
}

export interface SyncResult {
  ok: boolean
  state: AppState
  error?: string
}

export type CaseStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
export type SuiteStatus = 'idle' | 'running' | 'passed' | 'failed'

export interface TestCase {
  /** file::títulos encadeados — estável entre execuções. */
  key: string
  title: string
  line: number
  tags: string[]
  status: CaseStatus
  durationMs?: number
  /** Momento (Date.now) em que o caso começou a rodar — usado no relógio ao vivo. */
  startedAt?: number
  /** Execução que produziu o status atual (só na tela). */
  runId?: string
  error?: string
  isNew?: boolean
}

export interface Suite {
  file: string
  title: string
  tags: string[]
  cases: TestCase[]
  isNew?: boolean
  /** Tempo da última execução desta suíte (segundos), vindo do histórico salvo. */
  lastElapsedSec?: number
  lastRunAt?: string
}

export interface DiscoverResult {
  ok: boolean
  suites: Suite[]
  /** Projetos do playwright.config (normalmente navegadores: chromium, firefox, webkit). */
  projects: string[]
  error?: string
}

export type ExecMode = 'normal' | 'ui' | 'debug'
export type BrowserProject = string // 'all' ou nome de projeto do playwright.config

export interface RunOptions {
  /** Arquivos .spec a executar; vazio = todos. */
  files: string[]
  mode: ExecMode
  project: BrowserProject
  workers: number
  headed: boolean
  trace: boolean
  lastFailed: boolean
  grepTag?: string | null
}

export interface RunStarted {
  runId: string
  command: string
}

export interface LogLine {
  text: string
  level: 'default' | 'cmd' | 'success' | 'error' | 'warn' | 'info'
  at: string
}

/** Eventos emitidos pelo reporter do QAStack durante a execução. */
export type TestEvent =
  | { runId: string; type: 'begin'; total: number; tests?: { key: string; file: string }[] }
  | { runId: string; type: 'testBegin'; key: string; file: string; project: string }
  | {
      runId: string
      type: 'testEnd'
      key: string
      file: string
      project: string
      status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
      durationMs: number
      error?: string
    }

export interface RunFinished {
  runId: string
  files: string[]
  exitCode: number | null
  stopped: boolean
}

export interface CodegenOptions {
  url: string
  output: string
  device?: string
}

export interface QAStackApi {
  getState(): Promise<AppState>
  checkEnv(): Promise<EnvCheckItem[]>
  installBrowsers(): Promise<boolean>
  sync(req: SyncRequest): Promise<SyncResult>
  listBranches(): Promise<string[]>
  discover(): Promise<DiscoverResult>
  markSeen(): Promise<void>
  setShowEnvOnStartup(show: boolean): Promise<void>
  run(opts: RunOptions): Promise<RunStarted>
  stop(runId: string): Promise<void>
  stopAll(): Promise<void>
  openReport(): Promise<void>
  downloadReport(): Promise<{ ok: boolean; path?: string; error?: string }>
  clearResults(): Promise<void>
  codegen(opts: CodegenOptions): Promise<void>
  onLog(cb: (line: LogLine) => void): () => void
  onTestEvent(cb: (ev: TestEvent) => void): () => void
  onRunFinished(cb: (ev: RunFinished) => void): () => void
}

export function buildPlaywrightArgs(opts: RunOptions): string[] {
  const args = ['playwright', 'test', ...opts.files]
  if (opts.mode === 'ui') args.push('--ui')
  if (opts.mode === 'debug') args.push('--debug')
  if (opts.project && opts.project !== 'all') args.push(`--project=${opts.project}`)
  if (opts.headed && opts.mode === 'normal') args.push('--headed')
  if (opts.trace) args.push('--trace=on-first-retry')
  if (opts.lastFailed) args.push('--last-failed')
  if (opts.grepTag) args.push(`--grep=${opts.grepTag}`)
  args.push(`--workers=${Math.max(1, opts.workers || 1)}`)
  return args
}
