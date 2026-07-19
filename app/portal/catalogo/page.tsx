import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'

export default async function PortalCatalogoPage() {
  const supabase = createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('publicado', true)
    .eq('activo', true)
    .order('nombre')

  const withImg = (products || []).map((p) => ({
    ...p,
    imagenUrl: p.imagen_path ? supabase.storage.from('productos').getPublicUrl(p.imagen_path).data.publicUrl : null,
  }))

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-4">Catálogo de productos</h3>

      {withImg.length === 0 && (
        <p className="text-inksoft text-sm">Todavía no hay productos publicados.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {withImg.map((p) => (
          <div key={p.id} className="border border-line rounded p-3">
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
              <span className="font-mono font-bold">{fmtMoney(p.precio || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
