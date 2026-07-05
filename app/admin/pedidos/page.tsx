import { createClient } from '@/lib/supabase/server'
import { createOrder } from './actions'
import ItemsForm from './ItemsForm'
import { fmtDate, fmtMoney, statusClass, paymentStatus } from '@/lib/utils'
import Link from 'next/link'

export default async function PedidosPage({ searchParams }: { searchParams: { error?: string; nuevo?: string } }) {
  const supabase = createClient()

  const { data: clients } = await supabase.from('profiles').select('id, name, username').eq('role', 'client').order('name')

  const { data: orders } = await supabase
    .from('orders')
    .select('id, folio, total, status, created_at, client_id, profiles(name), payments(monto)')
    .order('created_at', { ascending: false })

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

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-lg">Pedidos registrados</h3>
        <Link href="/admin/pedidos?nuevo=1" className="btn small">+ Nuevo pedido</Link>
      </div>
      {(!orders || orders.length === 0) && <p className="text-inksoft text-sm">Aún no hay pedidos.</p>}
      <div className="divide-y divide-line">
        {orders?.map((o: any) => {
          const paid = (o.payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
          return (
            <Link key={o.id} href={`/admin/pedidos/${o.id}`} className="flex justify-between items-center py-4 flex-wrap gap-3 hover:bg-crate/5">
              <div>
                <div className="font-mono text-xs text-inksoft">{o.folio} · {fmtDate(o.created_at)}</div>
                <div className="font-semibold">{o.profiles?.name}</div>
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
