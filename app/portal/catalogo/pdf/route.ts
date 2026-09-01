import { createClient } from '@/lib/supabase/server'
import { normalizarDescuento, preciosDeCliente } from '@/lib/precios'
import { generarCatalogoPDF, nombreArchivoCatalogo, type FilaCatalogo, type GrupoCatalogo } from '@/lib/catalogo-pdf'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Descarga del catálogo en PDF con los precios que le tocan a un cliente.
//  - Cliente: siempre su propio catálogo (con su descuento).
//  - Admin: ?cliente=<id> para el catálogo de ese cliente, o sin parámetro
//    para el catálogo con precios generales de lista.
export async function GET(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: yo } = await supabase
    .from('profiles')
    .select('role, name, username, descuento')
    .eq('id', user.id)
    .single()

  if (!yo) {
    return new NextResponse('Perfil no encontrado.', { status: 403 })
  }

  // ¿de quién es el catálogo?
  let clienteId: string | null = user.id
  let clienteNombre: string | null = yo.name
  let descuento = normalizarDescuento(yo.descuento)

  if (yo.role === 'admin') {
    const pedido = request.nextUrl.searchParams.get('cliente')
    if (pedido) {
      const { data: cli } = await supabase
        .from('profiles')
        .select('id, name, descuento')
        .eq('id', pedido)
        .single()
      if (!cli) {
        return new NextResponse('Cliente no encontrado.', { status: 404 })
      }
      clienteId = cli.id
      clienteNombre = cli.name
      descuento = normalizarDescuento(cli.descuento)
    } else {
      // catálogo general, precios de lista
      clienteId = null
      clienteNombre = null
      descuento = 0
    }
  } else if (yo.username?.toLowerCase() === 'publico') {
    // la cuenta pública siempre ve precios de lista
    descuento = 0
    clienteId = null
  }

  const [{ data: products }, { data: categoriasData }, especialesRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, sku, nombre, unidad, categoria, unidad_menudeo, precio_kilo, precio_caja')
      .eq('publicado', true)
      .eq('activo', true)
      .order('nombre'),
    supabase.from('categorias').select('nombre').order('nombre'),
    clienteId
      ? supabase.from('client_prices').select('product_id, precio_kilo, precio_caja').eq('client_id', clienteId)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const especialDe = new Map(((especialesRes as any).data || []).map((p: any) => [p.product_id, p]))
  const CATEGORIAS = (categoriasData || []).map((c) => c.nombre)

  const filas: (FilaCatalogo & { categoria: string | null })[] = (products || []).map((p: any) => {
    const pr = preciosDeCliente(p, especialDe.get(p.id) as any, descuento)
    return {
      categoria: p.categoria ?? null,
      sku: p.sku || '',
      nombre: p.nombre || '',
      unidad: p.unidad || null,
      unidadMenudeo: p.unidad_menudeo === 'litro' ? 'litro' : 'kilo',
      kilo: pr.kilo,
      caja: pr.caja,
      kiloLista: pr.kiloLista,
      cajaLista: pr.cajaLista,
      especialKilo: pr.especialKilo,
      especialCaja: pr.especialCaja,
    }
  })

  const grupos: GrupoCatalogo[] = CATEGORIAS
    .map((cat) => ({ nombre: cat, items: filas.filter((f) => f.categoria === cat) }))
    .filter((g) => g.items.length > 0)

  const otros = filas.filter((f) => !f.categoria || !CATEGORIAS.includes(f.categoria))
  if (otros.length > 0) grupos.push({ nombre: 'Otros', items: otros })

  const pdf = await generarCatalogoPDF({ cliente: clienteNombre, descuento, grupos })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivoCatalogo(clienteNombre)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
