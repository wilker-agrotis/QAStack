import { clipboard, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir, hostname } from 'os'
import { join } from 'path'
import type { EnvCheckItem, InstallResult } from '@shared/types'
import { log } from './logger'
import { isCloned } from './repo'
import { clonePathFor, loadSettings } from './settings'
import { exec, isWindows } from './shell'
import { gitHostName, installBrowsers, sshHostFromUrl } from './env-check'
import { ensureDeps } from './git'

// Instalação, pelo QAStack, dos itens pendentes da Verificação do ambiente.
// Git e Node.js vêm do winget (gerenciador de pacotes do Windows); sem winget, abre o site oficial.

const stream = (l: string) => log('  ' + l)

/**
 * O Windows só atualiza o PATH de processos novos. Depois de instalar Git/Node, relê o PATH
 * do registro (máquina + usuário) para o QAStack enxergar os programas sem precisar reabrir.
 */
async function refreshPath(): Promise<void> {
  if (!isWindows) return
  const r = await exec('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"
  ], { timeoutMs: 15000 })
  const fresh = r.stdout.trim()
  if (r.code === 0 && fresh) process.env.Path = process.env.PATH = fresh
}

async function wingetInstall(pkg: string, name: string, site: string, force = false): Promise<InstallResult> {
  const has = isWindows && (await exec('winget', ['--version'], { timeoutMs: 15000 })).code === 0
  if (!has) {
    await shell.openExternal(site)
    return { ok: false, message: `O winget não está disponível neste computador. Abri o site do ${name} para instalar manualmente; depois clique em Verificar novamente.` }
  }
  const args = [
    'install', '--id', pkg, '-e', '--source', 'winget',
    '--accept-package-agreements', '--accept-source-agreements',
    ...(force ? ['--force'] : [])
  ]
  log(`$ winget ${args.join(' ')}`, 'cmd')
  log(`[QAStack] Instalando ${name}. O Windows pode pedir permissão de administrador.`, 'info')
  const r = await exec('winget', args, { onLine: stream })
  const out = `${r.stdout}\n${r.stderr}`
  const already = /already installed|existing package|j[aá] (est[aá] )?instalad/i.test(out)
  if (r.code !== 0 && !already) {
    log(`[QAStack] Falha ao instalar ${name} (código ${r.code}).`, 'error')
    return { ok: false, message: `Não foi possível instalar o ${name}. Veja o console; se preferir, instale pelo site ${site}.` }
  }
  await refreshPath()
  log(`[QAStack] ${name} instalado.`, 'success')
  return { ok: true, message: `${name} instalado.` }
}

const installGit = () => wingetInstall('Git.Git', 'Git for Windows', 'https://git-scm.com/download/win')
const installNode = (force = false) => wingetInstall('OpenJS.NodeJS.LTS', 'Node.js LTS', 'https://nodejs.org/', force)

/** Gera a chave SSH (se ainda não existir), copia a pública e abre a página de chaves do servidor Git. */
async function setupSsh(): Promise<InstallResult> {
  if ((await exec('ssh', ['-V'], { timeoutMs: 10000 })).code !== 0) return installGit()

  const host = sshHostFromUrl(loadSettings().repoUrl) ?? 'bitbucket.org'
  const dir = join(homedir(), '.ssh')
  const key = join(dir, 'id_ed25519')
  const pub = `${key}.pub`

  if (!existsSync(pub)) {
    if (existsSync(key)) {
      return { ok: false, message: `Existe ${key} sem o arquivo .pub. Gere a pública com: ssh-keygen -y -f "${key}" > "${pub}"` }
    }
    mkdirSync(dir, { recursive: true })
    const args = ['-t', 'ed25519', '-f', key, '-N', '', '-C', `qastack@${hostname()}`]
    log(`$ ssh-keygen -t ed25519 -f ${key} -N "" -C qastack@${hostname()}`, 'cmd')
    const r = await exec('ssh-keygen', args, { onLine: stream, timeoutMs: 30000 })
    if (r.code !== 0 || !existsSync(pub)) {
      log('[QAStack] Falha ao gerar a chave SSH.', 'error')
      return { ok: false, message: 'Não foi possível gerar a chave SSH. Veja o console.' }
    }
    log(`[QAStack] Chave SSH criada em ${key}.`, 'success')
  } else {
    log(`[QAStack] Usando a chave SSH existente: ${pub}`, 'info')
  }

  clipboard.writeText(readFileSync(pub, 'utf8').trim())
  const name = gitHostName(host)
  const pages: Record<string, string> = {
    GitHub: 'https://github.com/settings/ssh/new',
    GitLab: 'https://gitlab.com/-/user_settings/ssh_keys',
    Bitbucket: 'https://bitbucket.org/account/settings/ssh-keys/'
  }
  await shell.openExternal(pages[name])
  log(`[QAStack] Chave pública copiada. Cole em ${name} › SSH keys › Add key e depois clique em Verificar novamente.`, 'info')
  return { ok: true, message: `Chave pública copiada. No ${name}, clique em "Add key", cole (Ctrl+V), salve e depois clique em Verificar novamente.` }
}

async function installDeps(): Promise<InstallResult> {
  const dir = clonePathFor(loadSettings())
  if (!isCloned(dir)) return { ok: false, message: 'Baixe o repositório antes de instalar as dependências.' }
  const ok = await ensureDeps(dir, true)
  return ok
    ? { ok: true, message: 'Dependências do projeto instaladas.' }
    : { ok: false, message: 'Falha ao instalar as dependências. Veja o console.' }
}

export async function installEnvItem(id: EnvCheckItem['id']): Promise<InstallResult> {
  try {
    switch (id) {
      case 'git': return await installGit()
      case 'node': return await installNode()
      case 'npm': return await installNode(true)
      case 'ssh': return await setupSsh()
      case 'deps': return await installDeps()
      case 'browsers': {
        const ok = await installBrowsers()
        return ok
          ? { ok: true, message: 'Navegadores do Playwright instalados.' }
          : { ok: false, message: 'Falha ao instalar os navegadores. Veja o console.' }
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log(`[QAStack] ${message}`, 'error')
    return { ok: false, message }
  }
}
