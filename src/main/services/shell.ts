import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'

export const isWindows = process.platform === 'win32'

/** Aspas para argumentos passados via shell (cmd.exe no Windows). */
export function quote(arg: string): string {
  if (arg === '') return '""'
  if (!/[\s"&|<>^()%!]/.test(arg)) return arg
  return `"${arg.replace(/"/g, '\\"')}"`
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface ExecOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void
}

/**
 * Inicia um comando com shell (necessário para npm/npx, que no Windows são .cmd).
 * Em sistemas não-Windows o processo vira líder de grupo para podermos matar a árvore.
 */
export function start(cmd: string, args: string[], opts: ExecOptions = {}): ChildProcess {
  const line = [cmd, ...args.map(quote)].join(' ')
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
    shell: true,
    windowsHide: true,
    detached: !isWindows
  }
  const child = spawn(line, [], spawnOpts)
  if (opts.onLine) {
    const emit = opts.onLine
    for (const stream of ['stdout', 'stderr'] as const) {
      let buf = ''
      child[stream]?.setEncoding('utf8')
      child[stream]?.on('data', (chunk: string) => {
        buf += chunk
        const parts = buf.split(/\r?\n/)
        buf = parts.pop() ?? ''
        for (const p of parts) if (p.length) emit(p, stream)
      })
      child[stream]?.on('end', () => {
        if (buf.length) emit(buf, stream)
        buf = ''
      })
    }
  }
  return child
}

export function exec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let child: ChildProcess
    try {
      child = start(cmd, args, {
        ...opts,
        onLine: (l, s) => {
          if (s === 'stdout') stdout += l + '\n'
          else stderr += l + '\n'
          opts.onLine?.(l, s)
        }
      })
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e) })
      return
    }
    let timer: NodeJS.Timeout | undefined
    if (opts.timeoutMs) {
      timer = setTimeout(() => killTree(child), opts.timeoutMs)
    }
    child.on('error', (e) => {
      stderr += String(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** Encerra o processo e todos os filhos (npx → node → navegadores). */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}
