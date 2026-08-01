import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PrintButton from './PrintButton'
import { marcarRecibidos } from './actions'

export default async function PickingListCliente({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { ok?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: order } = await supabase
    .from('orders')
    .select('*, profiles(name)')
    .eq('id', params.id)
    .eq('client_id', user!.id)
    .single()

  if (!order) notFound()

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
    .order('producto')

  const recibidos = (items || []).filter((i) => i.recibido).length

  return (
    <div className="max-w-2xl mx-auto">
      <div className="no-print flex justify-between items-center mb-5 flex-wrap gap-3">
        <Link href={`/portal/pedidos/${order.id}`} className="text-crate underline text-sm font-mono">← Ver mi pedido</Link>
        <PrintButton />
      </div>

      {searchParams.ok && (
        <div className="no-print mb-4 p-3 rounded text-sm" style={{ border: '2px solid #676F36', color: '#676F36', background: '#FBF9F3' }}>
          ¡Verificación guardada! Quedaron {recibidos} de {items?.length || 0} artículo(s) marcados
          como recibidos. Tu proveedor también puede verlo.
        </div>
      )}

      <div className="no-print mb-4 p-3 rounded text-sm text-inksoft" style={{ background: '#EFE6D6', border: '1px dashed #CBBFA4' }}>
        Cuando recibas tu pedido, marca la casilla de cada producto que te llegó y da clic en
        <strong> Guardar verificación</strong>. También puedes imprimir esta lista si prefieres
        palomearla en papel.
      </div>

      <form action={marcarRecibidos}>
        <input type="hidden" name="orderId" value={order.id} />

        <div style={{ border: '2px solid #2C2D31', padding: 24, borderRadius: 4, background: '#FBF9F3' }}>
          <div className="flex justify-between items-start border-b-[3px] border-ink pb-3 mb-4">
            <div>
              <div className="font-display text-xl">LA RESERVA</div>
              <div className="font-subtitle text-xs uppercase tracking-widest text-inksoft">Picking list · verificación de entrega</div>
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
                <th className="text-left py-2" style={{ width: 70 }}>Recibido</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((it, i) => (
                <tr key={it.id} className="border-b border-line">
                  <td className="py-3 font-mono text-inksoft">{i + 1}</td>
                  <td className="py-3">{it.producto}</td>
                  <td className="py-3 font-mono font-semibold">{it.cantidad}</td>
                  <td className="py-3">
                    <input
                      type="checkbox"
                      name="recibidos"
                      value={it.id}
                      defaultChecked={it.recibido}
                      style={{ width: 20, height: 20, accentColor: '#676F36' }}
                    />
                  </td>
                </tr>
              ))}
              {(!items || items.length === 0) && (
                <tr><td colSpan={4} className="text-inksoft py-3">Este pedido no tiene artículos.</td></tr>
              )}
            </tbody>
          </table>

          <p className="text-xs text-inksoft mt-6 pt-4" style={{ borderTop: '1px solid #CBBFA4', fontStyle: 'italic' }}>
            En La Reserva nos preocupamos por tus pedidos, por lo que es de gran importancia mencionar
            que los pesos de algunos productos no pueden ser totalmente exactos, agradecemos su comprensión.
          </p>
        </div>

        <div className="no-print mt-4 flex justify-end">
          <button className="btn">Guardar verificación</button>
        </div>
      </form>
    </div>
  )
}
