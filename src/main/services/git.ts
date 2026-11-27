import { existsSync, mkdirSync } from 'fs'
import type { SyncRequest, SyncResult } from '@shared/types'
import { log } from './logger'
import { currentState, isCloned, lockHash } from './repo'
import { clonePathFor, loadSettings, saveSettings } from './settings'
import { exec } from './shell'
import { ensureBrowsers } from './env-check'
import { clearResults } from './results'

const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' }

function stream(prefix = '  ') {
  return (line: string) => log(prefix + line)
}

async function git(args: string[], cwd?: string): Promise<{ ok: boolean; out: string; err: string }> {
  log(`$ git ${args.join(' ')}`, 'cmd')
  const r = await exec('git', args, { cwd, env: GIT_ENV, onLine: stream() })
  return { ok: r.code === 0, out: r.stdout, err: r.stderr }
}

/** Instala as dependências do repositório (npm ci) quando o package-lock mudou. */
export async function ensureDeps(dir: string, force = false): Promise<boolean> {
  const s = loadSettings()
  const hash = lockHash(dir)
  const hasModules = existsSync(`${dir}/node_modules`)
  if (!force && hasModules && hash && hash === s.lockHash) {
    log('[QAStack] Dependências do projeto já estão atualizadas.', 'info')
    return true
  }
  const cmd = hash ? ['ci'] : ['install']
  log(`$ npm ${cmd.join(' ')}`, 'cmd')
  const r = await exec('npm', [...cmd, '--no-audit', '--no-fund'], { cwd: dir, onLine: stream() })
  if (r.code !== 0) {
    log('[QAStack] Falha ao instalar as dependências do projeto.', 'error')
    return false
  }
  saveSettings({ lockHash: hash })
  log('[QAStack] Dependências do projeto instaladas.', 'success')
  return true
}

interface RemoteInfo {
  ok: boolean
  heads: string[]
  defaultBranch: string | null
}

/** Consulta o remoto sem clonar: branches existentes e a branch padrão (HEAD). */
async function remoteInfo(url: string): Promise<RemoteInfo> {
  const r = await exec('git', ['ls-remote', '--symref', url], { env: GIT_ENV, timeoutMs: 60000 })
  if (r.code !== 0) return { ok: false, heads: [], defaultBranch: null }
  const heads: string[] = []
  let defaultBranch: string | null = null
  for (const line of r.stdout.split(/\r?\n/)) {
    const sym = line.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/)
    if (sym) defaultBranch = sym[1]
    const head = line.match(/^[0-9a-f]+\s+refs\/heads\/(\S+)$/)
    if (head) heads.push(head[1])
  }
  return { ok: true, heads, defaultBranch }
}

function sortBranches(names: string[]): string[] {
  const rank = (b: string) => (b === 'main' || b === 'master' ? 0 : b === 'develop' ? 1 : 2)
  return Array.from(new Set(names)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

async function currentBranch(dir: string): Promise<string | null> {
  const r = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, env: GIT_ENV })
  return r.code === 0 ? r.stdout.trim() || null : null
}

const sameUrl = (a: string, b: string) => a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()

export async function sync(req: SyncRequest): Promise<SyncResult> {
  const repoUrl = req.repoUrl.trim()
  const before = loadSettings()
  const switching = !sameUrl(repoUrl, before.repoUrl)
  // branch vazia = usar a branch padrão do repositório
  let branch = req.branch.trim()

  if (switching) {
    log(`[QAStack] Trocando de repositório: ${before.repoUrl} → ${repoUrl}`, 'info')
    // o que valia para o repositório anterior não vale para o novo
    saveSettings({ repoUrl, knownTests: null, lockHash: null, lastSync: null })
  }
  const s = saveSettings({ repoUrl, ...(branch ? { branch } : {}) })
  const dir = clonePathFor(s)
  // se a troca falhar, volta para o repositório anterior (que continua em disco)
  const rollback = (msg: string): SyncResult => {
    if (switching) {
      saveSettings({ repoUrl: before.repoUrl, branch: before.branch, knownTests: before.knownTests, lockHash: before.lockHash, lastSync: before.lastSync })
      log(`[QAStack] Mantido o repositório anterior: ${before.repoUrl}`, 'warn')
    }
    return { ok: false, state: currentState(), error: msg }
  }

  // repositório já clonado antes (ex.: voltando para um produto anterior): usa a branch dele
  if (switching && isCloned(dir) && !branch) branch = (await currentBranch(dir)) ?? ''

  if (!isCloned(dir)) {
    if (!existsSync(s.baseDir)) mkdirSync(s.baseDir, { recursive: true })
    if (existsSync(dir)) {
      const msg = `A pasta ${dir} já existe e não é um repositório Git. Renomeie ou remova a pasta e tente de novo.`
      log(`[QAStack] ${msg}`, 'error')
      return rollback(msg)
    }
    // descobre as branches do remoto antes de clonar
    log(`$ git ls-remote --symref ${repoUrl}`, 'cmd')
    const remote = await remoteInfo(repoUrl)
    if (!remote.ok) {
      const msg = 'Não foi possível acessar o repositório. Confira a URL e se a sua chave SSH tem acesso a ele.'
      log(`[QAStack] ${msg}`, 'error')
      return rollback(msg)
    }
    let target = branch
    if (!branch || !remote.heads.includes(branch)) {
      target = remote.defaultBranch ?? remote.heads[0] ?? 'main'
      if (branch) log(`[QAStack] A branch "${branch}" não existe no remoto. Usando a branch padrão "${target}".`, 'warn')
      else log(`[QAStack] Usando a branch padrão "${target}".`, 'info')
    }
    // core.longpaths evita falhas com o limite de 260 caracteres do Windows
    const r = await git(['clone', '-c', 'core.longpaths=true', '--branch', target, repoUrl, dir])
    if (!r.ok) {
      const msg = /Permission denied|publickey|Host key verification/i.test(r.err)
        ? 'O Bitbucket recusou a chave SSH. Verifique a chave em Verificação do ambiente.'
        : 'Não foi possível clonar o repositório. Veja os detalhes no console.'
      log(`[QAStack] ${msg}`, 'error')
      return rollback(msg)
    }
  } else {
    if (!branch) branch = (await currentBranch(dir)) ?? s.branch
    const steps: string[][] = [
      ['fetch', '--all', '--prune'],
      ['checkout', branch],
      ['pull', '--ff-only', 'origin', branch]
    ]
    for (const step of steps) {
      const r = await git(step, dir)
      if (!r.ok) {
        const msg =
          step[0] === 'pull'
            ? 'Não foi possível atualizar a branch sem conflito (há alterações locais no repositório clonado?).'
            : `Falha em git ${step[0]}. Veja os detalhes no console.`
        log(`[QAStack] ${msg}`, 'error')
        return { ok: false, state: currentState(), error: msg }
      }
    }
  }

  // a troca deu certo: os resultados da tela eram do repositório anterior
  if (switching) clearResults()

  const actual = await currentBranch(dir)
  if (actual && actual !== 'HEAD') saveSettings({ branch: actual })

  const depsOk = await ensureDeps(dir)
  // com o Playwright do repositório instalado, baixa os navegadores na revisão que ele exige
  const browsersOk = depsOk ? await ensureBrowsers() : false
  saveSettings({ lastSync: new Date().toISOString() })
  return {
    ok: depsOk && browsersOk,
    state: currentState(),
    error: !depsOk
      ? 'Repositório atualizado, mas a instalação das dependências falhou.'
      : !browsersOk
        ? 'Repositório atualizado, mas a instalação dos navegadores do Playwright falhou.'
        : undefined
  }
}

export async function listBranches(): Promise<string[]> {
  const s = loadSettings()
  const dir = clonePathFor(s)
  if (!isCloned(dir)) {
    // ainda não clonado: pergunta direto ao remoto
    const remote = await remoteInfo(s.repoUrl)
    if (!remote.ok || !remote.heads.length) return [s.branch]
    if (!remote.heads.includes(s.branch) && remote.defaultBranch) saveSettings({ branch: remote.defaultBranch })
    return sortBranches(remote.heads)
  }
  const r = await exec('git', ['branch', '-r', '--format=%(refname:short)'], { cwd: dir, env: GIT_ENV })
  const names = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith('/HEAD') && l !== 'origin')
    .map((l) => l.replace(/^origin\//, ''))
  return sortBranches(names)
}
