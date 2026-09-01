import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import { fmtDescuento } from '@/lib/precios'
import Link from 'next/link'
import { setClientPrice, updatePreciosMasivos } from './actions'

export default async function PreciosPorCliente({
  searchParams,
}: {
  searchParams: { cliente?: string; error?: string; ok?: string }
}) {
  const supabase = createClient()

  const [{ data: clients }, { data: products }] = await Promise.all([
    supabase.from('profiles').select('id, name, username, descuento').eq('role', 'client').order('name'),
    supabase.from('products').select('*').eq('activo', true).order('nombre'),
  ])

  const clienteId = searchParams.cliente || ''
  const clienteSel = clients?.find((c) => c.id === clienteId)

  let precios: any[] = []
  if (clienteId) {
    const { data } = await supabase
      .from('client_prices')
      .select('product_id, precio_kilo, precio_caja')
      .eq('client_id', clienteId)
    precios = data || []
  }
  const especialDe = new Map(precios.map((p) => [p.product_id, p]))

  return (
    <div className="space-y-5">
      <Link href="/admin/catalogo" className="text-crate underline text-sm font-mono">← Volver al catálogo</Link>

      {searchParams.error && (
        <div className="card" style={{ borderColor: '#C2492A' }}>
          <p className="text-sm" style={{ color: '#C2492A' }}>{searchParams.error}</p>
        </div>
      )}
      {searchParams.ok && (
        <div className="card" style={{ borderColor: '#676F36' }}>
          <p className="text-sm" style={{ color: '#676F36' }}>{searchParams.ok}</p>
        </div>
      )}

      <div className="card">
        <h3 className="font-display text-lg mb-2">Edición rápida de precios generales</h3>
        <p className="text-sm text-inksoft mb-4">
          Kilo = menudeo, caja = mayoreo. Cambia los que necesites y guarda todos con un solo clic —
          solo se actualizan los que modificaste. Estos son los precios generales (los que ven los
          clientes sin precio especial).
        </p>

        {(!products || products.length === 0) ? (
          <p className="text-inksoft text-sm">No hay productos activos en el catálogo.</p>
        ) : (
          <form action={updatePreciosMasivos} className="field">
            <div className="divide-y divide-line mb-4">
              {products.map((p) => (
                <div key={p.id} className="py-2 flex justify-between items-end gap-3 flex-wrap">
                  <div>
                    <div className="font-mono text-xs text-inksoft">{p.sku}{p.categoria ? ` · ${p.categoria}` : ''}</div>
                    <div className="font-semibold text-sm">{p.nombre}</div>
                  </div>
                  <div className="flex gap-2">
                    <div style={{ width: 120 }}>
                      <label>$ / kilo</label>
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="precio_kilo_original" value={p.precio_kilo ?? ''} />
                      <input type="number" step="0.01" name="precio_kilo" defaultValue={p.precio_kilo ?? ''} placeholder="—" />
                    </div>
                    <div style={{ width: 120 }}>
                      <label>$ / caja</label>
                      <input type="hidden" name="precio_caja_original" value={p.precio_caja ?? ''} />
                      <input type="number" step="0.01" name="precio_caja" defaultValue={p.precio_caja ?? ''} placeholder="—" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn">Guardar todos los cambios</button>
          </form>
        )}
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-2">Precios especiales por cliente</h3>
        <p className="text-sm text-inksoft mb-4">
          Elige un cliente y asigna los precios que le aplican (por kilo y/o por caja). Si un producto
          no tiene precio especial, el cliente ve los precios generales. Deja ambos campos vacíos y
          guarda para quitar el precio especial.
        </p>

        <form className="field flex gap-3 items-end flex-wrap" method="get">
          <div style={{ minWidth: 240 }}>
            <label>Cliente</label>
            <select name="cliente" defaultValue={clienteId}>
              <option value="">-- Elige un cliente --</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
              ))}
            </select>
          </div>
          <button className="btn small">Ver precios</button>
        </form>
      </div>

      {clienteSel && (
        <div className="card">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-2">
            <h3 className="font-display text-lg">Precios para {clienteSel.name}</h3>
            <a href={`/portal/catalogo/pdf?cliente=${clienteSel.id}`} className="btn small" download>
              Descargar su catálogo (PDF)
            </a>
          </div>
          <p className="text-sm text-inksoft mb-4">
            {Number(clienteSel.descuento) > 0 ? (
              <>
                Este cliente tiene un <strong>descuento del {fmtDescuento(Number(clienteSel.descuento))}</strong> sobre
                los precios generales. Los productos que le pongas precio especial aquí se cobran a ese precio
                especial, sin aplicarles el descuento otra vez. El descuento se edita en{' '}
                <Link href="/admin/clientes" className="text-crate underline">Clientes</Link>.
              </>
            ) : (
              <>
                Este cliente no tiene descuento general. Puedes asignarle uno en{' '}
                <Link href="/admin/clientes" className="text-crate underline">Clientes</Link>.
              </>
            )}
          </p>

          {(!products || products.length === 0) && (
            <p className="text-inksoft text-sm">No hay productos activos en el catálogo.</p>
          )}

          <div className="divide-y divide-line">
            {products?.map((p) => {
              const esp = especialDe.get(p.id)
              return (
                <div key={p.id} className="py-3 flex justify-between items-end flex-wrap gap-3">
                  <div>
                    <div className="font-mono text-xs text-inksoft">{p.sku}</div>
                    <div className="font-semibold">{p.nombre}</div>
                    <div className="text-xs text-inksoft mt-1">
                      General: {p.precio_kilo != null ? `${fmtMoney(p.precio_kilo)} /kg` : ''}
                      {p.precio_kilo != null && p.precio_caja != null ? ' · ' : ''}
                      {p.precio_caja != null ? `${fmtMoney(p.precio_caja)} /caja` : ''}
                      {p.precio_kilo == null && p.precio_caja == null ? 'sin precios' : ''}
                      {esp && (esp.precio_kilo != null || esp.precio_caja != null) && (
                        <span style={{ color: '#676F36', fontWeight: 600 }}>
                          {' '}· Especial: {esp.precio_kilo != null ? `${fmtMoney(esp.precio_kilo)} /kg` : ''}
                          {esp.precio_kilo != null && esp.precio_caja != null ? ' · ' : ''}
                          {esp.precio_caja != null ? `${fmtMoney(esp.precio_caja)} /caja` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <form action={setClientPrice} className="field flex gap-2 items-end">
                    <input type="hidden" name="clientId" value={clienteSel.id} />
                    <input type="hidden" name="productId" value={p.id} />
                    <div style={{ width: 120 }}>
                      <label>Especial /kg</label>
                      <input type="number" step="0.01" name="precio_kilo" defaultValue={esp?.precio_kilo ?? ''} placeholder="—" />
                    </div>
                    <div style={{ width: 120 }}>
                      <label>Especial /caja</label>
                      <input type="number" step="0.01" name="precio_caja" defaultValue={esp?.precio_caja ?? ''} placeholder="—" />
                    </div>
                    <button className="btn small">Guardar</button>
                  </form>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
