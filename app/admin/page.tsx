import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney, statusClass } from '@/lib/utils'
import Link from 'next/link'

export default async function AdminResumen() {
  const supabase = createClient()

  // todas las consultas corren en paralelo
  const [{ data: clients }, { data: ordersData }, { data: productos }, { data: invoices }] = await Promise.all([
    supabase.from('profiles').select('id, name, dias_credito').eq('role', 'client'),
    supabase
      .from('orders')
      .select('id, client_id, folio, total, status, created_at, profiles(name), payments(monto)')
      .order('created_at', { ascending: false }),
    supabase.from('products').select('id, publicado'),
    supabase.from('invoices').select('id, tipo, fecha, monto, factura_id, client_id'),
  ])

  const saldoPorCliente = new Map<string, number>()
  for (const o of ordersData || []) {
    const paid = ((o as any).payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    const saldo = Number(o.total) - paid
    saldoPorCliente.set(o.client_id, (saldoPorCliente.get(o.client_id) || 0) + saldo)
  }

  const totalPorCobrar = Array.from(saldoPorCliente.values()).reduce((s, v) => s + Math.max(0, v), 0)
  const totalPedidos = ordersData?.length || 0
  const totalClientes = clients?.length || 0
  const productosPublicados = (productos || []).filter((p) => p.publicado).length

  // facturas vencidas: sin complemento ligado y fuera de los días de crédito del cliente
  const lista = invoices || []
  const pagadas = new Set(lista.filter((i) => i.tipo === 'complemento_pago').map((i) => i.factura_id).filter(Boolean))
  const diasDe = new Map((clients || []).map((c) => [c.id, c.dias_credito ?? 30]))
  const hoy = new Date()
  const vencidas = lista.filter((f) => {
    if (f.tipo !== 'factura' || pagadas.has(f.id)) return false
    const limite = new Date(f.fecha)
    limite.setDate(limite.getDate() + (diasDe.get(f.client_id) ?? 30))
    return hoy > limite
  })
  const montoVencido = vencidas.reduce((s, f) => s + Number(f.monto || 0), 0)

  const deudores = (clients || [])
    .map((c) => ({ id: c.id, name: c.name, saldo: saldoPorCliente.get(c.id) || 0 }))
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 8)

  const maxDeuda = Math.max(...deudores.map((d) => d.saldo), 1)
  const chartWidth = 640
  const labelWidth = 170
  const barMaxWidth = chartWidth - labelWidth - 90
  const barHeight = 24
  const gap = 12
  const svgHeight = deudores.length * (barHeight + gap) + gap

  const recientes = (ordersData || []).slice(0, 5)

  const fechaHoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  const Tarjeta = ({ href, valor, etiqueta, color, alerta }: { href: string; valor: string; etiqueta: string; color: string; alerta?: boolean }) => (
    <Link href={href} className="card block" style={{ textAlign: 'center', padding: '18px 12px', borderColor: alerta ? '#C2492A' : undefined, textDecoration: 'none' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
        {valor}
      </div>
      <div className="text-sm" style={{ color: '#5B5C60', marginTop: 4 }}>{etiqueta}</div>
    </Link>
  )

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl mb-1">Resumen</h2>
          <p className="text-sm capitalize" style={{ color: '#5B5C60' }}>{fechaHoy}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/pedidos?nuevo=1" className="btn small">+ Nuevo pedido</Link>
          <Link href="/admin/facturas" className="btn ghost small">Subir facturas</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Tarjeta href="/admin/clientes" valor={String(totalClientes)} etiqueta="Clientes" color="#626F77" />
        <Tarjeta href="/admin/pedidos" valor={String(totalPedidos)} etiqueta="Pedidos totales" color="#676F36" />
        <Tarjeta href="/admin/pedidos?estado=pendiente" valor={fmtMoney(totalPorCobrar)} etiqueta="Por cobrar" color="#C2492A" alerta={totalPorCobrar > 0} />
        <Tarjeta
          href="/admin/facturas"
          valor={String(vencidas.length)}
          etiqueta={vencidas.length > 0 ? `Facturas vencidas · ${fmtMoney(montoVencido)}` : 'Facturas vencidas'}
          color="#C2492A"
          alerta={vencidas.length > 0}
        />
        <Tarjeta href="/admin/catalogo" valor={String(productosPublicados)} etiqueta="Productos publicados" color="#A57F9B" />
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
              const barWidth = Math.max((d.saldo / maxDeuda) * barMaxWidth, 3)
              const nombreCorto = d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name
              return (
                <g key={d.id}>
                  <text x={0} y={y + barHeight / 2 + 4} fontSize="12" fontFamily="monospace" fill="#2C2D31">
                    {nombreCorto}
                  </text>
                  <rect x={labelWidth} y={y} width={barMaxWidth} height={barHeight} rx={6} fill="rgba(44,45,49,0.06)" />
                  <rect x={labelWidth} y={y} width={barWidth} height={barHeight} rx={6} fill="#C2492A" opacity={0.9} />
                  <text x={labelWidth + barMaxWidth + 8} y={y + barHeight / 2 + 4} fontSize="12" fontWeight="600" fontFamily="monospace" fill="#2C2D31">
                    {fmtMoney(d.saldo)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <div className="card">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
          <h3 className="font-display text-lg">Últimos pedidos</h3>
          <Link href="/admin/pedidos" className="text-xs font-mono text-crate underline">ver todos</Link>
        </div>
        {recientes.length === 0 ? (
          <p className="text-sm" style={{ color: '#5B5C60' }}>Aún no hay pedidos.</p>
        ) : (
          <div className="divide-y divide-line">
            {recientes.map((o: any) => (
              <Link key={o.id} href={`/admin/pedidos/${o.id}`} className="flex justify-between items-center py-3 gap-3 flex-wrap hover:bg-crate/5">
                <div>
                  <div className="font-mono text-xs text-inksoft">{o.folio} · {fmtDate(o.created_at)}</div>
                  <div className="font-semibold text-sm">{o.profiles?.name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`stamp ${statusClass(o.status)}`} style={{ fontSize: 10, padding: '4px 10px' }}>{o.status}</span>
                  <span className="font-mono font-bold">{fmtMoney(o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
