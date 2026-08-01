'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function numeroONull(valor: FormDataEntryValue | null): number | null {
  const v = String(valor ?? '').trim()
  if (v === '') return null
  const n = Number(v)
  return n > 0 ? n : null
}

// Guarda (o quita) los precios especiales por kilo y por caja de un
// producto para un cliente. Si ambos campos vienen vacíos, se elimina el
// registro y el cliente vuelve a ver los precios generales del catálogo.
export async function setClientPrice(formData: FormData) {
  const supabase = createClient()
  const clientId = String(formData.get('clientId') || '')
  const productId = String(formData.get('productId') || '')
  const precioKilo = numeroONull(formData.get('precio_kilo'))
  const precioCaja = numeroONull(formData.get('precio_caja'))

  if (!clientId || !productId) {
    redirect('/admin/catalogo/precios?error=' + encodeURIComponent('Faltan datos.'))
  }

  if (precioKilo == null && precioCaja == null) {
    await supabase.from('client_prices').delete().eq('client_id', clientId).eq('product_id', productId)
  } else {
    await supabase
      .from('client_prices')
      .upsert(
        { client_id: clientId, product_id: productId, precio_kilo: precioKilo, precio_caja: precioCaja },
        { onConflict: 'client_id,product_id' }
      )
  }

  revalidatePath('/admin/catalogo/precios')
  redirect(`/admin/catalogo/precios?cliente=${clientId}`)
}

// Actualiza de un jalón los precios generales del catálogo (kilo y caja):
// recibe todos los productos y guarda solo los que cambiaron.
export async function updatePreciosMasivos(formData: FormData) {
  const supabase = createClient()
  const ids = formData.getAll('productId') as string[]
  const kilos = formData.getAll('precio_kilo') as string[]
  const kilosOrig = formData.getAll('precio_kilo_original') as string[]
  const cajas = formData.getAll('precio_caja') as string[]
  const cajasOrig = formData.getAll('precio_caja_original') as string[]

  let actualizados = 0

  for (let i = 0; i < ids.length; i++) {
    const kiloNuevo = String(kilos[i] ?? '').trim()
    const kiloOrig = String(kilosOrig[i] ?? '').trim()
    const cajaNueva = String(cajas[i] ?? '').trim()
    const cajaOrig = String(cajasOrig[i] ?? '').trim()

    if (kiloNuevo === kiloOrig && cajaNueva === cajaOrig) continue

    const update: Record<string, number | null> = {}
    if (kiloNuevo !== kiloOrig) {
      update.precio_kilo = kiloNuevo === '' ? null : Number(kiloNuevo) > 0 ? Number(kiloNuevo) : null
    }
    if (cajaNueva !== cajaOrig) {
      update.precio_caja = cajaNueva === '' ? null : Number(cajaNueva) > 0 ? Number(cajaNueva) : null
    }

    const { error } = await supabase.from('products').update(update).eq('id', ids[i])
    if (!error) actualizados++
  }

  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/catalogo/precios')
  revalidatePath('/portal/catalogo')
  redirect('/admin/catalogo/precios?ok=' + encodeURIComponent(`Se actualizaron ${actualizados} producto(s).`))
}
