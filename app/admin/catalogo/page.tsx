import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import { createProduct, updateProduct, deleteProduct } from './actions'

export default async function CatalogoPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()

  const { data: products } = await supabase.from('products').select('*').order('nombre')

  return (
    <div className="space-y-5">
      <div className="card">
        <h3 className="font-display text-lg mb-4">Agregar producto al catálogo</h3>
        {searchParams.error && <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>}
        <form action={createProduct} className="field grid grid-cols-2 gap-4 items-end">
          <div>
            <label>SKU</label>
            <input type="text" name="sku" placeholder="ej. ARR-001" />
          </div>
          <div>
            <label>Nombre del producto</label>
            <input type="text" name="nombre" placeholder="ej. Arroz 1kg" />
          </div>
          <div>
            <label>Unidad (opcional)</label>
            <input type="text" name="unidad" placeholder="ej. caja, kg, pieza" />
          </div>
          <div>
            <label>Precio (opcional)</label>
            <input type="number" step="0.01" name="precio" placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <label>Descripción (opcional)</label>
            <input type="text" name="descripcion" placeholder="Notas del producto" />
          </div>
          <button className="btn small col-span-2 w-fit">Agregar producto</button>
        </form>
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-4">Catálogo ({products?.length || 0})</h3>

        {(!products || products.length === 0) && (
          <p className="text-inksoft text-sm">Aún no hay productos en el catálogo.</p>
        )}

        <div className="divide-y divide-line">
          {products?.map((p) => (
            <details key={p.id} className="py-3">
              <summary className="cursor-pointer flex justify-between items-center list-none flex-wrap gap-2">
                <div>
                  <div className="font-mono text-xs text-inksoft">
                    {p.sku}{!p.activo ? ' · inactivo' : ''}
                  </div>
                  <div className="font-semibold">{p.nombre}</div>
                </div>
                <div className="flex items-center gap-3">
                  {p.precio != null && <span className="font-mono">{fmtMoney(p.precio)}</span>}
                  <span className="text-xs font-mono text-crate underline">editar</span>
                </div>
              </summary>
              <div className="mt-3 space-y-3">
                <form action={updateProduct} className="field grid grid-cols-2 gap-3 items-end">
                  <input type="hidden" name="id" value={p.id} />
                  <div><label>SKU</label><input type="text" name="sku" defaultValue={p.sku} /></div>
                  <div><label>Nombre</label><input type="text" name="nombre" defaultValue={p.nombre} /></div>
                  <div><label>Unidad</label><input type="text" name="unidad" defaultValue={p.unidad || ''} /></div>
                  <div><label>Precio</label><input type="number" step="0.01" name="precio" defaultValue={p.precio ?? ''} /></div>
                  <div className="col-span-2">
                    <label>Descripción</label>
                    <input type="text" name="descripcion" defaultValue={p.descripcion || ''} />
                  </div>
                  <label className="flex items-center gap-2 col-span-2 text-sm">
                    <input type="checkbox" name="activo" defaultChecked={p.activo} /> Producto activo
                  </label>
                  <button className="btn small w-fit col-span-2">Guardar cambios</button>
                </form>
                <form action={deleteProduct}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn danger small">Eliminar producto</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
