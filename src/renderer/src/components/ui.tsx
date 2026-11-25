import type { ReactNode } from 'react'

export function Modal(props: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  width?: string
  children: ReactNode
  footer?: ReactNode
}) {
  if (!props.open) return null
  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div className={`bg-[#161b22] border border-slate-700 rounded-2xl ${props.width ?? 'max-w-2xl'} w-full overflow-hidden shadow-2xl`}>
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">{props.title}</h3>
            {props.subtitle && <div className="text-xs text-slate-400 mt-0.5">{props.subtitle}</div>}
          </div>
          <button onClick={props.onClose} aria-label="Fechar" className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        {props.children}
        {props.footer && (
          <div className="px-5 py-3 bg-[#0d1117] border-t border-slate-800 flex items-center justify-end gap-2">{props.footer}</div>
        )}
      </div>
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div
      className={`fixed bottom-56 right-5 bg-[#1f2937] border border-slate-700 text-slate-100 text-xs px-4 py-2.5 rounded-xl shadow-xl transition-opacity duration-200 z-50 flex items-center gap-2 pointer-events-none ${
        message ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span>{message}</span>
    </div>
  )
}

type IconProps = { className?: string }
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const IconX = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M6 18L18 6M6 6l12 12" /></svg>
)
export const IconCheck = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke} strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
)
export const IconPlay = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)
export const IconStop = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
)
export const IconSync = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)
export const IconFolder = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)
export const IconTerminal = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
export const IconSearch = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
)
export const IconCopy = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)
export const IconChevron = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M19 9l-7 7-7-7" /></svg>
)
export const IconReport = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)
export const IconDownload = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
  </svg>
)
export const Spinner = () => (
  <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-sky-400 rounded-full animate-spin inline-block" />
)
