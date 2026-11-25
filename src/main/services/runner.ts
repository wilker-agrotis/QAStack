import { app, BrowserWindow, dialog } from 'electron'
import type { ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  IPC,
  buildPlaywrightArgs,
  type CodegenOptions,
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
  child: ChildProcess
  files: string[]
  stopped: boolean
}

const runs = new Map<string, ActiveRun>()
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

export async function run(opts: RunOptions): Promise<RunStarted> {
  const dir = repoDir()
  // evita rodar a suíte inteira só para falhar com "Executable doesn't exist"
  if (!(await ensureBrowsers())) {
    throw new Error('Os navegadores do Playwright não estão instalados. Veja o console e a Verificação do ambiente.')
  }
  const id = `run-${++seq}`
  const args = buildPlaywrightArgs(opts)
  const shown = `npx ${args.map(quote).join(' ')}`

  // --reporter substitui os reporters do playwright.config, então mantemos list + html
  // e somamos o do QAStack. UI Mode e Debug abrem janelas próprias e não usam reporter.
  const reporter = existsSync(reporterPath()) ? reporterPath() : null
  const finalArgs = opts.mode === 'normal' && reporter ? [...args, `--reporter=list,html,${reporter}`] : args

  const recorder = new RunRecorder()
  log(`$ ${shown}`, 'cmd')
  if (opts.mode === 'ui') log('[Playwright UI] Abrindo a interface interativa...', 'info')
  if (opts.mode === 'debug') log('[PWDEBUG] Playwright Inspector será aberto.', 'warn')

  const child = start('npx', finalArgs, {
    cwd: dir,
    // o HTML Report não deve abrir sozinho ao final; o usuário abre pelo botão
    env: { PLAYWRIGHT_HTML_OPEN: 'never', PW_TEST_HTML_REPORT_OPEN: 'never' },
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

  const active: ActiveRun = { id, child, files: opts.files, stopped: false }
  runs.set(id, active)

  child.on('error', (e) => log(`[QAStack] Falha ao iniciar o Playwright: ${e.message}`, 'error'))
  child.on('close', (code) => {
    runs.delete(id)
    const finished: RunFinished = { runId: id, files: opts.files, exitCode: code, stopped: active.stopped }
    if (active.stopped) {
      recorder.onStopped()
      log('[QAStack] Execução interrompida pelo usuário (processo do Playwright encerrado).', 'warn')
    }
    else log(`[QAStack] Execução finalizada (código ${code}).`, code === 0 ? 'success' : 'error')
    send(IPC.runFinished, finished)
  })

  return { runId: id, command: shown }
}

export function stop(runId: string): void {
  const r = runs.get(runId)
  if (!r) return
  r.stopped = true
  killTree(r.child)
}

export function stopAll(): void {
  for (const id of Array.from(runs.keys())) stop(id)
}

export function openReport(): void {
  const dir = repoDir()
  if (!existsSync(join(dir, 'playwright-report', 'index.html'))) {
    log('[QAStack] Nenhum HTML Report encontrado. Rode os testes com o reporter html habilitado no playwright.config.', 'warn')
    return
  }
  log('$ npx playwright show-report', 'cmd')
  start('npx', ['playwright', 'show-report'], { cwd: dir, onLine: (l) => log('  ' + l) })
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

export function codegen(opts: CodegenOptions): void {
  const dir = repoDir()
  const args = ['playwright', 'codegen']
  if (opts.device) args.push(`--device=${opts.device}`)
  if (opts.output) args.push('-o', opts.output)
  if (opts.url) args.push(opts.url)
  log(`$ npx ${args.map(quote).join(' ')}`, 'cmd')
  start('npx', args, { cwd: dir, onLine: (l) => log('  ' + l) })
  log('[Playwright Codegen] Navegador e Inspector abertos para gravação.', 'info')
}
