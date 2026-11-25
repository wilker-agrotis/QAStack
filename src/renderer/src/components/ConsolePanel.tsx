import { useEffect, useRef, useState } from 'react'
import type { LogLine } from '@shared/types'
import { IconChevron, IconCopy, IconDownload, IconReport } from './ui'

const COLORS: Record<LogLine['level'], string> = {
  default: 'text-slate-300',
  cmd: 'text-sky-300 font-semibold',
  success: 'text-emerald-400',
  error: 'text-rose-400',
  warn: 'text-amber-300',
  info: 'text-purple-300'
}

export function ConsolePanel(props: {
  lines: LogLine[]
  command: string
  onClear: () => void
  onCopy: () => void
  onReport: () => void
  onDownloadReport: () => void
  canReport: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.lines.length, collapsed])

  return (
    <footer className="bg-[#0b0e14] border-t border-slate-800 shrink-0">
      <div className="px-4 py-2 bg-[#161b22] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white shrink-0">
            <IconChevron className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <span>Console Playwright</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 bg-[#0d1117] border border-slate-800 rounded-md px-2.5 py-1 max-w-2xl min-w-0">
            <span className="text-emerald-400 font-mono text-[11px]">$</span>
            <code className="text-[11px] font-mono text-slate-300 truncate">{props.command}</code>
            <button onClick={props.onCopy} title="Copiar comando" className="text-slate-500 hover:text-slate-200 ml-1 shrink-0">
              <IconCopy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={props.onReport}
            disabled={!props.canReport}
            className="text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-300 border border-emerald-500/25 px-2.5 py-1 rounded-md transition flex items-center gap-1.5"
          >
            <IconReport className="w-3.5 h-3.5" />
            <span>HTML Report</span>
          </button>
          <button
            onClick={props.onDownloadReport}
            disabled={!props.canReport}
            title="Baixar o HTML Report da última execução (.zip)"
            className="text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-300 border border-emerald-500/25 px-2 py-1 rounded-md transition flex items-center gap-1.5"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span>Baixar</span>
          </button>
          <button onClick={props.onClear} className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition">
            Limpar
          </button>
        </div>
      </div>
      {!collapsed && (
        <div ref={body} className="h-44 overflow-y-auto p-3 font-mono text-xs space-y-0.5 bg-[#090c10] select-text">
          {props.lines.map((l, i) => (
            <div key={i} className={`${COLORS[l.level]} leading-relaxed whitespace-pre-wrap break-all`}>
              [{new Date(l.at).toLocaleTimeString('pt-BR', { hour12: false })}] {l.text}
            </div>
          ))}
        </div>
      )}
    </footer>
  )
}
