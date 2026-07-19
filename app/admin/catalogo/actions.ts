'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createProduct(formData: FormData) {
  const supabase = createClient()
  const sku = String(formData.get('sku') || '').trim()
  const nombre = String(formData.get('nombre') || '').trim()
  const descripcion = String(formData.get('descripcion') || '').trim() || null
  const unidad = String(formData.get('unidad') || '').trim() || null
  const precioRaw = formData.get('precio')
  const precio = precioRaw ? Number(precioRaw) : null

  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }

  const { error } = await supabase.from('products').insert({ sku, nombre, descripcion, unidad, precio })

  if (error) {
    const msg = error.code === '23505' ? `Ya existe un producto con el SKU "${sku}".` : error.message
    redirect('/admin/catalogo?error=' + encodeURIComponent(msg))
  }

  revalidatePath('/admin/catalogo')
  redirect('/admin/catalogo')
}

export async function updateProduct(formData: FormData) {
  const supabase = createClient()
  const id = String(formData.get('id') || '')
  const sku = String(formData.get('sku') || '').trim()
  const nombre = String(formData.get('nombre') || '').trim()
  const descripcion = String(formData.get('descripcion') || '').trim() || null
  const unidad = String(formData.get('unidad') || '').trim() || null
  const precioRaw = formData.get('precio')
  const precio = precioRaw ? Number(precioRaw) : null
  const activo = formData.get('activo') === 'on'

  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }

  const { error } = await supabase
    .from('products')
    .update({ sku, nombre, descripcion, unidad, precio, activo })
    .eq('id', id)

  if (error) {
    const msg = error.code === '23505' ? `Ya existe un producto con el SKU "${sku}".` : error.message
    redirect('/admin/catalogo?error=' + encodeURIComponent(msg))
  }

  revalidatePath('/admin/catalogo')
  redirect('/admin/catalogo')
}

export async function deleteProduct(formData: FormData) {
  const supabase = createClient()
  const id = String(formData.get('id') || '')

  await supabase.from('products').delete().eq('id', id)

  revalidatePath('/admin/catalogo')
}
