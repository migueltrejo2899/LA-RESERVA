import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import { createProduct, updateProduct, deleteProduct, bulkImportProducts, bulkPublicar } from './actions'
import Buscador from '../../portal/catalogo/Buscador'

const CATEGORIAS = ['Carne de Res', 'Carne de Cerdo', 'Pollo', 'Huevo', 'Chiles', 'Frutas y Verduras', 'Lácteos', 'Bebidas']

// texto en el que busca la barra: sku + nombre + descripción + categoría
function claveBusqueda(p: any) {
  return `${p.sku} ${p.nombre} ${p.descripcion || ''} ${p.categoria || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default async function CatalogoPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const supabase = createClient()
  const { data: products } = await supabase.from('products').select('*').order('nombre')
  const withImg = (products || []).map((p) => ({
    ...p,
    imagenUrl: p.imagen_path ? supabase.storage.from('productos').getPublicUrl(p.imagen_path).data.publicUrl : null,
  }))
  return (
    <div className="space-y-5">
      <Buscador />

      <div className="card">
        <h3 className="font-display text-lg mb-4">Agregar producto al catálogo</h3>
        {searchParams.error && <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>}
        {searchParams.ok && (
          <div className="text-sm font-mono mb-4" style={{ color: '#676F36' }}>{searchParams.ok}</div>
        )}
        <form action={createProduct} className="field grid grid-cols-2 gap-4 items-end" encType="multipart/form-data">
          <div>
            <label>SKU</label>
            <input type="text" name="sku" placeholder="ej. ARR-001" />
          </div>
          <div>
            <label>Nombre del producto</label>
            <input type="text" name="nombre" placeholder="ej. Arroz 1kg" />
          </div>
          <div>
            <label>Precio por kilo (menudeo)</label>
            <input type="number" step="0.01" name="precio_kilo" placeholder="0.00" />
          </div>
          <div>
            <label>Precio por caja (mayoreo)</label>
            <input type="number" step="0.01" name="precio_caja" placeholder="0.00" />
          </div>
          <div>
            <label>Categoría</label>
            <select name="categoria" defaultValue="">
              <option value="">Sin categoría</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Unidad (opcional)</label>
            <input type="text" name="unidad" placeholder="ej. caja de 20 kg" />
          </div>
          <div className="col-span-2">
            <label>Descripción (opcional)</label>
            <input type="text" name="descripcion" placeholder="Notas del producto" />
          </div>
          <div className="col-span-2">
            <label>Foto (opcional)</label>
            <input type="file" name="imagen" accept="image/*" />
          </div>
          <button className="btn small col-span-2 w-fit">Agregar producto</button>
        </form>
      </div>
      <div className="card">
        <h3 className="font-display text-lg mb-4">Importar SKUs desde otra plataforma (CSV)</h3>
        <p className="text-sm text-inksoft mb-3">
          El archivo debe tener encabezados: <span className="font-mono">sku, nombre</span> (obligatorios) y, si quieres,{' '}
          <span className="font-mono">descripcion, unidad, categoria, precio_kilo, precio_caja</span>. La categoría debe decir exactamente:
          Carne de Res, Carne de Cerdo, Pollo, Huevo, Chiles, Frutas y Verduras, Lácteos o Bebidas. Si el SKU ya existe en el catálogo, se actualiza; si no, se crea.
        </p>
        <form action={bulkImportProducts} className="field flex flex-wrap gap-3 items-end" encType="multipart/form-data">
          <input type="file" name="file" accept=".csv" />
          <button className="btn small">Importar CSV</button>
        </form>
      </div>
      <form id="bulk-form" action={bulkPublicar} className="card flex flex-wrap gap-3 items-center">
        <span className="text-xs text-inksoft">Con los productos marcados abajo (casilla a la izquierda de cada uno):</span>
        <button className="btn small" name="modo" value="publicar">Publicar en el portal del cliente</button>
        <button className="btn ghost small" name="modo" value="despublicar">Quitar del portal</button>
      </form>
      <div className="card">
        <h3 className="font-display text-lg mb-4">Catálogo ({withImg.length})</h3>
        {withImg.length === 0 && <p className="text-inksoft text-sm">Aún no hay productos en el catálogo.</p>}
        <div className="divide-y divide-line">
          {withImg.map((p) => (
            <div key={p.id} className="py-3 flex items-start gap-3" data-buscar={claveBusqueda(p)}>
              <input type="checkbox" name="ids" value={p.id} form="bulk-form" className="mt-2" />
              <details className="flex-1">
                <summary className="cursor-pointer flex justify-between items-center list-none flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {p.imagenUrl ? (
                      <img
                        src={p.imagenUrl}
                        alt={p.nombre}
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 4, background: '#EFE9DC' }} />
                    )}
                    <div>
                      <div className="font-mono text-xs text-inksoft">
                        {p.sku}{p.categoria ? ` · ${p.categoria}` : ' · sin categoría'}{!p.activo ? ' · inactivo' : ''}
                      </div>
                      <div className="font-semibold">{p.nombre}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.publicado && <span className="stamp entregado">En el portal</span>}
                    <span className="font-mono text-sm">
                      {p.precio_kilo != null && `${fmtMoney(p.precio_kilo)} /kg`}
                      {p.precio_kilo != null && p.precio_caja != null && ' · '}
                      {p.precio_caja != null && `${fmtMoney(p.precio_caja)} /caja`}
                    </span>
                    <span className="text-xs font-mono text-crate underline">editar</span>
                  </div>
                </summary>
                <div className="mt-3 space-y-3">
                  <form action={updateProduct} className="field grid grid-cols-2 gap-3 items-end" encType="multipart/form-data">
                    <input type="hidden" name="id" value={p.id} />
                    <div><label>SKU</label><input type="text" name="sku" defaultValue={p.sku} /></div>
                    <div><label>Nombre</label><input type="text" name="nombre" defaultValue={p.nombre} /></div>
                    <div><label>Precio por kilo (menudeo)</label><input type="number" step="0.01" name="precio_kilo" defaultValue={p.precio_kilo ?? ''} /></div>
                    <div><label>Precio por caja (mayoreo)</label><input type="number" step="0.01" name="precio_caja" defaultValue={p.precio_caja ?? ''} /></div>
                    <div>
                      <label>Categoría</label>
                      <select name="categoria" defaultValue={p.categoria || ''}>
                        <option value="">Sin categoría</option>
                        {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label>Unidad</label><input type="text" name="unidad" defaultValue={p.unidad || ''} /></div>
                    <div className="col-span-2">
                      <label>Descripción</label>
                      <input type="text" name="descripcion" defaultValue={p.descripcion || ''} />
                    </div>
                    <div className="col-span-2">
                      <label>Reemplazar foto (opcional)</label>
                      <input type="file" name="imagen" accept="image/*" />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="activo" defaultChecked={p.activo} /> Producto activo
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="publicado" defaultChecked={p.publicado} /> Publicado en el portal del cliente
                    </label>
                    <div className="col-span-2 text-xs text-inksoft">
                      Para publicar, el producto necesita al menos un precio capturado (kilo o caja).
                    </div>
                    <button className="btn small w-fit col-span-2">Guardar cambios</button>
                  </form>
                  <form action={deleteProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="imagenPath" value={p.imagen_path || ''} />
                    <button className="btn danger small">Eliminar producto</button>
                  </form>
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
