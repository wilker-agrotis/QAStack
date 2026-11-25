import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AppState } from '@shared/types'
import { clonePathFor, loadSettings } from './settings'

/** Chaves aceitas para o tenant no .env do repositório (a primeira encontrada vence). */
const TENANT_KEYS = ['TENANT', 'QA_TENANT', 'ERP_TENANT', 'TENANT_NAME']

function readEnvFile(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['.env', '.env.qa', '.env.local']) {
    const f = join(dir, name)
    if (!existsSync(f)) continue
    for (const raw of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return out
}

export interface TenantInfo {
  tenant: string
  /** De onde o valor foi lido, para mostrar na dica do chip. */
  source: string
}

function readText(dir: string, name: string): string | null {
  const f = join(dir, name)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

/**
 * Procura o tenant no repositório, nesta ordem:
 * 1. variável no .env (TENANT, QA_TENANT...), se o time passar a usar .env
 * 2. variável de ambiente lida pelo playwright.config (ex.: process.env.TENANT ?? 'x')
 * 3. subdomínio do baseURL do playwright.config (https://<tenant>.agrotis.io)
 * 4. TENANT = "..." no Jenkinsfile
 */
export function readTenant(dir: string): TenantInfo | null {
  const env = readEnvFile(dir)
  for (const k of TENANT_KEYS) if (env[k]) return { tenant: env[k], source: `.env (${k})` }

  for (const cfgName of ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs']) {
    const cfg = readText(dir, cfgName)
    if (!cfg) continue
    const fromEnv = cfg.match(/process\.env\.(?:QA_|ERP_)?TENANT\s*(?:\?\?|\|\|)\s*['"`]([^'"`]+)['"`]/)
    if (fromEnv) return { tenant: fromEnv[1], source: `${cfgName} (TENANT padrão)` }
    // ignora linhas comentadas (o template do Playwright traz um baseURL comentado)
    for (const line of cfg.split(/\r?\n/)) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      const base = line.match(/\bbaseURL\s*:\s*[^'"`]*['"`]https?:\/\/([^./:'"`]+)\.[^'"`]*['"`]/)
      if (base) return { tenant: base[1], source: `${cfgName} (baseURL)` }
    }
  }

  const jenkins = readText(dir, 'Jenkinsfile')
  const j = jenkins?.match(/^\s*(?:def\s+)?TENANT\s*=\s*['"]([^'"]+)['"]/m)
  if (j) return { tenant: j[1], source: 'Jenkinsfile (TENANT)' }
  return null
}

export function readPlaywrightVersion(dir: string): string | null {
  for (const pkg of ['@playwright/test', 'playwright']) {
    const f = join(dir, 'node_modules', pkg, 'package.json')
    if (existsSync(f)) {
      try {
        return JSON.parse(readFileSync(f, 'utf8')).version ?? null
      } catch {
        /* segue */
      }
    }
  }
  return null
}

/** Faixa de versão do Node exigida pelo repositório (campo engines do package.json). */
export function readNodeEngine(dir: string): string | null {
  const f = join(dir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')).engines?.node ?? null
  } catch {
    return null
  }
}

export function lockHash(dir: string): string | null {
  const f = join(dir, 'package-lock.json')
  if (!existsSync(f)) return null
  return createHash('sha1').update(readFileSync(f)).digest('hex')
}

export function isCloned(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

export function currentState(): AppState {
  const s = loadSettings()
  const dir = clonePathFor(s)
  const cloned = isCloned(dir)
  const tenant = cloned ? readTenant(dir) : null
  return {
    repoUrl: s.repoUrl,
    clonePath: dir,
    branch: s.branch,
    cloned,
    tenant: tenant?.tenant ?? null,
    tenantSource: tenant?.source ?? null,
    playwrightVersion: cloned ? readPlaywrightVersion(dir) : null,
    lastSync: s.lastSync,
    showEnvOnStartup: s.showEnvOnStartup
  }
}
