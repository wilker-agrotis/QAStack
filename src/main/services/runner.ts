import { app, BrowserWindow, dialog, shell } from 'electron'
import { createServer } from 'net'
import type { ChildProcess } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  IPC,
  buildPlaywrightArgs,
  type CodegenOptions,
  type CodegenResult,
  type ReportInfo,
  type RunFinished,
  type RunOptions,
  type RunStarted,
  type TestEvent
} from '@shared/types'
import { log, send } from './logger'
import { isCloned } from './repo'
import { clonePathFor, loadSettings } from './settings'
import { exec, isWindows, killTree, quote, start } from './shell'
import { ensureBrowsers } from './env-check'
import { RunRecorder } from './results'

const PREFIX = '@@QASTACK@@'

interface ActiveRun {
  id: string
  child: ChildProcess | null
  files: string[]
  stopped: boolean
}

interface QueuedRun {
  id: string
  opts: RunOptions
  dir: string
}

const runs = new Map<string, ActiveRun>()
// Uma execução do Playwright por vez: execuções simultâneas disputam os usuários do pool
// (1 por worker, ver playwright.config) e apagam a pasta test-results/playwright-report uma da outra.
const queue: QueuedRun[] = []
let seq = 0

function reporterPath(): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, 'qastack-reporter.cjs')
}

function repoDir(): string {
  const dir = clonePathFor(loadSettings())
  if (!isCloned(dir)) throw new Error('Repositório ainda não foi baixado. Use Baixar / Sync primeiro.')
  return dir
}

/**
 * --last-failed lê <outputDir>/.last-run.json (test-results por padrão).
 * Sem falhas registradas o Playwright aborta com "No tests found"; sem o arquivo, roda tudo.
 */
function checkLastFailed(dir: string): void {
  const file = join(dir, 'test-results', '.last-run.json')
  if (!existsSync(file)) {
    log('[QAStack] --last-failed: não há registro da última execução (test-results/.last-run.json). O Playwright vai rodar todos os testes selecionados.', 'warn')
    return
  }
  try {
    const info = JSON.parse(readFileSync(file, 'utf8')) as { failedTests?: string[] }
    if (!info.failedTests?.length) {
      throw new Error('Nenhum teste falhou na última execução: não há o que repetir com --last-failed.')
    }
  } catch (e) {
    if (e instanceof SyntaxError) return // arquivo corrompido: deixa o Playwright decidir
    throw e
  }
}

export async function run(opts: RunOptions): Promise<RunStarted> {
  const dir = repoDir()
  // evita rodar a suíte inteira só para falhar com "Executable doesn't exist"
  if (!(await ensureBrowsers())) {
    throw new Error('Os navegadores do Playwright não estão instalados. Veja o console e a Verificação do ambiente.')
  }
  if (opts.lastFailed && opts.mode !== 'ui') checkLastFailed(dir)

  const id = `run-${++seq}`
  const shown = `npx ${buildPlaywrightArgs(opts).map(quote).join(' ')}`
  if (runs.size > 0) {
    queue.push({ id, opts, dir })
    runs.set(id, { id, child: null, files: opts.files, stopped: false })
    log(`[QAStack] Já existe uma execução em andamento. Esta entrou na fila (${queue.length}ª) e começa quando a atual terminar.`, 'warn')
  } else {
    launch(id, opts, dir)
  }
  return { runId: id, command: shown }
}

function launch(id: string, opts: RunOptions, dir: string): void {
  const args = buildPlaywrightArgs(opts)
  const shown = `npx ${args.map(quote).join(' ')}`

  // --reporter substitui os reporters do playwright.config, então mantemos list + html
  // e somamos o do QAStack (cards em tempo real). O UI Mode tem tela própria e ignora reporters.
  const reporter = existsSync(reporterPath()) ? reporterPath() : null
  const finalArgs = opts.mode !== 'ui' && reporter ? [...args, `--reporter=list,html,${reporter}`] : args

  const env: NodeJS.ProcessEnv = { PLAYWRIGHT_HTML_OPEN: 'never', PW_TEST_HTML_REPORT_OPEN: 'never' }
  // Repassa os workers também por variável: configs que validam WORKERS (ex.: pool de usuários
  // do web-erp-automatizados) falham com mensagem clara em vez de derrubar sessões.
  if (opts.mode !== 'debug' && opts.workers != null && opts.workers > 0) env.WORKERS = String(Math.floor(opts.workers))

  const recorder = new RunRecorder()
  log(`$ ${shown}`, 'cmd')
  if (opts.mode === 'ui') log('[Playwright UI] Abrindo a interface interativa...', 'info')
  if (opts.mode === 'debug') log('[PWDEBUG] Playwright Inspector será aberto (1 worker, sem timeout, para na 1ª falha).', 'warn')

  const child = start('npx', finalArgs, {
    cwd: dir,
    // o HTML Report não deve abrir sozinho ao final; o usuário abre pelo botão
    env,
    onLine: (line, stream) => {
      if (line.startsWith(PREFIX)) {
        try {
          const ev = { ...JSON.parse(line.slice(PREFIX.length)), runId: id } as TestEvent
          recorder.onEvent(ev)
          send(IPC.testEvent, ev)
        } catch {
          /* linha corrompida: ignora */
        }
        return
      }
      const level = stream === 'stderr' ? 'warn' : /✘|failed|Error/i.test(line) ? 'error' : /✓|passed/i.test(line) ? 'success' : 'default'
      log('  ' + line, level)
    }
  })

  const active: ActiveRun = runs.get(id) ?? { id, child: null, files: opts.files, stopped: false }
  active.child = child
  runs.set(id, active)

  child.on('error', (e) => log(`[QAStack] Falha ao iniciar o Playwright: ${e.message}`, 'error'))
  child.on('close', (code) => {
    runs.delete(id)
    const finished: RunFinished = { runId: id, files: opts.files, exitCode: code, stopped: active.stopped }
    if (active.stopped) {
      recorder.onStopped()
      log('[QAStack] Execução interrompida pelo usuário (processo do Playwright encerrado).', 'warn')
    } else log(`[QAStack] Execução finalizada (código ${code}).`, code === 0 ? 'success' : 'error')
    send(IPC.runFinished, finished)
    next()
  })
}

/** Inicia a próxima execução da fila, se houver. */
function next(): void {
  const q = queue.shift()
  if (!q) return
  log('[QAStack] Iniciando a próxima execução da fila.', 'info')
  launch(q.id, q.opts, q.dir)
}

export function stop(runId: string): void {
  const r = runs.get(runId)
  if (!r) return
  r.stopped = true
  if (r.child) {
    killTree(r.child)
    return
  }
  // ainda na fila: só remove
  const i = queue.findIndex((q) => q.id === runId)
  if (i >= 0) queue.splice(i, 1)
  runs.delete(runId)
  log('[QAStack] Execução removida da fila.', 'warn')
  const finished: RunFinished = { runId, files: r.files, exitCode: null, stopped: true }
  send(IPC.runFinished, finished)
}

export function stopAll(): void {
  // esvazia a fila antes, para o fim da execução atual não disparar a próxima
  for (const q of queue.slice().reverse()) stop(q.id)
  for (const id of Array.from(runs.keys())) stop(id)
}

/** Data do HTML Report atual: o Playwright grava o index.html ao fim de cada execução. */
export function reportInfo(): ReportInfo {
  try {
    const dir = clonePathFor(loadSettings())
    const index = join(dir, 'playwright-report', 'index.html')
    if (!isCloned(dir) || !existsSync(index)) return { generatedAt: null }
    return { generatedAt: statSync(index).mtime.toISOString() }
  } catch {
    return { generatedAt: null }
  }
}

// Servidor do `playwright show-report` iniciado pelo QAStack. Fica vivo para ser reaproveitado:
// ele lê os arquivos do disco, então mostra sempre o report mais recente.
let reportServer: { child: ChildProcess; port: number; dir: string } | null = null
const DEFAULT_REPORT_PORT = 9323

/** Porta livre em localhost: 9323 se estiver disponível, senão uma escolhida pelo sistema. */
function freePort(preferred: number): Promise<number> {
  const tryListen = (port: number) =>
    new Promise<number | null>((resolve) => {
      const srv = createServer()
      srv.once('error', () => resolve(null))
      srv.listen(port, 'localhost', () => {
        const addr = srv.address()
        const p = typeof addr === 'object' && addr ? addr.port : null
        srv.close(() => resolve(p))
      })
    })
  return tryListen(preferred).then((p) => p ?? tryListen(0).then((q) => q ?? preferred))
}

export function stopReportServer(): void {
  if (reportServer) killTree(reportServer.child)
  reportServer = null
}

export async function openReport(): Promise<void> {
  const dir = repoDir()
  if (!existsSync(join(dir, 'playwright-report', 'index.html'))) {
    log('[QAStack] Nenhum HTML Report encontrado. Rode os testes com o reporter html habilitado no playwright.config.', 'warn')
    return
  }

  // já existe um servidor deste repositório: só abre o navegador de novo
  if (reportServer && reportServer.dir === dir && reportServer.child.exitCode === null) {
    const url = `http://localhost:${reportServer.port}`
    log(`[QAStack] Abrindo o HTML Report em ${url}`, 'info')
    await shell.openExternal(url)
    return
  }
  stopReportServer() // servidor de outro repositório ou já encerrado

  // 9323 pode estar presa por um show-report antigo (terminal ou sessão anterior do app)
  const port = await freePort(DEFAULT_REPORT_PORT)
  if (port !== DEFAULT_REPORT_PORT) {
    log(`[QAStack] A porta ${DEFAULT_REPORT_PORT} está ocupada por outro processo; usando a porta ${port}.`, 'warn')
  }
  const args = ['playwright', 'show-report', '--port', String(port)]
  log(`$ npx ${args.join(' ')}`, 'cmd')
  const child = start('npx', args, { cwd: dir, onLine: (l) => log('  ' + l) })
  const current = { child, port, dir }
  reportServer = current
  child.on('error', (e) => log(`[QAStack] Falha ao abrir o HTML Report: ${e.message}`, 'error'))
  child.on('close', () => {
    if (reportServer === current) reportServer = null
  })
}

/** Compacta a pasta playwright-report em um .zip escolhido pelo usuário. */
export async function downloadReport(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const dir = repoDir()
  const reportDir = join(dir, 'playwright-report')
  if (!existsSync(join(reportDir, 'index.html'))) {
    const error = 'Nenhum HTML Report encontrado. Rode os testes primeiro.'
    log(`[QAStack] ${error}`, 'warn')
    return { ok: false, error }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h')
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const pick = await dialog.showSaveDialog(win, {
    title: 'Salvar HTML Report',
    defaultPath: join(app.getPath('downloads'), `playwright-report_${stamp}.zip`),
    filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }]
  })
  if (pick.canceled || !pick.filePath) return { ok: false }
  const out = pick.filePath
  log(`[QAStack] Compactando o HTML Report em ${out}...`, 'info')
  const r = isWindows
    ? await exec('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${reportDir.replace(/'/g, "''")}\\*' -DestinationPath '${out.replace(/'/g, "''")}' -Force`
      ])
    : await exec('zip', ['-r', '-q', out, '.'], { cwd: reportDir })
  if (r.code !== 0) {
    const error = 'Não foi possível compactar o HTML Report.'
    log(`[QAStack] ${error} ${r.stderr.trim()}`, 'error')
    return { ok: false, error }
  }
  log(`[QAStack] HTML Report salvo em ${out}`, 'success')
  return { ok: true, path: out }
}

/** Aceita "qa-erp.agrotis.io", "localhost:3000/login" etc.; sem protocolo assume https. */
function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s
  return /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(s) ? `http://${s}` : `https://${s}`
}

/**
 * Abre o Playwright Codegen sem gravar nada no repositório: o código gerado
 * fica só no Inspector, para o usuário copiar se quiser.
 */
export function codegen(opts: CodegenOptions): CodegenResult {
  try {
    const dir = repoDir()
    const url = normalizeUrl(opts.url)
    const args = ['playwright', 'codegen']
    if (opts.device) args.push(`--device=${opts.device}`)
    if (url) args.push(url)
    log(`$ npx ${args.map(quote).join(' ')}`, 'cmd')
    const child = start('npx', args, { cwd: dir, onLine: (l) => log('  ' + l) })
    child.on('error', (e) => log(`[Playwright Codegen] Falha ao iniciar: ${e.message}`, 'error'))
    child.on('close', (code) => {
      if (code === 0) log('[Playwright Codegen] Gravação encerrada.', 'info')
      else log(`[Playwright Codegen] Encerrado com código ${code}.`, 'error')
    })
    log('[Playwright Codegen] Navegador e Inspector abertos. O código gerado fica no Inspector (nada é salvo no repositório).', 'info')
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log(`[Playwright Codegen] ${error}`, 'error')
    return { ok: false, error }
  }
}
