'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateStatus(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const status = String(formData.get('status') || '')
  const note = String(formData.get('note') || '')

  await supabase.from('orders').update({ status }).eq('id', orderId)
  await supabase.from('order_status_history').insert({ order_id: orderId, status, note })

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function addPayment(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const monto = Number(formData.get('monto'))
  const fecha = String(formData.get('fecha') || '')
  const metodo = String(formData.get('metodo') || '')
  const nota = String(formData.get('nota') || '')

  if (!monto || monto <= 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Ingresa un monto válido.')}`)
  }

  await supabase.from('payments').insert({ order_id: orderId, monto, fecha, metodo, nota })

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function uploadInvoice(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const clientId = String(formData.get('clientId') || '')
  const tipo = String(formData.get('tipo') || 'factura')
  const fecha = String(formData.get('fecha') || '')
  const monto = formData.get('monto') ? Number(formData.get('monto')) : null
  const file = formData.get('file') as File
  const facturaIdRaw = String(formData.get('facturaId') || '')
  const facturaId = tipo === 'complemento_pago' && facturaIdRaw ? facturaIdRaw : null

  if (!file || file.size === 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Selecciona un archivo (PDF o XML).')}`)
  }

  const path = `${clientId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('facturas').upload(path, file)

  if (uploadError) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent(uploadError.message)}`)
  }

  await supabase.from('invoices').insert({
    client_id: clientId,
    order_id: orderId,
    tipo,
    fecha,
    monto,
    file_path: path,
    file_name: file.name,
    factura_id: facturaId,
  })

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function updateInvoice(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const invoiceId = String(formData.get('invoiceId') || '')
  const tipo = String(formData.get('tipo') || 'factura')
  const fecha = String(formData.get('fecha') || '')
  const monto = formData.get('monto') ? Number(formData.get('monto')) : null
  const facturaIdRaw = String(formData.get('facturaId') || '')
  const facturaId = tipo === 'complemento_pago' && facturaIdRaw ? facturaIdRaw : null

  await supabase.from('invoices').update({ tipo, fecha, monto, factura_id: facturaId }).eq('id', invoiceId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function deleteInvoice(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const invoiceId = String(formData.get('invoiceId') || '')
  const filePath = String(formData.get('filePath') || '')

  if (filePath) {
    await supabase.storage.from('facturas').remove([filePath])
  }
  await supabase.from('invoices').delete().eq('id', invoiceId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

async function recalcOrderTotal(supabase: ReturnType<typeof createClient>, orderId: string) {
  const { data: items } = await supabase.from('order_items').select('cantidad, precio').eq('order_id', orderId)
  const total = (items || []).reduce((s, it) => s + Number(it.cantidad) * Number(it.precio), 0)
  await supabase.from('orders').update({ total }).eq('id', orderId)
}

export async function updateOrderItem(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const itemId = String(formData.get('itemId') || '')
  const producto = String(formData.get('producto') || '').trim()
  const cantidad = Number(formData.get('cantidad'))
  const precio = Number(formData.get('precio'))

  if (!producto || !cantidad || cantidad <= 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Producto y cantidad válidos son obligatorios.')}`)
  }

  await supabase.from('order_items').update({ producto, cantidad, precio }).eq('id', itemId)
  await recalcOrderTotal(supabase, orderId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function deleteOrderItem(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const itemId = String(formData.get('itemId') || '')

  const { count } = await supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId)
  if ((count || 0) <= 1) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('El pedido debe tener al menos un artículo.')}`)
  }

  await supabase.from('order_items').delete().eq('id', itemId)
  await recalcOrderTotal(supabase, orderId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function addOrderItem(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const producto = String(formData.get('producto') || '').trim()
  const cantidad = Number(formData.get('cantidad'))
  const precio = Number(formData.get('precio'))

  if (!producto || !cantidad || cantidad <= 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Producto y cantidad válidos son obligatorios.')}`)
  }

  await supabase.from('order_items').insert({ order_id: orderId, producto, cantidad, precio: precio || 0 })
  await recalcOrderTotal(supabase, orderId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function updatePayment(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const paymentId = String(formData.get('paymentId') || '')
  const monto = Number(formData.get('monto'))
  const fecha = String(formData.get('fecha') || '')
  const metodo = String(formData.get('metodo') || '')
  const nota = String(formData.get('nota') || '')

  if (!monto || monto <= 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Ingresa un monto válido.')}`)
  }

  await supabase.from('payments').update({ monto, fecha, metodo, nota }).eq('id', paymentId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}

export async function deletePayment(formData: FormData) {
  const supabase = createClient()
  const orderId = String(formData.get('orderId') || '')
  const paymentId = String(formData.get('paymentId') || '')

  await supabase.from('payments').delete().eq('id', paymentId)

  revalidatePath(`/admin/pedidos/${orderId}`)
  redirect(`/admin/pedidos/${orderId}`)
}
