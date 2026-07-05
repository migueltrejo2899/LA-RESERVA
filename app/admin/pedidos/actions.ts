'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createOrder(formData: FormData) {
  const supabase = createClient()

  const clientId = String(formData.get('clientId') || '')
  const fecha = String(formData.get('fecha') || '')
  const productos = formData.getAll('producto') as string[]
  const cantidades = formData.getAll('cantidad') as string[]
  const precios = formData.getAll('precio') as string[]

  if (!clientId) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Selecciona un cliente.'))
  }

  const items = productos
    .map((p, i) => ({ producto: p.trim(), cantidad: Number(cantidades[i]), precio: Number(precios[i]) }))
    .filter((it) => it.producto !== '' && it.cantidad > 0)

  if (items.length === 0) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Agrega al menos un artículo válido.'))
  }

  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0)

  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  const folio = 'PED-' + String((count || 0) + 1).padStart(4, '0')

  const { data: order, error } = await supabase
    .from('orders')
    .insert({ folio, client_id: clientId, total, status: 'Recibido' })
    .select()
    .single()

  if (error || !order) {
    redirect('/admin/pedidos?error=' + encodeURIComponent(error?.message || 'No se pudo crear el pedido.'))
  }

  await supabase.from('order_items').insert(items.map((it) => ({ ...it, order_id: order!.id })))
  await supabase.from('order_status_history').insert({
    order_id: order!.id,
    status: 'Recibido',
    note: 'Pedido registrado',
  })

  revalidatePath('/admin/pedidos')
  redirect(`/admin/pedidos/${order!.id}`)
}
