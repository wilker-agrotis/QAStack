import { useState } from 'react'
import type { CodegenOptions, EnvCheckItem, Suite } from '@shared/types'
import { formatDuration } from '../lib'
import { Modal, Spinner } from './ui'

// ---------- Verificação do ambiente ----------
export function EnvCheckModal(props: {
  open: boolean
  onClose: () => void
  items: EnvCheckItem[]
  busy: boolean
  installing: boolean
  onRecheck: () => void
  onInstallBrowsers: () => void
  showOnStartup: boolean
  onShowOnStartupChange: (show: boolean) => void
}) {
  const icons: Record<string, JSX.Element> = {
    ok: <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-bold shrink-0">✓</span>,
    missing: <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[11px] font-bold shrink-0">!</span>,
    waiting: <span className="w-5 h-5 rounded-full border border-slate-600 text-slate-500 flex items-center justify-center text-[11px] shrink-0">…</span>
  }
  const labels: Record<string, [string, string]> = {
    ok: ['OK', 'text-emerald-400'],
    missing: ['Pendente', 'text-amber-300'],
    waiting: ['Após o clone', 'text-slate-400'],
    checking: ['Verificando', 'text-sky-300'],
    installing: ['Instalando', 'text-sky-300']
  }
  const pend = props.items.filter((c) => c.status === 'missing')
  const blocked = pend.some((c) => c.blocking)

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      width="max-w-xl"
      title="Verificação do ambiente"
      subtitle="Dependências necessárias para clonar o repositório e rodar os testes automatizados."
      footer={
        <>
          <label
            className="mr-auto flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none"
            title="Se houver alguma pendência no ambiente, a verificação continua abrindo sozinha"
          >
            <input
              type="checkbox"
              checked={!props.showOnStartup}
              onChange={(e) => props.onShowOnStartupChange(!e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
            />
            Não mostrar novamente ao abrir
          </label>
          <button onClick={props.onRecheck} disabled={props.busy} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg">
            Verificar novamente
          </button>
          <button onClick={props.onClose} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
            Fechar
          </button>
        </>
      }
    >
      <div className="p-5 space-y-2 max-h-[55vh] overflow-y-auto">
        {props.busy && !props.items.length && (
          <div className="flex items-center gap-2 text-xs text-slate-400"><Spinner /> Verificando Git, Node.js, npm, SSH e Playwright…</div>
        )}
        {props.items.map((c) => {
          const status = c.id === 'browsers' && props.installing ? 'installing' : props.busy ? 'checking' : c.status
          const [label, color] = labels[status]
          return (
            <div key={c.id} className={`bg-[#0d1117] border ${status === 'missing' ? 'border-amber-500/40' : 'border-slate-800'} rounded-lg p-3`}>
              <div className="flex items-center gap-3">
                {icons[status] ?? <span className="w-5 h-5 flex items-center justify-center shrink-0"><Spinner /></span>}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-100">{c.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 break-words">
                    {status === 'installing' ? 'Executando npx playwright install...' : c.detail}
                  </div>
                </div>
                <span className={`text-[11px] font-medium shrink-0 ${color}`}>{label}</span>
              </div>
              {status === 'missing' && c.fix && (
                <ol className="fix-steps mt-2.5 ml-8 space-y-1 text-[11px] text-slate-400 list-decimal list-inside">
                  {/* textos fixos definidos no processo principal (env-check.ts), não vêm do repositório */}
                  {c.fix.map((f, i) => <li key={i} dangerouslySetInnerHTML={{ __html: f }} />)}
                </ol>
              )}
              {status === 'missing' && c.autoFix && (
                <div className="mt-2.5 ml-8">
                  <button onClick={props.onInstallBrowsers} className="bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold px-3 py-1.5 rounded-md transition">
                    Instalar agora
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!props.busy && props.items.length > 0 && (
        <div className="px-5 pb-4 text-xs">
          {pend.length > 0 ? (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-200 px-3 py-2">
              {pend.length} {pend.length > 1 ? 'pendências' : 'pendência'} no ambiente.{blocked ? ' Resolva antes de baixar o repositório.' : ''}
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-200 px-3 py-2">
              Ambiente pronto para clonar o repositório e rodar os testes.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ---------- Casos de uma suíte ----------
export function SuiteDetailsModal(props: { suite: Suite | null; onClose: () => void; onRun: () => void; canRun: boolean }) {
  const s = props.suite
  return (
    <Modal
      open={!!s}
      onClose={props.onClose}
      title={s?.title}
      subtitle={<span className="font-mono">{s?.file}</span>}
      footer={
        <>
          <span className="text-xs text-slate-400 mr-auto">{s?.cases.length} casos de teste mapeados neste arquivo</span>
          <button onClick={props.onRun} disabled={!props.canRun} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition">
            Executar Suíte
          </button>
          <button onClick={props.onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg transition">
            Fechar
          </button>
        </>
      }
    >
      <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2">
        {s?.cases.map((c, i) => {
          let icon = <span className="w-4 h-4 rounded-full border border-slate-600 inline-block shrink-0" />
          let text = 'text-slate-300'
          if (c.status === 'passed') {
            icon = <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
            text = 'text-emerald-200'
          } else if (c.status === 'failed') {
            icon = <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-bold shrink-0">✕</span>
            text = 'text-rose-200'
          } else if (c.status === 'running') {
            icon = <span className="w-4 h-4 flex items-center justify-center shrink-0"><Spinner /></span>
            text = 'text-sky-200'
          } else if (c.status === 'skipped') {
            icon = <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center text-[10px] shrink-0">–</span>
            text = 'text-slate-500'
          }
          return (
            <div key={c.key} className="bg-[#0d1117] border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {icon}
                  <span className="text-xs font-mono text-slate-500">#{i + 1}</span>
                  <span className={`text-xs ${text}`}>{c.title}</span>
                  {c.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">NOVO</span>}
                </div>
                <span className={`text-[11px] font-mono shrink-0 ${c.status === 'running' ? 'text-sky-300' : 'text-slate-500'}`}>
                  {c.status === 'running' && c.startedAt ? formatDuration(Date.now() - c.startedAt) : formatDuration(c.durationMs)}
                </span>
              </div>
              {c.status === 'failed' && c.error && (
                <pre className="mt-2.5 p-2.5 rounded bg-rose-950/30 border border-rose-500/30 text-[11px] font-mono text-rose-300 overflow-x-auto whitespace-pre-wrap">
                  {c.error}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

// ---------- Codegen ----------
export function CodegenModal(props: { open: boolean; onClose: () => void; onLaunch: (o: CodegenOptions) => void }) {
  const [url, setUrl] = useState('')
  const [output, setOutput] = useState('tests/gravado/novo-fluxo.spec.ts')
  const [device, setDevice] = useState('')
  const cmd = `npx playwright codegen ${device ? `--device="${device}" ` : ''}${output ? `-o ${output} ` : ''}${url}`
  const input = 'w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500'
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      width="max-w-lg"
      title={<span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />Playwright Codegen (Gravador)</span>}
      footer={
        <>
          <button onClick={props.onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg">Cancelar</button>
          <button
            onClick={() => props.onLaunch({ url: url.trim(), output: output.trim(), device: device || undefined })}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition"
          >
            Iniciar Gravação
          </button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-slate-400">
          Abre o inspetor do Playwright para gravar ações no navegador e gerar o código TypeScript dentro do repositório clonado.
        </p>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">URL alvo da gravação</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Salvar arquivo em</label>
            <input value={output} onChange={(e) => setOutput(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Dispositivo / Viewport</label>
            <select value={device} onChange={(e) => setDevice(e.target.value)} className={input}>
              <option value="">Desktop (padrão)</option>
              <option value="iPhone 14">iPhone 14</option>
              <option value="Pixel 7">Pixel 7</option>
            </select>
          </div>
        </div>
        <div className="bg-[#090c10] border border-slate-800 rounded-lg p-3">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Comando gerado:</span>
          <code className="text-xs font-mono text-purple-300 break-all">{cmd}</code>
        </div>
      </div>
    </Modal>
  )
}
