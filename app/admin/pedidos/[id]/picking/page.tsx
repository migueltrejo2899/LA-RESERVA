import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PrintButton from '../PrintButton'

export default async function PickingList({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const orderId = params.id

  const { data: order } = await supabase
    .from('orders')
    .select('*, profiles(name, username)')
    .eq('id', orderId)
    .single()

  if (!order) notFound()

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('producto')

  return (
    <div className="max-w-2xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important }
          body { padding: 0 }
        }
      `}</style>

      <div className="no-print flex justify-between items-center mb-5">
        <Link href={`/admin/pedidos/${order.id}`} className="text-crate underline text-sm font-mono">← Volver al pedido</Link>
        <PrintButton />
      </div>

      <div style={{ border: '2px solid #2C2D31', padding: 24, borderRadius: 4 }}>
        <div className="flex justify-between items-start border-b-[3px] border-ink pb-3 mb-4">
          <div>
            <div className="font-display text-xl">LA RESERVA</div>
            <div className="font-subtitle text-xs uppercase tracking-widest text-inksoft">Picking list · orden de surtido</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs text-inksoft uppercase tracking-widest">{order.folio}</div>
            <div className="text-sm text-inksoft">{fmtDate(order.created_at)}</div>
          </div>
        </div>

        <div className="mb-4 text-sm">
          <div><strong>Cliente:</strong> {order.profiles?.name}</div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-mono uppercase text-inksoft border-b-2 border-ink">
              <th className="text-left py-2" style={{ width: 36 }}>#</th>
              <th className="text-left py-2">Producto</th>
              <th className="text-left py-2" style={{ width: 90 }}>Cantidad</th>
              <th className="text-left py-2" style={{ width: 60 }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((it, i) => (
              <tr key={it.id} className="border-b border-line">
                <td className="py-3 font-mono text-inksoft">{i + 1}</td>
                <td className="py-3">{it.producto}</td>
                <td className="py-3 font-mono font-semibold">{it.cantidad}</td>
                <td className="py-3">
                  <div style={{ width: 20, height: 20, border: '2px solid #2C2D31' }} />
                </td>
              </tr>
            ))}
            {(!items || items.length === 0) && (
              <tr><td colSpan={4} className="text-inksoft py-3">Este pedido no tiene artículos.</td></tr>
            )}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 mt-10 pt-6 text-sm" style={{ borderTop: '1px solid #CBBFA4' }}>
          <div>
            <div style={{ borderBottom: '1px solid #2C2D31', height: 32 }} />
            <div className="text-xs text-inksoft mt-1">Preparado por / fecha</div>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #2C2D31', height: 32 }} />
            <div className="text-xs text-inksoft mt-1">Revisado por / fecha</div>
          </div>
        </div>
      </div>
    </div>
  )
}
