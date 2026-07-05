import { createClient } from '@/lib/supabase/server'
import { updateStatus, addPayment, uploadInvoice } from './actions'
import { fmtDate, fmtMoney, statusClass } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const ESTATUS = ['Recibido', 'En preparación', 'En camino', 'Entregado', 'Cancelado']

export default async function PedidoDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const supabase = createClient()
  const orderId = params.id

  const { data: order } = await supabase
    .from('orders')
    .select('*, profiles(id, name, username)')
    .eq('id', orderId)
    .single()

  if (!order) notFound()

  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId)
  const { data: history } = await supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  const { data: payments } = await supabase.from('payments').select('*').eq('order_id', orderId).order('fecha', { ascending: false })
  const { data: invoices } = await supabase.from('invoices').select('*').eq('order_id', orderId).order('fecha', { ascending: false })

  const paid = (payments || []).reduce((s, p) => s + Number(p.monto), 0)
  const saldo = order.total - paid

  return (
    <div className="space-y-5">
      <Link href="/admin/pedidos" className="text-crate underline text-sm font-mono">← Volver a pedidos</Link>

      <div className="card">
        <div className="text-xs font-mono uppercase tracking-widest text-inksoft">{order.folio}</div>
        <h2 className="font-display text-2xl mt-1">{order.profiles?.name}</h2>
        <div className="text-sm text-inksoft mb-4">Creado {fmtDate(order.created_at)}</div>
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
        <h3 className="font-display text-lg mb-3">Actualizar estatus</h3>
        <form action={updateStatus} className="field grid grid-cols-2 gap-4 items-end">
          <input type="hidden" name="orderId" value={order.id} />
          <div><label>Nuevo estatus</label>
            <select name="status" defaultValue={order.status}>
              {ESTATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label>Nota (opcional)</label><input type="text" name="note" placeholder="ej. sale con ruta 3" /></div>
          <button className="btn small col-span-2 w-fit">Registrar estatus</button>
        </form>
        <h3 className="font-display text-lg mt-6 mb-3">Historial</h3>
        <ul className="border-l-2 border-line pl-0 space-y-4">
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
            <th className="text-left py-2">Fecha</th><th className="text-left">Monto</th><th className="text-left">Método</th><th className="text-left">Nota</th>
          </tr></thead>
          <tbody>
            {payments?.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="py-2">{fmtDate(p.fecha)}</td><td>{fmtMoney(p.monto)}</td><td>{p.metodo}</td><td>{p.nota}</td>
              </tr>
            ))}
            {(!payments || payments.length === 0) && <tr><td colSpan={4} className="text-inksoft py-2">Sin pagos registrados</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-between font-mono text-sm"><span>Pagado</span><span>{fmtMoney(paid)}</span></div>
        <div className="flex justify-between font-mono font-bold border-t-2 border-ink pt-3 mt-2"><span>Saldo pendiente</span><span>{fmtMoney(saldo)}</span></div>

        <h3 className="font-display text-lg mt-6 mb-3">Registrar pago</h3>
        <form action={addPayment} className="field grid grid-cols-2 gap-4">
          <input type="hidden" name="orderId" value={order.id} />
          <div><label>Monto</label><input type="number" step="0.01" name="monto" placeholder="0.00" /></div>
          <div><label>Fecha</label><input type="date" name="fecha" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div><label>Método</label>
            <select name="metodo"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option></select>
          </div>
          <div><label>Nota (opcional)</label><input type="text" name="nota" /></div>
          {searchParams.error && <div className="text-stamp text-sm font-mono col-span-2">{searchParams.error}</div>}
          <button className="btn small col-span-2 w-fit">Agregar pago</button>
        </form>
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-3">Facturas y complementos de pago</h3>
        <div className="divide-y divide-line mb-4">
          {invoices?.map((inv) => (
            <div key={inv.id} className="flex justify-between items-center py-3">
              <div>
                <span className={`stamp ${inv.tipo === 'factura' ? 'entregado' : 'preparacion'}`}>{inv.tipo === 'factura' ? 'Factura' : 'Complemento de pago'}</span>
                <div className="text-sm mt-1">{inv.file_name} · {fmtDate(inv.fecha)} {inv.monto ? `· ${fmtMoney(inv.monto)}` : ''}</div>
              </div>
            </div>
          ))}
          {(!invoices || invoices.length === 0) && <p className="text-inksoft text-sm py-2">Sin archivos anexados a este pedido.</p>}
        </div>

        <h4 className="font-semibold mb-3">Anexar archivo</h4>
        <form action={uploadInvoice} className="field grid grid-cols-2 gap-4" encType="multipart/form-data">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="clientId" value={order.profiles?.id} />
          <div><label>Tipo</label>
            <select name="tipo"><option value="factura">Factura</option><option value="complemento_pago">Complemento de pago</option></select>
          </div>
          <div><label>Fecha</label><input type="date" name="fecha" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div><label>Monto (opcional)</label><input type="number" step="0.01" name="monto" /></div>
          <div><label>Archivo (PDF o XML)</label><input type="file" name="file" accept=".pdf,.xml" /></div>
          <button className="btn small col-span-2 w-fit">Subir archivo</button>
        </form>
      </div>
    </div>
  )
}
