'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Parser de CSV sencillo (sin dependencias externas), soporta campos entre
// comillas con comas o comillas escapadas adentro.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export async function createProduct(formData: FormData) {
  const supabase = createClient()
  const sku = String(formData.get('sku') || '').trim()
  const nombre = String(formData.get('nombre') || '').trim()
  const descripcion = String(formData.get('descripcion') || '').trim() || null
  const unidad = String(formData.get('unidad') || '').trim() || null
  const precioRaw = formData.get('precio')
  const precio = precioRaw ? Number(precioRaw) : null
  const imagen = formData.get('imagen') as File | null

  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }

  let imagenPath: string | null = null
  if (imagen && imagen.size > 0) {
    const path = `${sku}/${Date.now()}-${imagen.name}`
    const { error: uploadError } = await supabase.storage.from('productos').upload(path, imagen)
    if (uploadError) {
      redirect('/admin/catalogo?error=' + encodeURIComponent('No se pudo subir la foto: ' + uploadError.message))
    }
    imagenPath = path
  }

  const { error } = await supabase
    .from('products')
    .insert({ sku, nombre, descripcion, unidad, precio, imagen_path: imagenPath })

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
  const publicado = formData.get('publicado') === 'on'
  const imagen = formData.get('imagen') as File | null

  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }
  if (publicado && !precio) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Para publicar este producto en el portal necesita tener un precio de venta.'))
  }

  const update: Record<string, any> = { sku, nombre, descripcion, unidad, precio, activo, publicado }

  if (imagen && imagen.size > 0) {
    const path = `${sku}/${Date.now()}-${imagen.name}`
    const { error: uploadError } = await supabase.storage.from('productos').upload(path, imagen)
    if (uploadError) {
      redirect('/admin/catalogo?error=' + encodeURIComponent('No se pudo subir la foto: ' + uploadError.message))
    }
    update.imagen_path = path
  }

  const { error } = await supabase.from('products').update(update).eq('id', id)

  if (error) {
    const msg = error.code === '23505' ? `Ya existe un producto con el SKU "${sku}".` : error.message
    redirect('/admin/catalogo?error=' + encodeURIComponent(msg))
  }

  revalidatePath('/admin/catalogo')
  revalidatePath('/portal/catalogo')
  redirect('/admin/catalogo')
}

export async function deleteProduct(formData: FormData) {
  const supabase = createClient()
  const id = String(formData.get('id') || '')
  const imagenPath = String(formData.get('imagenPath') || '')

  if (imagenPath) {
    await supabase.storage.from('productos').remove([imagenPath])
  }

  await supabase.from('products').delete().eq('id', id)

  revalidatePath('/admin/catalogo')
  revalidatePath('/portal/catalogo')
}

// Importa/actualiza productos en lote desde un CSV exportado de otra
// plataforma. Encabezados esperados (en cualquier orden): sku, nombre,
// descripcion, unidad, precio. Si el sku ya existe, se actualiza.
export async function bulkImportProducts(formData: FormData) {
  const supabase = createClient()
  const file = formData.get('file') as File | null

  if (!file || file.size === 0) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Selecciona un archivo CSV.'))
  }

  const text = await file!.text()
  const rows = parseCSV(text)

  if (rows.length < 2) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El CSV no tiene filas de productos.'))
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const idx = {
    sku: headers.indexOf('sku'),
    nombre: headers.indexOf('nombre'),
    descripcion: headers.indexOf('descripcion'),
    unidad: headers.indexOf('unidad'),
    precio: headers.indexOf('precio'),
  }

  if (idx.sku === -1 || idx.nombre === -1) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El CSV debe tener al menos las columnas "sku" y "nombre" en el encabezado.'))
  }

  const items = rows
    .slice(1)
    .map((r) => ({
      sku: (r[idx.sku] || '').trim(),
      nombre: (r[idx.nombre] || '').trim(),
      descripcion: idx.descripcion > -1 ? (r[idx.descripcion] || '').trim() || null : null,
      unidad: idx.unidad > -1 ? (r[idx.unidad] || '').trim() || null : null,
      precio: idx.precio > -1 && r[idx.precio] ? Number(r[idx.precio]) : null,
    }))
    .filter((it) => it.sku && it.nombre)

  if (items.length === 0) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('No se encontró ninguna fila válida (con SKU y nombre) en el CSV.'))
  }

  const { error } = await supabase.from('products').upsert(items, { onConflict: 'sku' })

  if (error) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Error al importar: ' + error.message))
  }

  revalidatePath('/admin/catalogo')
  redirect('/admin/catalogo?ok=' + encodeURIComponent(`Se importaron/actualizaron ${items.length} productos.`))
}

// Publica o despublica varios productos a la vez en el portal del cliente.
// Al publicar, se omiten los que no tengan precio de venta capturado.
export async function bulkPublicar(formData: FormData) {
  const supabase = createClient()
  const ids = formData.getAll('ids') as string[]
  const modo = String(formData.get('modo') || '')

  if (ids.length === 0) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Selecciona al menos un producto (con la casilla a la izquierda).'))
  }

  if (modo === 'publicar') {
    const { data: seleccionados } = await supabase.from('products').select('id, precio').in('id', ids)
    const publicables = (seleccionados || []).filter((p) => p.precio != null).map((p) => p.id)
    const omitidos = ids.length - publicables.length

    if (publicables.length > 0) {
      await supabase.from('products').update({ publicado: true }).in('id', publicables)
    }

    revalidatePath('/admin/catalogo')
    revalidatePath('/portal/catalogo')

    if (omitidos > 0) {
      redirect(
        '/admin/catalogo?error=' +
          encodeURIComponent(`Se publicaron ${publicables.length} producto(s). ${omitidos} no se publicaron por no tener precio de venta.`)
      )
    }
    redirect('/admin/catalogo?ok=' + encodeURIComponent(`Se publicaron ${publicables.length} producto(s).`))
  } else {
    await supabase.from('products').update({ publicado: false }).in('id', ids)
    revalidatePath('/admin/catalogo')
    revalidatePath('/portal/catalogo')
    redirect('/admin/catalogo?ok=' + encodeURIComponent(`Se quitaron del portal ${ids.length} producto(s).`))
  }
}
