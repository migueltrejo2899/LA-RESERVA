'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Guarda la verificación de entrega del cliente: marca cada artículo del
// pedido como recibido (o no), y deja constancia en el seguimiento del
// pedido para que el administrador también lo vea.
export async function marcarRecibidos(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const orderId = String(formData.get('orderId') || '')
  const recibidos = (formData.getAll('recibidos') as string[]).filter(Boolean)

  // el pedido debe ser del cliente que está firmado
  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('client_id', user!.id)
    .single()

  if (!order) {
    redirect('/portal')
  }

  const { data: items } = await supabase.from('order_items').select('id').eq('order_id', orderId)
  const todosIds = (items || []).map((i) => i.id)
  const marcados = todosIds.filter((id) => recibidos.includes(id))
  const noMarcados = todosIds.filter((id) => !recibidos.includes(id))

  if (marcados.length > 0) {
    await supabase.from('order_items').update({ recibido: true }).in('id', marcados)
  }
  if (noMarcados.length > 0) {
    await supabase.from('order_items').update({ recibido: false }).in('id', noMarcados)
  }

  await supabase.from('order_status_history').insert({
    order_id: orderId,
    status: order!.status,
    note: `El cliente verificó la entrega: ${marcados.length} de ${todosIds.length} artículo(s) marcados como recibidos`,
  })

  revalidatePath(`/portal/pedidos/${orderId}`)
  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/portal/pedidos/${orderId}/picking?ok=1`)
}
