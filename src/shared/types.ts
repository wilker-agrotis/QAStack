// Contrato entre o processo principal (Node) e a tela (React).
// Tudo que atravessa a ponte IPC passa por estes tipos.

export const IPC = {
  getState: 'qastack:get-state',
  checkEnv: 'qastack:check-env',
  installBrowsers: 'qastack:install-browsers',
  installEnvItem: 'qastack:install-env-item',
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
  reportInfo: 'qastack:report-info',
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
  /** O QAStack consegue resolver sozinho (botão de instalação). */
  autoFix?: boolean
  /** Texto do botão de instalação (padrão: "Instalar agora"). */
  installLabel?: string
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
/** 'config' = não envia --trace (vale o trace do playwright.config). */
export type TraceMode = 'config' | 'on' | 'off' | 'retain-on-failure' | 'retain-on-first-failure' | 'on-first-retry' | 'on-all-retries'
export type BrowserProject = string // 'all' ou nome de projeto do playwright.config

export interface RunOptions {
  /** Arquivos .spec a executar; vazio = todos. */
  files: string[]
  mode: ExecMode
  project: BrowserProject
  /** null = Playwright decide (workers do playwright.config ou metade dos núcleos da CPU). */
  workers: number | null
  headed: boolean
  trace: TraceMode
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
      /** Tentativa (0 = primeira). */
      retry?: number
      /** Última tentativa do teste. Ausente (reporter antigo) = tratar como final. */
      final?: boolean
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
  device?: string
}

export interface CodegenResult {
  ok: boolean
  error?: string
}

export interface InstallResult {
  ok: boolean
  /** Mensagem para o usuário (próximo passo, motivo da falha...). */
  message?: string
}

export interface ReportInfo {
  /** Momento em que o HTML Report foi gerado (ISO); null = não existe report. */
  generatedAt: string | null
}

export interface QAStackApi {
  getState(): Promise<AppState>
  checkEnv(): Promise<EnvCheckItem[]>
  installBrowsers(): Promise<boolean>
  installEnvItem(id: EnvCheckItem['id']): Promise<InstallResult>
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
  reportInfo(): Promise<ReportInfo>
  clearResults(): Promise<void>
  codegen(opts: CodegenOptions): Promise<CodegenResult>
  onLog(cb: (line: LogLine) => void): () => void
  onTestEvent(cb: (ev: TestEvent) => void): () => void
  onRunFinished(cb: (ev: RunFinished) => void): () => void
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * O Playwright trata cada arquivo da linha de comando como regex de "contém".
 * "api/pedido.spec.ts" também pegaria "xapi/pedido.spec.ts" ou "outra-api/pedido.spec.ts".
 * Aqui o caminho vira um regex exato: separador \ ou / antes, caracteres escapados e fim ancorado.
 */
export function fileFilter(file: string): string {
  const parts = file.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(escapeRegex)
  return '[\\\\/]' + parts.join('[\\\\/]') + '$'
}

/** --grep exato para a tag: "@pedido" não pega "@pedido-venda". */
export function tagFilter(tag: string): string {
  return `${escapeRegex(tag)}(?![\\w-])`
}

export function buildPlaywrightArgs(opts: RunOptions): string[] {
  const args = ['playwright', 'test', ...opts.files.map(fileFilter)]
  if (opts.mode === 'ui') args.push('--ui')
  if (opts.mode === 'debug') args.push('--debug')
  if (opts.project && opts.project !== 'all') args.push(`--project=${opts.project}`)
  // --debug já abre o navegador; no UI Mode o --headed é ignorado
  if (opts.headed && opts.mode === 'normal') args.push('--headed')
  // UI Mode grava trace sempre e ignora --trace/--last-failed (tem filtros próprios)
  if (opts.mode !== 'ui' && opts.trace && opts.trace !== 'config') args.push(`--trace=${opts.trace}`)
  if (opts.mode !== 'ui' && opts.lastFailed) args.push('--last-failed')
  if (opts.grepTag) args.push(`--grep=${tagFilter(opts.grepTag)}`)
  // Sem --workers o Playwright usa o valor do playwright.config ou, se não houver, metade dos núcleos da CPU.
  // No Debug o Playwright força 1 worker.
  if (opts.mode !== 'debug' && opts.workers != null && opts.workers > 0) args.push(`--workers=${Math.floor(opts.workers)}`)
  return args
}
