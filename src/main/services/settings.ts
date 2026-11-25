import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

export interface Settings {
  repoUrl: string
  /** Pasta base onde os repositórios são clonados. Curta de propósito (limite de 260 caracteres do Windows). */
  baseDir: string
  branch: string
  lastSync: string | null
  /** Hash do package-lock.json da última instalação de dependências. */
  lockHash: string | null
  /** Testes já vistos pelo usuário, para marcar o que é NOVO após um Sync. */
  knownTests: string[] | null
  /** Abrir a verificação do ambiente ao iniciar o app (pendências abrem mesmo assim). */
  showEnvOnStartup: boolean
}

const DEFAULTS: Settings = {
  repoUrl: 'git@ssh.bitbucket.org:agrotis/web-erp-automatizados.git',
  baseDir: process.platform === 'win32' ? 'C:\\QASTACK' : join(app.getPath('home'), 'QASTACK'),
  branch: 'main',
  lastSync: null,
  lockHash: null,
  knownTests: null,
  showEnvOnStartup: true
}

let cache: Settings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache!
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  const f = file()
  if (!existsSync(dirname(f))) mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function repoNameFromUrl(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? 'repositorio'
  return last.replace(/\.git$/, '') || 'repositorio'
}

export function clonePathFor(s: Settings): string {
  return join(s.baseDir, repoNameFromUrl(s.repoUrl))
}
