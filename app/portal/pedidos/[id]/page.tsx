import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney, statusClass } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function ClientOrderDetail({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', user!.id)
    .single()

  if (!order) notFound()

  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id)
  const { data: history } = await supabase.from('order_status_history').select('*').eq('order_id', order.id).order('created_at', { ascending: false })
  const { data: payments } = await supabase.from('payments').select('*').eq('order_id', order.id).order('fecha', { ascending: false })

  const paid = (payments || []).reduce((s, p) => s + Number(p.monto), 0)
  const saldo = order.total - paid

  return (
    <div className="space-y-5">
      <Link href="/portal" className="text-crate underline text-sm font-mono">← Volver a mis pedidos</Link>

      <div className="card">
        <div className="text-xs font-mono uppercase tracking-widest text-inksoft">{order.folio}</div>
        <div className="my-2"><span className={`stamp ${statusClass(order.status)}`}>{order.status}</span></div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs font-mono uppercase text-inksoft border-b border-line">
            <th className="text-left py-2">Producto</th><th className="text-left">Cant.</th><th className="text-left">Precio</th><th className="text-left">Subtotal</th>
          </tr></thead>
          <tbody>
            {items?.map((it) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-2">{it.producto}</td><td>{it.cantidad}</td><td>{fmtMoney(it.precio)}</td><td>{fmtMoney(it.cantidad * it.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between font-mono font-bold text-base border-t-2 border-ink pt-3 mt-3">
          <span>Total pedido</span><span>{fmtMoney(order.total)}</span>
        </div>
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-3">Seguimiento</h3>
        <ul className="border-l-2 border-line space-y-4">
          {history?.map((h) => (
            <li key={h.id} className="pl-5 relative before:content-[''] before:absolute before:left-[-7px] before:top-1 before:w-3 before:h-3 before:rounded-full before:bg-crate before:border-2 before:border-offwhite">
              <div className="font-mono text-xs text-inksoft">{fmtDate(h.created_at)}</div>
              <div className="font-semibold">{h.status}</div>
              {h.note && <div className="text-sm text-inksoft">{h.note}</div>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-3">Pagos</h3>
        <table className="w-full text-sm mb-3">
          <thead><tr className="text-xs font-mono uppercase text-inksoft border-b border-line">
            <th className="text-left py-2">Fecha</th><th className="text-left">Monto</th><th className="text-left">Método</th>
          </tr></thead>
          <tbody>
            {payments?.map((p) => (
              <tr key={p.id} className="border-b border-line"><td className="py-2">{fmtDate(p.fecha)}</td><td>{fmtMoney(p.monto)}</td><td>{p.metodo}</td></tr>
            ))}
            {(!payments || payments.length === 0) && <tr><td colSpan={3} className="text-inksoft py-2">Sin pagos registrados</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-between font-mono text-sm"><span>Pagado</span><span>{fmtMoney(paid)}</span></div>
        <div className="flex justify-between font-mono font-bold border-t-2 border-ink pt-3 mt-2"><span>Saldo pendiente</span><span>{fmtMoney(saldo)}</span></div>
      </div>
    </div>
  )
}
