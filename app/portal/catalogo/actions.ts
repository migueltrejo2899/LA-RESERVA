'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Crea un pedido con los productos y cantidades que el cliente capturó en
// el catálogo, usando sus precios especiales si los tiene. El pedido entra
// igual que uno registrado por el administrador (estatus "Recibido").
export async function crearPedidoCliente(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user!.id).single()
  if (profile?.username?.toLowerCase() === 'publico') {
    redirect('/portal/catalogo?error=' + encodeURIComponent('Esta cuenta es solo para consultar el catálogo.'))
  }

  const ids = formData.getAll('productId') as string[]
  const kilos = formData.getAll('kilos') as string[]
  const cajas = formData.getAll('cajas') as string[]

  const seleccion = ids
    .map((id, i) => ({
      id,
      kilos: Number(String(kilos[i] ?? '').trim()) || 0,
      cajas: Number(String(cajas[i] ?? '').trim()) || 0,
    }))
    .filter((s) => s.kilos > 0 || s.cajas > 0)

  if (seleccion.length === 0) {
    redirect('/portal/catalogo?error=' + encodeURIComponent('Captura al menos una cantidad (kilos o cajas) para hacer tu pedido.'))
  }

  const [{ data: products }, { data: precios }] = await Promise.all([
    supabase
      .from('products')
      .select('id, nombre, precio_kilo, precio_caja')
      .eq('publicado', true)
      .eq('activo', true)
      .in('id', seleccion.map((s) => s.id)),
    supabase.from('client_prices').select('product_id, precio_kilo, precio_caja').eq('client_id', user!.id),
  ])

  const especialDe = new Map((precios || []).map((p) => [p.product_id, p]))

  const items: { producto: string; cantidad: number; precio: number }[] = []
  for (const s of seleccion) {
    const p = products?.find((x) => x.id === s.id)
    if (!p) continue
    const esp = especialDe.get(p.id)
    const precioKilo = esp?.precio_kilo ?? p.precio_kilo
    const precioCaja = esp?.precio_caja ?? p.precio_caja
    if (s.kilos > 0 && precioKilo != null) {
      items.push({ producto: `${p.nombre} (kilo)`, cantidad: s.kilos, precio: Number(precioKilo) })
    }
    if (s.cajas > 0 && precioCaja != null) {
      items.push({ producto: `${p.nombre} (caja)`, cantidad: s.cajas, precio: Number(precioCaja) })
    }
  }

  if (items.length === 0) {
    redirect('/portal/catalogo?error=' + encodeURIComponent('Los productos seleccionados no tienen precio para la presentación elegida.'))
  }

  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0)

  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  const folio = 'PED-' + String((count || 0) + 1).padStart(4, '0')

  const { data: order, error } = await supabase
    .from('orders')
    .insert({ folio, client_id: user!.id, total, status: 'Recibido' })
    .select()
    .single()

  if (error || !order) {
    redirect('/portal/catalogo?error=' + encodeURIComponent(error?.message || 'No se pudo registrar tu pedido.'))
  }

  await supabase.from('order_items').insert(items.map((it) => ({ ...it, order_id: order!.id })))
  await supabase.from('order_status_history').insert({
    order_id: order!.id,
    status: 'Recibido',
    note: 'Pedido realizado por el cliente desde el catálogo',
  })

  revalidatePath('/portal')
  revalidatePath('/admin/pedidos')
  redirect(`/portal/pedidos/${order!.id}/picking`)
}
