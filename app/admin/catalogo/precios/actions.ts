'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Guarda (o quita) el precio especial de un producto para un cliente.
// Si el campo de precio viene vacío, se elimina el precio especial y el
// cliente vuelve a ver el precio general del catálogo.
export async function setClientPrice(formData: FormData) {
  const supabase = createClient()
  const clientId = String(formData.get('clientId') || '')
  const productId = String(formData.get('productId') || '')
  const precioRaw = String(formData.get('precio') || '').trim()

  if (!clientId || !productId) {
    redirect('/admin/catalogo/precios?error=' + encodeURIComponent('Faltan datos.'))
  }

  if (precioRaw === '') {
    await supabase.from('client_prices').delete().eq('client_id', clientId).eq('product_id', productId)
  } else {
    const precio = Number(precioRaw)
    if (!precio || precio <= 0) {
      redirect(`/admin/catalogo/precios?cliente=${clientId}&error=` + encodeURIComponent('Ingresa un precio válido.'))
    }
    await supabase
      .from('client_prices')
      .upsert({ client_id: clientId, product_id: productId, precio }, { onConflict: 'client_id,product_id' })
  }

  revalidatePath('/admin/catalogo/precios')
  redirect(`/admin/catalogo/precios?cliente=${clientId}`)
}

// Actualiza de un jalón los precios generales del catálogo: recibe todos
// los productos con su precio capturado y guarda solo los que cambiaron.
export async function updatePreciosMasivos(formData: FormData) {
  const supabase = createClient()
  const ids = formData.getAll('productId') as string[]
  const precios = formData.getAll('precio') as string[]
  const originales = formData.getAll('precioOriginal') as string[]

  let actualizados = 0

  for (let i = 0; i < ids.length; i++) {
    const nuevoRaw = String(precios[i] ?? '').trim()
    const originalRaw = String(originales[i] ?? '').trim()

    if (nuevoRaw === originalRaw) continue

    const nuevo = nuevoRaw === '' ? null : Number(nuevoRaw)
    if (nuevoRaw !== '' && (!nuevo || nuevo <= 0)) continue

    const { error } = await supabase.from('products').update({ precio: nuevo }).eq('id', ids[i])
    if (!error) actualizados++
  }

  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/catalogo/precios')
  revalidatePath('/portal/catalogo')
  redirect('/admin/catalogo/precios?ok=' + encodeURIComponent(`Se actualizaron ${actualizados} precio(s).`))
}
