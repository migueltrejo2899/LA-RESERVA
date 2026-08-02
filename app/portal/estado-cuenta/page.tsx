import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'
import Link from 'next/link'
import PrintButton from './PrintButton'

export default async function EstadoCuenta({ searchParams }: { searchParams: { desde?: string; hasta?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: perfilPublico } = await supabase.from('profiles').select('username').eq('id', user!.id).single()
  if (perfilPublico?.username?.toLowerCase() === 'publico') {
    return null
  }

  let ordersQuery = supabase
    .from('orders')
    .select('id, folio, total, created_at')
    .eq('client_id', user!.id)
    .order('created_at', { ascending: true })

  if (searchParams.desde) ordersQuery = ordersQuery.gte('created_at', searchParams.desde)
  if (searchParams.hasta) ordersQuery = ordersQuery.lte('created_at', searchParams.hasta + 'T23:59:59')

  // consultas en paralelo
  const [{ data: profile }, { data: orders }, { data: invoices }] = await Promise.all([
    supabase.from('profiles').select('name, dias_credito').eq('id', user!.id).single(),
    ordersQuery,
    supabase.from('invoices').select('id, tipo, fecha, monto, file_name, factura_id').eq('client_id', user!.id),
  ])

  const orderIds = (orders || []).map((o) => o.id)
  let payments: any[] = []
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('payments')
      .select('id, order_id, monto, fecha, metodo')
      .in('order_id', orderIds)
      .order('fecha', { ascending: true })
    payments = data || []
  }

  type Mov = { fecha: string; concepto: string; cargo: number; abono: number }
  const movimientos: Mov[] = []
  for (const o of orders || []) {
    movimientos.push({ fecha: o.created_at, concepto: `Pedido ${o.folio}`, cargo: Number(o.total), abono: 0 })
  }
  for (const p of payments) {
    const pedido = orders?.find((o) => o.id === p.order_id)
    movimientos.push({
      fecha: p.fecha,
      concepto: `Pago${pedido ? ' · ' + pedido.folio : ''}${p.metodo ? ' (' + p.metodo + ')' : ''}`,
      cargo: 0,
      abono: Number(p.monto),
    })
  }
  movimientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

  let saldo = 0
  const filas = movimientos.map((m) => {
    saldo += m.cargo - m.abono
    return { ...m, saldo }
  })

  const totalCargos = movimientos.reduce((s, m) => s + m.cargo, 0)
  const totalAbonos = movimientos.reduce((s, m) => s + m.abono, 0)

  // facturas vencidas: sin complemento de pago ligado y con más días
  // transcurridos que los días de crédito del cliente
  const diasCredito = profile?.dias_credito ?? 30
  const hoy = new Date()
  const lista = invoices || []
  const vencidas = lista
    .filter((f) => {
      if (f.tipo !== 'factura') return false
      const tieneComplemento = lista.some((c) => c.tipo === 'complemento_pago' && c.factura_id === f.id)
      if (tieneComplemento) return false
      const limite = new Date(f.fecha)
      limite.setDate(limite.getDate() + diasCredito)
      return hoy > limite
    })
    .map((f) => {
      const diasVencida = Math.floor((hoy.getTime() - new Date(f.fecha).getTime()) / 86400000) - diasCredito
      return { ...f, diasVencida }
    })
    .sort((a, b) => b.diasVencida - a.diasVencida)

  const totalVencido = vencidas.reduce((s, f) => s + Number(f.monto || 0), 0)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="no-print flex justify-between items-center mb-5 flex-wrap gap-3">
        <Link href="/portal" className="text-crate underline text-sm font-mono">← Volver</Link>
        <form className="field flex gap-3 items-end flex-wrap" method="get">
          <div><label>Desde</label><input type="date" name="desde" defaultValue={searchParams.desde} /></div>
          <div><label>Hasta</label><input type="date" name="hasta" defaultValue={searchParams.hasta} /></div>
          <button className="btn small">Filtrar</button>
          {(searchParams.desde || searchParams.hasta) && (
            <a href="/portal/estado-cuenta" className="text-sm font-mono text-crate underline mb-1">limpiar</a>
          )}
        </form>
        <PrintButton />
      </div>

      <div className="p-4 sm:p-6" style={{ border: '2px solid #2C2D31', borderRadius: 6, background: '#FBF9F3' }}>
        <div className="flex justify-between items-start border-b-[3px] border-ink pb-3 mb-4 flex-wrap gap-2">
          <div>
            <div className="font-display text-xl">LA RESERVA</div>
            <div className="font-subtitle text-xs uppercase tracking-widest text-inksoft">Estado de cuenta</div>
          </div>
          <div className="text-right text-sm text-inksoft">
            <div>{profile?.name}</div>
            <div>Generado {fmtDate(new Date().toISOString().slice(0, 10))}</div>
          </div>
        </div>

        {vencidas.length > 0 && (
          <div className="mb-5 p-3 rounded" style={{ border: '2px solid #C2492A' }}>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
              <div className="font-subtitle text-xs uppercase tracking-widest" style={{ color: '#C2492A' }}>
                Facturas vencidas (crédito de {diasCredito} días)
              </div>
              <div className="font-mono font-bold" style={{ color: '#C2492A' }}>{fmtMoney(totalVencido)}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ minWidth: 420 }}>
                <thead>
                  <tr className="text-xs font-mono uppercase text-inksoft border-b border-line">
                    <th className="text-left py-1">Fecha</th>
                    <th className="text-left py-1">Factura</th>
                    <th className="text-right py-1">Monto</th>
                    <th className="text-right py-1">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {vencidas.map((f) => (
                    <tr key={f.id} className="border-b border-line">
                      <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{fmtDate(f.fecha)}</td>
                      <td className="py-1" style={{ wordBreak: 'break-all', fontSize: 12 }}>{f.file_name}</td>
                      <td className="py-1 text-right font-mono" style={{ whiteSpace: 'nowrap' }}>{f.monto ? fmtMoney(f.monto) : '—'}</td>
                      <td className="py-1 text-right font-mono font-semibold" style={{ color: '#C2492A' }}>{f.diasVencida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr className="text-xs font-mono uppercase text-inksoft border-b-2 border-ink">
                <th className="text-left py-2">Fecha</th>
                <th className="text-left py-2">Concepto</th>
                <th className="text-right py-2">Cargo</th>
                <th className="text-right py-2">Abono</th>
                <th className="text-right py-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2" style={{ whiteSpace: 'nowrap' }}>{fmtDate(f.fecha)}</td>
                  <td className="py-2">{f.concepto}</td>
                  <td className="py-2 text-right font-mono" style={{ whiteSpace: 'nowrap' }}>{f.cargo ? fmtMoney(f.cargo) : ''}</td>
                  <td className="py-2 text-right font-mono" style={{ whiteSpace: 'nowrap' }}>{f.abono ? fmtMoney(f.abono) : ''}</td>
                  <td className="py-2 text-right font-mono font-semibold" style={{ whiteSpace: 'nowrap' }}>{fmtMoney(f.saldo)}</td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr><td colSpan={5} className="text-inksoft py-3">No hay movimientos para el rango seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mt-4 pt-4 text-sm" style={{ borderTop: '1px solid #CBBFA4' }}>
          <div><span className="text-inksoft">Total cargos: </span><span className="font-mono font-semibold">{fmtMoney(totalCargos)}</span></div>
          <div><span className="text-inksoft">Total abonos: </span><span className="font-mono font-semibold">{fmtMoney(totalAbonos)}</span></div>
          <div><span className="text-inksoft">Saldo actual: </span><span className="font-mono font-bold">{fmtMoney(saldo)}</span></div>
        </div>
      </div>
    </div>
  )
}
