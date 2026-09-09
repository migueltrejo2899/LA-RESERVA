'use server'

import { createClient } from '@/lib/supabase/server'
import { normalizarDescuento } from '@/lib/precios'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Agrega ?clave=valor (o &clave=valor si la URL ya traía parámetros).
function conParametro(url: string, clave: string, valor: string) {
  return url + (url.includes('?') ? '&' : '?') + clave + '=' + encodeURIComponent(valor)
}

// Guarda los descuentos por categoría de un cliente.
// Recibe un renglón por categoría (categoria + descuento). Las que
// queden en 0 o vacías se borran, y esa categoría vuelve a usar el
// descuento general del cliente.
export async function setDescuentosCategoria(formData: FormData) {
  const supabase = createClient()

  const clientId = String(formData.get('clientId') || '')
  const volverA = String(formData.get('volverA') || '/admin/clientes')

  if (!clientId) {
    redirect(conParametro(volverA, 'error', 'Falta el cliente.'))
  }

  const categorias = formData.getAll('categoria') as string[]
  const valores = formData.getAll('descuento') as string[]

  const filas: { client_id: string; categoria: string; descuento: number }[] = []
  for (let i = 0; i < categorias.length; i++) {
    const categoria = String(categorias[i] || '').trim()
    if (!categoria) continue
    const descuento = normalizarDescuento(valores[i])
    if (descuento > 0) filas.push({ client_id: clientId, categoria, descuento })
  }

  // se reemplaza todo el juego de descuentos del cliente
  const { error: errorBorrado } = await supabase
    .from('client_category_discounts')
    .delete()
    .eq('client_id', clientId)

  if (errorBorrado) {
    redirect(conParametro(volverA, 'error', errorBorrado.message))
  }

  if (filas.length > 0) {
    const { error } = await supabase.from('client_category_discounts').insert(filas)
    if (error) {
      redirect(conParametro(volverA, 'error', error.message))
    }
  }

  revalidatePath('/admin/clientes')
  revalidatePath('/admin/catalogo/precios')
  revalidatePath('/portal/catalogo')

  const cuantos = filas.length
  redirect(
    conParametro(
      volverA,
      'ok',
      cuantos === 0
        ? 'Se quitaron los descuentos por categoría; ese cliente vuelve a usar solo su descuento general.'
        : `Se guardaron ${cuantos} descuento(s) por categoría.`
    )
  )
}
