import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import Link from 'next/link'

const CATEGORIAS = ['Carne de Res', 'Carne de Cerdo', 'Frutas y Verduras', 'Lácteos', 'Bebidas']

export default async function PortalCatalogoPage({
  searchParams,
}: {
  searchParams: { categoria?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // productos publicados y precios especiales del cliente, en paralelo
  const [{ data: products }, { data: precios }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('publicado', true)
      .eq('activo', true)
      .order('nombre'),
    supabase.from('client_prices').select('product_id, precio').eq('client_id', user!.id),
  ])

  const precioEspecial = new Map((precios || []).map((p) => [p.product_id, Number(p.precio)]))

  const todos = (products || []).map((p) => ({
    ...p,
    imagenUrl: p.imagen_path ? supabase.storage.from('productos').getPublicUrl(p.imagen_path).data.publicUrl : null,
    especial: precioEspecial.get(p.id),
  }))

  const hayOtros = todos.some((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
  const categoriaSel = searchParams.categoria || ''

  const visibles = categoriaSel
    ? categoriaSel === 'Otros'
      ? todos.filter((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
      : todos.filter((p) => p.categoria === categoriaSel)
    : todos

  // agrupar por categoría (solo cuando se muestran todas)
  const grupos = CATEGORIAS.map((cat) => ({
    nombre: cat,
    items: todos.filter((p) => p.categoria === cat),
  })).filter((g) => g.items.length > 0)

  const otros = todos.filter((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
  if (otros.length > 0) grupos.push({ nombre: 'Otros', items: otros })

  const Producto = ({ p }: { p: any }) => (
    <div className="border border-line rounded p-3">
      {p.imagenUrl ? (
        <img
          src={p.imagenUrl}
          alt={p.nombre}
          style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4, marginBottom: 8 }}
        />
      ) : (
        <div style={{ width: '100%', height: 120, background: '#EFE9DC', borderRadius: 4, marginBottom: 8 }} />
      )}
      <div className="font-mono text-xs text-inksoft">{p.sku}</div>
      <div className="font-semibold text-sm">{p.nombre}</div>
      {p.descripcion && <div className="text-xs text-inksoft mt-1">{p.descripcion}</div>}
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-inksoft">{p.unidad || ''}</span>
        <span className="text-right">
          <span className="font-mono font-bold">{fmtMoney(p.especial ?? (p.precio || 0))}</span>
          {p.especial != null && (
            <span className="block text-xs" style={{ color: '#676F36' }}>tu precio especial</span>
          )}
        </span>
      </div>
    </div>
  )

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-4">Catálogo de productos</h3>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link
          href="/portal/catalogo"
          className="btn small"
          style={categoriaSel === '' ? {} : { background: 'transparent', color: '#676F36' }}
        >
          Todas
        </Link>
        {CATEGORIAS.map((cat) => (
          <Link
            key={cat}
            href={`/portal/catalogo?categoria=${encodeURIComponent(cat)}`}
            className="btn small"
            style={categoriaSel === cat ? {} : { background: 'transparent', color: '#676F36' }}
          >
            {cat}
          </Link>
        ))}
        {hayOtros && (
          <Link
            href="/portal/catalogo?categoria=Otros"
            className="btn small"
            style={categoriaSel === 'Otros' ? {} : { background: 'transparent', color: '#676F36' }}
          >
            Otros
          </Link>
        )}
      </div>

      {todos.length === 0 && (
        <p className="text-inksoft text-sm">Todavía no hay productos publicados.</p>
      )}

      {categoriaSel ? (
        <>
          {visibles.length === 0 && (
            <p className="text-inksoft text-sm">No hay productos en esta categoría.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {visibles.map((p) => <Producto key={p.id} p={p} />)}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.nombre}>
              <div className="font-subtitle text-xs uppercase tracking-widest text-inksoft border-b border-line pb-2 mb-3">
                {g.nombre} ({g.items.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {g.items.map((p) => <Producto key={p.id} p={p} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
