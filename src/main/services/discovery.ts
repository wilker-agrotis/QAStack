import type { DiscoverResult, Suite, TestCase } from '@shared/types'
import { log } from './logger'
import { isCloned } from './repo'
import { clonePathFor, loadSettings, saveSettings } from './settings'
import { exec } from './shell'
import { applyResults } from './results'

// Formato (parcial) do reporter JSON do Playwright
interface JsonSpec {
  title: string
  file: string
  line: number
  tags?: string[]
}
interface JsonSuite {
  title: string
  file: string
  line?: number
  specs?: JsonSpec[]
  suites?: JsonSuite[]
}
interface JsonReport {
  config?: { projects?: { name?: string }[] }
  suites?: JsonSuite[]
  errors?: { message?: string }[]
}

let lastSuites: Suite[] = []
let lastProjects: string[] = []

const norm = (t: string) => (t.startsWith('@') ? t : `@${t}`)

function tagsIn(title: string): string[] {
  return title.match(/@[\w-]+/g) ?? []
}

function prettyFileName(file: string): string {
  const base = file.split('/').pop() ?? file
  const name = base.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '').replace(/\.api$/, '')
  return name.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function collect(suite: JsonSuite, path: string[], out: TestCase[]): void {
  for (const spec of suite.specs ?? []) {
    const titles = [...path, spec.title]
    const tags = Array.from(new Set([...(spec.tags ?? []).map(norm), ...titles.flatMap(tagsIn)]))
    out.push({
      key: `${spec.file}::${titles.join(' › ')}`,
      title: titles.join(' › '),
      line: spec.line,
      tags,
      status: 'pending'
    })
  }
  for (const child of suite.suites ?? []) collect(child, [...path, child.title], out)
}

/** Extrai o JSON mesmo que o Playwright imprima avisos antes ou depois. */
function parseReport(stdout: string): JsonReport | null {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(stdout.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function discover(): Promise<DiscoverResult> {
  const s = loadSettings()
  const dir = clonePathFor(s)
  if (!isCloned(dir)) return { ok: true, suites: [], projects: [] }

  log('$ npx playwright test --list --reporter=json', 'cmd')
  const r = await exec('npx', ['playwright', 'test', '--list', '--reporter=json'], { cwd: dir, timeoutMs: 120000 })
  const report = parseReport(r.stdout)
  if (!report) {
    const msg = 'Não foi possível listar os testes. O playwright.config do repositório carregou sem erros?'
    log(`[QAStack] ${msg}`, 'error')
    for (const l of r.stderr.split(/\r?\n/).filter(Boolean).slice(0, 20)) log('  ' + l, 'error')
    return { ok: false, suites: lastSuites, projects: lastProjects, error: msg }
  }
  for (const e of report.errors ?? []) if (e.message) log(e.message.split('\n')[0], 'error')

  const known = s.knownTests ? new Set(s.knownTests) : null
  const byFile = new Map<string, Suite>()
  for (const top of report.suites ?? []) {
    const raw: TestCase[] = []
    collect(top, [], raw)
    // o Playwright pode repetir a mesma spec (um item por projeto/navegador): deduplica pela chave
    const cases = Array.from(new Map(raw.map((c) => [c.key, c])).values())
    if (!cases.length) continue
    const describes = (top.suites ?? []).filter((x) => x.title)
    const title = describes.length === 1 ? describes[0].title.replace(/@[\w-]+/g, '').trim() : prettyFileName(top.file)
    const prev = byFile.get(top.file)
    const merged = prev ? prev.cases.concat(cases.filter((c) => !prev.cases.some((p) => p.key === c.key))) : cases
    byFile.set(top.file, {
      file: top.file,
      title: title || prettyFileName(top.file),
      tags: Array.from(new Set(merged.flatMap((c) => c.tags))),
      cases: merged
    })
  }

  const suites = Array.from(byFile.values()).sort((a, b) => a.file.localeCompare(b.file))
  if (known) {
    for (const suite of suites) {
      for (const c of suite.cases) c.isNew = !known.has(c.key)
      suite.isNew = suite.cases.every((c) => c.isNew)
    }
  } else {
    // primeira descoberta: nada é "novo"
    saveSettings({ knownTests: suites.flatMap((x) => x.cases.map((c) => c.key)) })
  }

  // mantém o histórico: o último resultado de cada caso volta para a tela
  applyResults(suites)

  const total = suites.reduce((a, x) => a + x.cases.length, 0)
  const removed = known ? Array.from(known).filter((k) => !suites.some((x) => x.cases.some((c) => c.key === k))).length : 0
  log(`[QAStack] ${suites.length} suítes e ${total} casos descobertos.`, 'success')
  if (removed) log(`[QAStack] ${removed} ${removed > 1 ? 'casos removidos' : 'caso removido'} desde o último Sync.`, 'warn')
  const projects = (report.config?.projects ?? []).map((p) => p.name ?? '').filter(Boolean)
  lastSuites = suites
  lastProjects = projects
  return { ok: true, suites, projects }
}

export function markSeen(): void {
  saveSettings({ knownTests: lastSuites.flatMap((x) => x.cases.map((c) => c.key)) })
  for (const s of lastSuites) {
    s.isNew = false
    for (const c of s.cases) c.isNew = false
  }
}
