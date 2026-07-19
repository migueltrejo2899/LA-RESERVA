import { createClient } from '@/lib/supabase/server'
import { createOrder, createOrderFromFactura } from './actions'
import ItemsForm from './ItemsForm'
import { fmtDate, fmtMoney, statusClass, paymentStatus } from '@/lib/utils'
import Link from 'next/link'

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: { error?: string; nuevo?: string; cliente?: string; estado?: string }
}) {
  const supabase = createClient()

  const { data: clients } = await supabase.from('profiles').select('id, name, username').eq('role', 'client').order('name')

  if (searchParams.nuevo === 'factura') {
    return (
      <div className="card">
        <h3 className="font-display text-lg mb-4">Nuevo pedido desde factura (XML)</h3>
        <p className="text-sm text-inksoft mb-4">
          Sube el XML (y el PDF si lo tienes) de la factura ya timbrada. El pedido, sus artículos, la fecha
          y el total se llenan automáticamente leyendo el XML.
        </p>
        <form action={createOrderFromFactura} className="field" encType="multipart/form-data">
          <label>Cliente</label>
          <select name="clientId" className="mb-4">
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
            ))}
          </select>
          <label>Archivo XML de la factura</label>
          <input type="file" name="xml" accept=".xml" className="mb-4" />
          <label>Archivo PDF de la factura (opcional)</label>
          <input type="file" name="pdf" accept=".pdf" className="mb-4" />
          {searchParams.error && <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>}
          <div className="flex gap-3">
            <button className="btn">Crear pedido desde factura</button>
            <Link href="/admin/pedidos" className="btn ghost">Cancelar</Link>
          </div>
        </form>
      </div>
    )
  }

  if (searchParams.nuevo === '1') {
    return (
      <div className="card">
        <h3 className="font-display text-lg mb-4">Nuevo pedido</h3>
        <form action={createOrder} className="field">
          <label>Cliente</label>
          <select name="clientId" className="mb-4">
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
            ))}
          </select>
          <label>Fecha</label>
          <input type="date" name="fecha" defaultValue={new Date().toISOString().slice(0, 10)} className="mb-4" />
          <ItemsForm />
          {searchParams.error && <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>}
          <div className="flex gap-3">
            <button className="btn">Guardar pedido</button>
            <Link href="/admin/pedidos" className="btn ghost">Cancelar</Link>
          </div>
        </form>
      </div>
    )
  }

  let query = supabase
    .from('orders')
    .select('id, folio, total, status, created_at, client_id, profiles(name), payments(monto)')
    .order('created_at', { ascending: false })

  if (searchParams.cliente) {
    query = query.eq('client_id', searchParams.cliente)
  }

  const { data: ordersRaw } = await query

  const orders = (ordersRaw || []).map((o: any) => {
    const paid = (o.payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    return { ...o, paid, saldo: Number(o.total) - paid, estadoPago: paymentStatus(o.total, paid) }
  })

  const filtrados =
    searchParams.estado && ['pendiente', 'parcial', 'pagado'].includes(searchParams.estado)
      ? orders.filter((o) => o.estadoPago === searchParams.estado)
      : orders

  const hayFiltro = searchParams.cliente || searchParams.estado

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h3 className="font-display text-lg">Pedidos registrados</h3>
        <div className="flex gap-2">
          <Link href="/admin/pedidos?nuevo=factura" className="btn small ghost">+ Desde factura XML</Link>
          <Link href="/admin/pedidos?nuevo=1" className="btn small">+ Nuevo pedido</Link>
        </div>
      </div>

      <form className="field flex flex-wrap gap-4 items-end mb-5" method="get">
        <div style={{ minWidth: 200 }}>
          <label>Cliente</label>
          <select name="cliente" defaultValue={searchParams.cliente || ''}>
            <option value="">Todos</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label>Estado de pago</label>
          <select name="estado" defaultValue={searchParams.estado || ''}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagado">Pagado</option>
          </select>
        </div>
        <button type="submit" className="btn small">Filtrar</button>
        {hayFiltro && (
          <Link href="/admin/pedidos" className="text-sm font-mono text-crate underline mb-1">limpiar</Link>
        )}
      </form>

      {filtrados.length === 0 && (
        <p className="text-inksoft text-sm">
          {hayFiltro ? 'No hay pedidos para el filtro seleccionado.' : 'Aún no hay pedidos.'}
        </p>
      )}

      <div className="divide-y divide-line">
        {filtrados.map((o: any) => (
          <Link key={o.id} href={`/admin/pedidos/${o.id}`} className="flex justify-between items-center py-4 flex-wrap gap-3 hover:bg-crate/5">
            <div>
              <div className="font-mono text-xs text-inksoft">{o.folio} · {fmtDate(o.created_at)}</div>
              <div className="font-semibold">{o.profiles?.name}</div>
            </div>
            <div className="flex items-center gap-3">
              {o.saldo > 0 && (
                <span className="font-mono text-xs" style={{ color: '#C2492A' }}>debe {fmtMoney(o.saldo)}</span>
              )}
              <span className={`stamp ${statusClass(o.status)}`}>{o.status}</span>
              <span className={`stamp ${o.estadoPago}`}>{o.estadoPago}</span>
              <span className="font-mono font-semibold">{fmtMoney(o.total)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
