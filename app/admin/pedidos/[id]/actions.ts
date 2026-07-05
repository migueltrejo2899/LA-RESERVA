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

  if (!file || file.size === 0) {
    redirect(`/admin/pedidos/${orderId}?error=${encodeURIComponent('Selecciona un archivo (PDF o XML).')}`)
  }

  const path = `${clientId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('facturas').upload(path, file)

  if (uploadError) {
    redirect(
