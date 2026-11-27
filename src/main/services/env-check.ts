import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { EnvCheckItem } from '@shared/types'
import { log } from './logger'
import { isCloned, readNodeEngine } from './repo'
import { clonePathFor, loadSettings } from './settings'
import { exec, isWindows } from './shell'

function firstLine(s: string): string {
  return s.split(/\r?\n/).find((l) => l.trim())?.trim() ?? ''
}

/** Verificação simples de faixa de versão (>=20, ^20.11, 20.x, >=18 <23). */
export function satisfiesEngine(version: string, range: string): boolean {
  const cur = version.replace(/^v/, '').split('.').map(Number)
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < 3; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0)
      if (d) return d
    }
    return 0
  }
  return range
    .split('||')
    .some((alt) =>
      alt
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .every((part) => {
          const m = part.match(/^(>=|<=|>|<|\^|~|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/)
          if (!m) return true
          const op = m[1] ?? '='
          const want = [Number(m[2]), Number(m[3]) || 0, Number(m[4]) || 0]
          const c = cmp(cur, want)
          switch (op) {
            case '>=': return c >= 0
            case '>': return c > 0
            case '<=': return c <= 0
            case '<': return c < 0
            case '^': return cur[0] === want[0] && c >= 0
            case '~': return cur[0] === want[0] && cur[1] === want[1] && c >= 0
            default:
              return m[3] === undefined || m[3] === 'x' || m[3] === '*' ? cur[0] === want[0] : c === 0
          }
        })
    )
}

export function gitHostName(host: string): string {
  return /github/i.test(host) ? 'GitHub' : /gitlab/i.test(host) ? 'GitLab' : 'Bitbucket'
}

export function sshHostFromUrl(url: string): string | null {
  const scp = url.match(/^[\w.-]+@([\w.-]+):/)
  if (scp) return scp[1]
  const ssh = url.match(/^ssh:\/\/(?:[\w.-]+@)?([\w.-]+)/)
  return ssh ? ssh[1] : null
}

async function checkGit(): Promise<EnvCheckItem> {
  const r = await exec('git', ['--version'], { timeoutMs: 15000 })
  return r.code === 0
    ? { id: 'git', name: 'Git for Windows', blocking: true, status: 'ok', detail: firstLine(r.stdout) }
    : {
        id: 'git', name: 'Git for Windows', blocking: true, status: 'missing',
        detail: 'Git não encontrado no PATH.',
        autoFix: true, installLabel: 'Instalar Git for Windows',
        fix: ['Ou instale manualmente pelo site git-scm.com e clique em Verificar novamente.']
      }
}

async function checkNode(dir: string, cloned: boolean): Promise<EnvCheckItem> {
  const r = await exec('node', ['--version'], { timeoutMs: 15000 })
  if (r.code !== 0) {
    return {
      id: 'node', name: 'Node.js', blocking: true, status: 'missing',
      detail: 'Node.js não encontrado no PATH.',
      autoFix: true, installLabel: 'Instalar Node.js LTS',
      fix: ['Ou instale manualmente pelo site nodejs.org e clique em Verificar novamente.']
    }
  }
  const version = firstLine(r.stdout)
  const engine = cloned ? readNodeEngine(dir) : null
  if (engine && !satisfiesEngine(version, engine)) {
    return {
      id: 'node', name: 'Node.js', blocking: true, status: 'missing',
      version,
      detail: `${version} instalado, mas o repositório pede ${engine} (campo engines do package.json).`,
      fix: [`Instale uma versão do Node.js compatível com ${engine} e reabra o QAStack.`]
    }
  }
  return {
    id: 'node', name: 'Node.js', blocking: true, status: 'ok', version,
    detail: engine ? `${version} — compatível com ${engine}` : version
  }
}

async function checkNpm(): Promise<EnvCheckItem> {
  const r = await exec('npm', ['--version'], { timeoutMs: 20000 })
  return r.code === 0
    ? { id: 'npm', name: 'npm', blocking: true, status: 'ok', detail: firstLine(r.stdout) }
    : {
        id: 'npm', name: 'npm', blocking: true, status: 'missing',
        detail: 'npm não encontrado.',
        autoFix: true, installLabel: 'Reinstalar Node.js LTS (inclui npm)',
        fix: ['O npm vem junto com o Node.js. Ou reinstale manualmente pelo site nodejs.org.']
      }
}

async function checkSsh(repoUrl: string): Promise<EnvCheckItem> {
  const host = sshHostFromUrl(repoUrl)
  const base = { id: 'ssh' as const, name: 'Chave SSH do Bitbucket', blocking: true }
  if (!host) return { ...base, status: 'ok', detail: 'O repositório não usa SSH.' }
  const r = await exec(
    'ssh',
    ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', `git@${host}`],
    { timeoutMs: 25000 }
  )
  const out = `${r.stdout}\n${r.stderr}`
  if (/authenticated|logged in as|successfully authenticated|You can use git/i.test(out)) {
    return { ...base, status: 'ok', detail: `Autenticado em ${host}` }
  }
  const pubKey = isWindows ? '%USERPROFILE%\\.ssh\\id_ed25519.pub' : '~/.ssh/id_ed25519.pub'
  const noClient = /not recognized|not found|ENOENT/i.test(out)
  return {
    ...base,
    status: 'missing',
    autoFix: true,
    installLabel: noClient ? 'Instalar Git for Windows (inclui SSH)' : `Gerar chave e abrir o ${gitHostName(host)}`,
    detail: noClient
      ? 'Cliente SSH não encontrado no PATH.'
      : `Nenhuma chave autorizada em ${host}. O clone usa ${repoUrl}.`,
    fix: [
      'No PowerShell, gere a chave: <code>ssh-keygen -t ed25519</code>',
      `Cadastre o conteúdo de <code>${pubKey}</code> em Bitbucket › Personal settings › SSH keys`,
      'Se a chave tiver senha, ative o serviço <code>ssh-agent</code> e rode <code>ssh-add</code>'
    ]
  }
}

/**
 * Pergunta ao Playwright DO REPOSITÓRIO quais navegadores (e revisões) ele exige e
 * confere se cada pasta existe. Cada versão do Playwright pede uma revisão própria
 * (ex.: chromium-1200), então ter "algum chromium" instalado não basta.
 * Retorna null quando não dá para saber (ex.: dependências ainda não instaladas).
 */
/**
 * Navegadores que os projetos ATIVOS do playwright.config usam (linhas comentadas são ignoradas).
 * Ex.: só o projeto "chromium" ativo → instala só o Chromium, e não Firefox/WebKit.
 */
export function browsersForProjects(dir: string): string[] {
  let text = ''
  for (const name of ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs']) {
    const f = join(dir, name)
    if (existsSync(f)) {
      text = readFileSync(f, 'utf8')
      break
    }
  }
  const found = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
    for (const m of line.matchAll(/\b(?:name\s*:\s*['"`]([^'"`]+)['"`]|devices\[\s*['"`]([^'"`]+)['"`]\s*\])/g)) {
      const v = (m[1] ?? m[2]).toLowerCase()
      if (/firefox/.test(v)) found.add('firefox')
      else if (/webkit|safari|iphone|ipad/.test(v)) found.add('webkit')
      else if (/chrom|edge|pixel|galaxy|desktop|mobile/.test(v)) found.add('chromium')
    }
  }
  return found.size ? Array.from(found) : ['chromium', 'firefox', 'webkit']
}

export async function missingBrowsers(dir: string): Promise<{ required: string[]; missing: string[] } | null> {
  if (!existsSync(join(dir, 'node_modules', '.bin'))) return null
  const browsers = browsersForProjects(dir)
  const r = await exec('npx', ['--no-install', 'playwright', 'install', '--dry-run', ...browsers], { cwd: dir, timeoutMs: 60000 })
  if (r.code !== 0) return null
  const required: string[] = []
  const missing: string[] = []
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*Install location:\s+(.+?)\s*$/)
    if (!m) continue
    const loc = m[1]
    const name = loc.split(/[\\/]/).pop() ?? loc
    required.push(name)
    if (!existsSync(loc)) missing.push(name)
  }
  return required.length ? { required, missing } : null
}

async function checkBrowsers(dir: string, cloned: boolean): Promise<EnvCheckItem> {
  const base = { id: 'browsers' as const, name: 'Navegadores do Playwright', blocking: false }
  if (!cloned) return { ...base, status: 'waiting', detail: 'Instalados após o clone, com a versão do Playwright do repositório.' }
  const result = await missingBrowsers(dir)
  if (!result) {
    return { ...base, status: 'waiting', detail: 'Verificados depois que as dependências do projeto forem instaladas (Baixar / Sync).' }
  }
  if (!result.missing.length) return { ...base, status: 'ok', detail: `Versões exigidas pelo repositório instaladas: ${result.required.join(', ')}` }
  return {
    ...base, status: 'missing', autoFix: true, installLabel: 'Instalar navegadores',
    detail: `Faltando para o Playwright do repositório: ${result.missing.join(', ')}. O QAStack pode instalar automaticamente.`
  }
}

/** Instala os navegadores exigidos pelo repositório, se faltar algum. */
export async function ensureBrowsers(): Promise<boolean> {
  const dir = clonePathFor(loadSettings())
  const result = await missingBrowsers(dir)
  if (result && !result.missing.length) return true
  if (result) log(`[QAStack] Navegadores do Playwright ausentes: ${result.missing.join(', ')}. Instalando...`, 'warn')
  return installBrowsers()
}

function checkDeps(dir: string, cloned: boolean): EnvCheckItem {
  const base = { id: 'deps' as const, name: 'Dependências do projeto e Playwright', blocking: false }
  if (!cloned) return { ...base, status: 'waiting', detail: 'Instaladas automaticamente (npm ci) logo após o clone do repositório.' }
  if (existsSync(join(dir, 'node_modules', '@playwright', 'test'))) {
    return { ...base, status: 'ok', detail: '@playwright/test instalado no repositório.' }
  }
  return {
    ...base, status: 'missing',
    detail: 'Dependências ausentes no repositório clonado.',
    autoFix: true, installLabel: 'Instalar dependências (npm ci)',
    fix: ['Ou clique em <strong>Baixar / Sync</strong>, que também instala as dependências.']
  }
}

export async function checkEnvironment(): Promise<EnvCheckItem[]> {
  log('[QAStack] Verificando dependências do ambiente...', 'info')
  const s = loadSettings()
  const dir = clonePathFor(s)
  const cloned = isCloned(dir)
  const [gitItem, nodeItem, npmItem, sshItem] = await Promise.all([
    checkGit(), checkNode(dir, cloned), checkNpm(), checkSsh(s.repoUrl)
  ])
  const items = [gitItem, nodeItem, npmItem, sshItem, await checkBrowsers(dir, cloned), checkDeps(dir, cloned)]
  const pend = items.filter((i) => i.status === 'missing').length
  log(
    pend
      ? `[QAStack] Verificação do ambiente: ${pend} ${pend > 1 ? 'pendências encontradas' : 'pendência encontrada'}.`
      : '[QAStack] Verificação do ambiente: tudo certo.',
    pend ? 'warn' : 'success'
  )
  return items
}

export async function installBrowsers(): Promise<boolean> {
  const dir = clonePathFor(loadSettings())
  if (!isCloned(dir)) {
    log('[QAStack] Baixe o repositório antes de instalar os navegadores.', 'warn')
    return false
  }
  log(`$ npx playwright install ${browsersForProjects(dir).join(' ')}`, 'cmd')
  log('[QAStack] Baixando os navegadores exigidos pelo repositório (pode levar alguns minutos)...', 'info')
  const browsers = browsersForProjects(dir)
  log(`[QAStack] Navegadores usados pelos projetos do playwright.config: ${browsers.join(', ')}`, 'info')
  const r = await exec('npx', ['--no-install', 'playwright', 'install', ...browsers], { cwd: dir, onLine: (l) => log('  ' + l) })
  if (r.code === 0) {
    log('[QAStack] Navegadores do Playwright instalados.', 'success')
    return true
  }
  log('[QAStack] Falha ao instalar os navegadores (rede, proxy ou antivírus podem bloquear o download).', 'error')
  return false
}
