import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney, statusClass, paymentStatus } from '@/lib/utils'
import Link from 'next/link'

export default async function PortalHome() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, folio, total, status, created_at, payments(monto)')
    .eq('client_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-4">Mis pedidos</h3>

      {(!orders || orders.length === 0) && (
        <p className="text-inksoft text-sm">Aún no tienes pedidos registrados.</p>
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
