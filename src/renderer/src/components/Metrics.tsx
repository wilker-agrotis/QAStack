import type { Suite } from '@shared/types'

function Card(props: { label: string; value: string | number; color: string; wide?: boolean }) {
  return (
    <div className={`${props.wide ? 'col-span-2 sm:col-span-1 ' : ''}bg-[#161b22] border border-slate-800 rounded-xl p-3.5`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">{props.label}</p>
      <p className={`text-2xl font-bold mt-0.5 font-mono ${props.color}`}>{props.value}</p>
    </div>
  )
}

export function Metrics({ suites }: { suites: Suite[] }) {
  let total = 0
  let passed = 0
  let failed = 0
  for (const s of suites) {
    total += s.cases.length
    for (const c of s.cases) {
      if (c.status === 'passed') passed++
      if (c.status === 'failed') failed++
    }
  }
  const executed = passed + failed
  const rate = executed ? `${Math.round((passed / executed) * 100)}%` : '—'
  return (
    <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Card label="Suítes de Teste" value={suites.length} color="text-white" />
      <Card label="Casos de Teste" value={total} color="text-white" />
      <Card label="Passaram" value={passed} color="text-emerald-400" />
      <Card label="Falharam" value={failed} color="text-rose-400" />
      <Card label="Taxa de Sucesso" value={rate} color="text-slate-200" wide />
    </section>
  )
}
