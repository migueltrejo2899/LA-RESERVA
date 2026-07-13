import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney, statusClass, paymentStatus } from '@/lib/utils'
import Link from 'next/link'

function rangoFecha(searchParams: { anio?: string; mes?: string; dia?: string }) {
  if (searchParams.dia) {
    const start = `${searchParams.dia}T00:00:00`
    const d = new Date(searchParams.dia)
    d.setDate(d.getDate() + 1)
    const end = d.toISOString().slice(0, 10) + 'T00:00:00'
    return { start, end }
  }
  if (searchParams.mes) {
    const [y, m] = searchParams.mes.split('-')
    const start = `${y}-${m}-01T00:00:00`
    const nextMonth = Number(m) === 12 ? 1 : Number(m) + 1
    const nextYear = Number(m) === 12 ? Number(y) + 1 : Number(y)
    const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00`
    return { start, end }
  }
  if (searchParams.anio) {
    const start = `${searchParams.anio}-01-01T00:00:00`
    const end = `${Number(searchParams.anio) + 1}-01-01T00:00:00`
    return { start, end }
  }
  return null
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams: { anio?: string; mes?: string; dia?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let query = supabase
    .from('orders')
    .select('id, folio, total, status, created_at, payments(monto)')
    .eq('client_id', user!.id)
    .order('created_at', { ascending: false })

  const rango = rangoFecha(searchParams)
  if (rango) {
    query = query.gte('created_at', rango.start).lt('created_at', rango.end)
  }

  const { data: orders } = await query

  const hayFiltro = searchParams.anio || searchParams.mes || searchParams.dia

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-4">Mis pedidos</h3>

      <form className="field flex flex-wrap gap-4 items-end mb-5" method="get">
        <div>
          <label>Filtrar por año</label>
          <input type="number" name="anio" placeholder="2026" min="2000" max="2100" defaultValue={searchParams.anio} />
        </div>
        <div>
          <label>Filtrar por mes</label>
          <input type="month" name="mes" defaultValue={searchParams.mes} />
        </div>
        <div>
          <label>Filtrar por día</label>
          <input type="date" name="dia" defaultValue={searchParams.dia} />
        </div>
        <button className="btn small">Filtrar</button>
        {hayFiltro && (
          <Link href="/portal" className="text-sm font-mono text-crate underline mb-1">limpiar</Link>
        )}
      </form>

      {(!orders || orders.length === 0) && (
        <p className="text-inksoft text-sm">
          {hayFiltro ? 'No hay pedidos para el filtro seleccionado.' : 'Aún no tienes pedidos registrados.'}
        </p>
      )}

      <div className="divide-y divide-line">
        {orders?.map((o: any) => {
          const paid = (o.payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
          return (
            <Link
              key={o.id}
              href={`/portal/pedidos/${o.id}`}
              className="flex justify-between items-center py-4 flex-wrap gap-3 hover:bg-crate/5"
            >
              <div>
                <div className="font-mono text-xs text-inksoft">{o.folio} · {fmtDate(o.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`stamp ${statusClass(o.status)}`}>{o.status}</span>
                <span className={`stamp ${paymentStatus(o.total, paid)}`}>{paymentStatus(o.total, paid)}</span>
                <span className="font-mono font-semibold">{fmtMoney(o.total)}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
