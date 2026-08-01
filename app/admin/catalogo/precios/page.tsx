import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import Link from 'next/link'
import { setClientPrice, updatePreciosMasivos } from './actions'

export default async function PreciosPorCliente({
  searchParams,
}: {
  searchParams: { cliente?: string; error?: string; ok?: string }
}) {
  const supabase = createClient()

  const [{ data: clients }, { data: products }] = await Promise.all([
    supabase.from('profiles').select('id, name, username').eq('role', 'client').order('name'),
    supabase.from('products').select('*').eq('activo', true).order('nombre'),
  ])

  const clienteId = searchParams.cliente || ''
  const clienteSel = clients?.find((c) => c.id === clienteId)

  let precios: any[] = []
  if (clienteId) {
    const { data } = await supabase.from('client_prices').select('product_id, precio').eq('client_id', clienteId)
    precios = data || []
  }
  const precioDe = new Map(precios.map((p) => [p.product_id, Number(p.precio)]))

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
          Cambia los precios que necesites y guarda todos con un solo clic. Solo se actualizan los que
          modificaste. Estos son los precios generales del catálogo (los que ven los clientes sin precio especial).
        </p>

        {(!products || products.length === 0) ? (
          <p className="text-inksoft text-sm">No hay productos activos en el catálogo.</p>
        ) : (
          <form action={updatePreciosMasivos} className="field">
            <div className="divide-y divide-line mb-4">
              {products.map((p) => (
                <div key={p.id} className="py-2 flex justify-between items-center gap-3 flex-wrap">
                  <div>
                    <div className="font-mono text-xs text-inksoft">{p.sku}{p.categoria ? ` · ${p.categoria}` : ''}</div>
                    <div className="font-semibold text-sm">{p.nombre}</div>
                  </div>
                  <div style={{ width: 130 }}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="precioOriginal" value={p.precio ?? ''} />
                    <input type="number" step="0.01" name="precio" defaultValue={p.precio ?? ''} placeholder="—" />
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
          Elige un cliente y asigna el precio que le aplica a cada producto. Si un producto no tiene
          precio especial, el cliente ve el precio general del catálogo. Deja el campo vacío y guarda
          para quitar un precio especial.
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
          <h3 className="font-display text-lg mb-4">Precios para {clienteSel.name}</h3>

          {(!products || products.length === 0) && (
            <p className="text-inksoft text-sm">No hay productos activos en el catálogo.</p>
          )}

          <div className="divide-y divide-line">
            {products?.map((p) => {
              const especial = precioDe.get(p.id)
              return (
                <div key={p.id} className="py-3 flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-mono text-xs text-inksoft">{p.sku}</div>
                    <div className="font-semibold">{p.nombre}</div>
                    <div className="text-xs text-inksoft mt-1">
                      Precio general: {p.precio != null ? fmtMoney(p.precio) : 'sin precio'}
                      {especial != null && (
                        <span style={{ color: '#676F36', fontWeight: 600 }}> · Especial: {fmtMoney(especial)}</span>
                      )}
                    </div>
                  </div>
                  <form action={setClientPrice} className="field flex gap-2 items-end">
                    <input type="hidden" name="clientId" value={clienteSel.id} />
                    <input type="hidden" name="productId" value={p.id} />
                    <div style={{ width: 130 }}>
                      <label>Precio especial</label>
                      <input type="number" step="0.01" name="precio" defaultValue={especial ?? ''} placeholder="—" />
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
