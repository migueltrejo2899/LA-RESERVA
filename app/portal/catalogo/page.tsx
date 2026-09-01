import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import { fmtDescuento, normalizarDescuento, preciosDeCliente } from '@/lib/precios'
import Link from 'next/link'
import { crearPedidoCliente } from './actions'
import Buscador from './Buscador'

// texto en el que busca la barra: sku + nombre + descripción + categoría
function claveBusqueda(p: any) {
  return `${p.sku} ${p.nombre} ${p.descripcion || ''} ${p.categoria || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default async function PortalCatalogoPage({
  searchParams,
}: {
  searchParams: { categoria?: string; error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: products }, { data: precios }, { data: categoriasData }] = await Promise.all([
    supabase.from('profiles').select('username, descuento').eq('id', user!.id).single(),
    supabase
      .from('products')
      .select('*')
      .eq('publicado', true)
      .eq('activo', true)
      .order('nombre'),
    supabase.from('client_prices').select('product_id, precio_kilo, precio_caja').eq('client_id', user!.id),
    supabase.from('categorias').select('nombre').order('nombre'),
  ])

  const CATEGORIAS = (categoriasData || []).map((c) => c.nombre)
  const esPublico = profile?.username?.toLowerCase() === 'publico'
  const descuento = esPublico ? 0 : normalizarDescuento(profile?.descuento)
  const especialDe = new Map((precios || []).map((p) => [p.product_id, p]))

  const todos = (products || []).map((p) => {
    const pr = preciosDeCliente(p, especialDe.get(p.id), descuento)
    return {
      ...p,
      imagenUrl: p.imagen_path ? supabase.storage.from('productos').getPublicUrl(p.imagen_path).data.publicUrl : null,
      kilo: pr.kilo,
      caja: pr.caja,
      kiloLista: pr.kiloLista,
      cajaLista: pr.cajaLista,
      esLitro: p.unidad_menudeo === 'litro',
      tieneEspecial: pr.tieneEspecial,
      tieneDescuento: pr.tieneDescuento,
    }
  })

  const hayOtros = todos.some((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
  const categoriaSel = searchParams.categoria || ''

  const visibles = categoriaSel
    ? categoriaSel === 'Otros'
      ? todos.filter((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
      : todos.filter((p) => p.categoria === categoriaSel)
    : todos

  const grupos = CATEGORIAS.map((cat) => ({
    nombre: cat,
    items: todos.filter((p) => p.categoria === cat),
  })).filter((g) => g.items.length > 0)

  const otros = todos.filter((p) => !p.categoria || !CATEGORIAS.includes(p.categoria))
  if (otros.length > 0) grupos.push({ nombre: 'Otros', items: otros })

  const Producto = ({ p }: { p: any }) => (
    <div className="border border-line rounded p-3" data-buscar={claveBusqueda(p)}>
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
      <div className="mt-2">
        {p.kilo != null && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-inksoft">{p.esLitro ? 'Litro' : 'Kilo'} (menudeo)</span>
            <span className="font-mono font-bold">
              {p.kiloLista != null && (
                <span className="text-xs text-inksoft font-normal mr-1" style={{ textDecoration: 'line-through' }}>
                  {fmtMoney(p.kiloLista)}
                </span>
              )}
              {fmtMoney(p.kilo)}
            </span>
          </div>
        )}
        {p.caja != null && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-inksoft">Caja (mayoreo)</span>
            <span className="font-mono font-bold">
              {p.cajaLista != null && (
                <span className="text-xs text-inksoft font-normal mr-1" style={{ textDecoration: 'line-through' }}>
                  {fmtMoney(p.cajaLista)}
                </span>
              )}
              {fmtMoney(p.caja)}
            </span>
          </div>
        )}
        {p.tieneEspecial && (
          <div className="text-xs text-right" style={{ color: '#676F36' }}>tu precio especial</div>
        )}
        {p.tieneDescuento && (
          <div className="text-xs text-right" style={{ color: '#676F36' }}>
            incluye tu descuento del {fmtDescuento(descuento)}
          </div>
        )}
      </div>
      {!esPublico && (
        <div className="field grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: '1px dashed #CBBFA4' }}>
          <input type="hidden" name="productId" value={p.id} />
          {p.kilo != null ? (
            <div>
              <label>{p.esLitro ? 'Litros' : 'Kilos'}</label>
              <input type="number" step="0.01" min="0" name="kilos" placeholder="0" />
            </div>
          ) : (
            <input type="hidden" name="kilos" value="" />
          )}
          {p.caja != null ? (
            <div>
              <label>Cajas</label>
              <input type="number" step="1" min="0" name="cajas" placeholder="0" />
            </div>
          ) : (
            <input type="hidden" name="cajas" value="" />
          )}
        </div>
      )}
    </div>
  )

  const Catalogo = () => (
    <>
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
            <div key={g.nombre} data-grupo>
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
    </>
  )

  return (
    <div>
      <Buscador />

      <div className="card">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h3 className="font-display text-lg">Catálogo de productos</h3>
          {todos.length > 0 && (
            <a href="/portal/catalogo/pdf" className="btn small no-print" download>
              Descargar catálogo (PDF)
            </a>
          )}
        </div>

        {descuento > 0 && (
          <div className="mb-4 p-3 rounded text-sm" style={{ background: '#EFF0E4', border: '1px dashed #676F36', color: '#3F4522' }}>
            Tienes un <strong>descuento del {fmtDescuento(descuento)}</strong> sobre los precios de lista.
            Los precios que ves abajo y en el PDF ya lo incluyen.
          </div>
        )}

        {searchParams.error && (
          <div className="text-sm font-mono mb-4" style={{ color: '#C2492A' }}>{searchParams.error}</div>
        )}

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

        {esPublico ? (
          <Catalogo />
        ) : (
          <form action={crearPedidoCliente}>
            <div className="mb-5 p-3 rounded text-sm text-inksoft" style={{ background: '#EFE6D6', border: '1px dashed #CBBFA4' }}>
              Captura las cantidades que necesitas en los productos que quieras y da
              clic en <strong>Hacer pedido</strong>. Al enviarlo podrás descargar tu picking list para
              verificar tu pedido cuando te llegue.
            </div>
            <Catalogo />
            {todos.length > 0 && (
              <div className="mt-6 pt-4 flex justify-end" style={{ borderTop: '2px solid #2C2D31' }}>
                <button className="btn">Hacer pedido</button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
