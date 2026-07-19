import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import Link from 'next/link'

export default async function AdminResumen() {
  const supabase = createClient()

  const { data: clients } = await supabase.from('profiles').select('id, name').eq('role', 'client')
  const { data: ordersData } = await supabase.from('orders').select('id, client_id, total, payments(monto)')
  const { data: productos } = await supabase.from('products').select('id, publicado')

  const saldoPorCliente = new Map<string, number>()
  for (const o of ordersData || []) {
    const paid = (o.payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    const saldo = Number(o.total) - paid
    saldoPorCliente.set(o.client_id, (saldoPorCliente.get(o.client_id) || 0) + saldo)
  }

  const totalPorCobrar = Array.from(saldoPorCliente.values()).reduce((s, v) => s + Math.max(0, v), 0)
  const totalPedidos = ordersData?.length || 0
  const totalClientes = clients?.length || 0
  const productosPublicados = (productos || []).filter((p) => p.publicado).length

  const deudores = (clients || [])
    .map((c) => ({ id: c.id, name: c.name, saldo: saldoPorCliente.get(c.id) || 0 }))
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 8)

  const maxDeuda = Math.max(...deudores.map((d) => d.saldo), 1)
  const chartWidth = 640
  const labelWidth = 170
  const barMaxWidth = chartWidth - labelWidth - 90
  const barHeight = 26
  const gap = 12
  const svgHeight = deudores.length * (barHeight + gap) + gap

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl mb-1">Resumen</h2>
        <p className="text-sm" style={{ color: '#5B5C60' }}>Vista general del negocio.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#626F77', fontFamily: 'var(--font-display)' }}>
            {totalClientes}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Clientes</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#676F36', fontFamily: 'var(--font-display)' }}>
            {totalPedidos}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Pedidos totales</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#C2492A', fontFamily: 'var(--font-display)' }}>
            {fmtMoney(totalPorCobrar)}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Por cobrar</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#A57F9B', fontFamily: 'var(--font-display)' }}>
            {productosPublicados}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Productos publicados</div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
          <h3 className="font-display text-lg">Clientes que más deben</h3>
          <Link href="/admin/clientes" className="text-xs font-mono text-crate underline">ver todos los clientes</Link>
        </div>

        {deudores.length === 0 ? (
          <p className="text-sm" style={{ color: '#5B5C60' }}>Ningún cliente tiene saldo pendiente ahora mismo.</p>
        ) : (
          <svg viewBox={`0 0 ${chartWidth} ${svgHeight}`} width="100%" style={{ maxWidth: chartWidth, height: 'auto' }}>
            {deudores.map((d, i) => {
              const y = gap + i * (barHeight + gap)
              const barWidth = Math.max((d.saldo / maxDeuda) * barMaxWidth, 2)
              const nombreCorto = d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name
              return (
                <g key={d.id}>
                  <text x={0} y={y + barHeight / 2 + 4} fontSize="12" fontFamily="monospace" fill="#2C2D31">
                    {nombreCorto}
                  </text>
                  <rect x={labelWidth} y={y} width={barWidth} height={barHeight} rx={4} fill="#C2492A" />
                  <text x={labelWidth + barWidth + 8} y={y + barHeight / 2 + 4} fontSize="12" fontFamily="monospace" fill="#2C2D31">
                    {fmtMoney(d.saldo)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
