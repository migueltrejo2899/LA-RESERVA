'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function categoriasValidas(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await supabase.from('categorias').select('nombre')
  return (data || []).map((c) => c.nombre)
}

function normalizarCategoria(valor: string, validas: string[]): string | null {
  const v = valor.trim()
  if (!v) return null
  const match = validas.find((c) => c.toLowerCase() === v.toLowerCase())
  return match || null
}

function normalizarUnidadMenudeo(valor: FormDataEntryValue | null): string {
  return String(valor || '').trim().toLowerCase() === 'litro' ? 'litro' : 'kilo'
}

function numeroONull(valor: FormDataEntryValue | null): number | null {
  const v = String(valor ?? '').trim()
  if (v === '') return null
  const n = Number(v)
  return n > 0 ? n : null
}

// Limpia un texto para usarlo como ruta de archivo en el storage:
// quita acentos y ñ, y reemplaza cualquier otro carácter raro por guion.
function rutaSegura(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
}

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

// ===== Categorías =====
export async function createCategoria(formData: FormData) {
  const supabase = createClient()
  const nombre = String(formData.get('nombre') || '').trim()
  if (!nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Escribe el nombre de la categoría.'))
  }
  const { error } = await supabase.from('categorias').insert({ nombre })
  if (error) {
    const msg = error.code === '23505' ? `La categoría "${nombre}" ya existe.` : error.message
    redirect('/admin/catalogo?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/admin/catalogo')
  revalidatePath('/portal/catalogo')
  redirect('/admin/catalogo?ok=' + encodeURIComponent(`Categoría "${nombre}" creada.`))
}

export async function deleteCategoria(formData: FormData) {
  const supabase = createClient()
  const id = String(formData.get('id') || '')
  const nombre = String(formData.get('nombre') || '')
  await supabase.from('categorias').delete().eq('id', id)
  // los productos que tenían esta categoría se quedan sin categoría
  if (nombre) {
    await supabase.from('products').update({ categoria: null }).eq('categoria', nombre)
  }
  revalidatePath('/admin/catalogo')
  revalidatePath('/portal/catalogo')
  redirect('/admin/catalogo?ok=' + encodeURIComponent('Categoría eliminada. Sus productos quedaron sin categoría.'))
}

// ===== Productos =====
export async function createProduct(formData: FormData) {
  const supabase = createClient()
  const validas = await categoriasValidas(supabase)
  const sku = String(formData.get('sku') || '').trim()
  const nombre = String(formData.get('nombre') || '').trim()
  const descripcion = String(formData.get('descripcion') || '').trim() || null
  const unidad = String(formData.get('unidad') || '').trim() || null
  const categoria = normalizarCategoria(String(formData.get('categoria') || ''), validas)
  const unidadMenudeo = normalizarUnidadMenudeo(formData.get('unidad_menudeo'))
  const precioKilo = numeroONull(formData.get('precio_kilo'))
  const precioCaja = numeroONull(formData.get('precio_caja'))
  const imagen = formData.get('imagen') as File | null
  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }
  let imagenPath: string | null = null
  if (imagen && imagen.size > 0) {
    const path = `${rutaSegura(sku)}/${Date.now()}-${rutaSegura(imagen.name)}`
    const { error: uploadError } = await supabase.storage.from('productos').upload(path, imagen)
    if (uploadError) {
      redirect('/admin/catalogo?error=' + encodeURIComponent('No se pudo subir la foto: ' + uploadError.message))
    }
    imagenPath = path
  }
  const { error } = await supabase
    .from('products')
    .insert({ sku, nombre, descripcion, unidad, categoria, unidad_menudeo: unidadMenudeo, precio_kilo: precioKilo, precio_caja: precioCaja, imagen_path: imagenPath })
  if (error) {
    const msg = error.code === '23505' ? `Ya existe un producto con el SKU "${sku}".` : error.message
    redirect('/admin/catalogo?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/admin/catalogo')
  redirect('/admin/catalogo')
}
export async function updateProduct(formData: FormData) {
  const supabase = createClient()
  const validas = await categoriasValidas(supabase)
  const id = String(formData.get('id') || '')
  const sku = String(formData.get('sku') || '').trim()
  const nombre = String(formData.get('nombre') || '').trim()
  const descripcion = String(formData.get('descripcion') || '').trim() || null
  const unidad = String(formData.get('unidad') || '').trim() || null
  const categoria = normalizarCategoria(String(formData.get('categoria') || ''), validas)
  const unidadMenudeo = normalizarUnidadMenudeo(formData.get('unidad_menudeo'))
  const precioKilo = numeroONull(formData.get('precio_kilo'))
  const precioCaja = numeroONull(formData.get('precio_caja'))
  const activo = formData.get('activo') === 'on'
  const publicado = formData.get('publicado') === 'on'
  const imagen = formData.get('imagen') as File | null
  if (!sku || !nombre) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('El SKU y el nombre del producto son obligatorios.'))
  }
  if (publicado && precioKilo == null && precioCaja == null) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Para publicar este producto necesita al menos un precio (menudeo o caja).'))
  }
  const update: Record<string, any> = { sku, nombre, descripcion, unidad, categoria, unidad_menudeo: unidadMenudeo, precio_kilo: precioKilo, precio_caja: precioCaja, activo, publicado }
  if (imagen && imagen.size > 0) {
    const path = `${rutaSegura(sku)}/${Date.now()}-${rutaSegura(imagen.name)}`
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
// Importa/actualiza productos en lote desde un CSV. Encabezados: sku, nombre
// (obligatorios) y opcionales: descripcion, unidad, categoria, unidad_menudeo
// (kilo o litro), precio_kilo, precio_caja. Si el sku existe, se actualiza.
export async function bulkImportProducts(formData: FormData) {
  const supabase = createClient()
  const validas = await categoriasValidas(supabase)
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
    categoria: headers.indexOf('categoria'),
    unidad_menudeo: headers.indexOf('unidad_menudeo'),
    precio_kilo: headers.indexOf('precio_kilo'),
    precio_caja: headers.indexOf('precio_caja'),
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
      categoria: idx.categoria > -1 ? normalizarCategoria(r[idx.categoria] || '', validas) : null,
      unidad_menudeo: idx.unidad_menudeo > -1 ? normalizarUnidadMenudeo(r[idx.unidad_menudeo] || '') : 'kilo',
      precio_kilo: idx.precio_kilo > -1 && r[idx.precio_kilo] ? Number(r[idx.precio_kilo]) || null : null,
      precio_caja: idx.precio_caja > -1 && r[idx.precio_caja] ? Number(r[idx.precio_caja]) || null : null,
    }))
    .filter((it) => it.sku && it.nombre)
  if (items.length === 0) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('No se encontró ninguna fila válida (con SKU y nombre) en el CSV.'))
  }
  // si el archivo trae el mismo SKU en varias filas, nos quedamos con la última
  const porSku = new Map(items.map((it) => [it.sku.toLowerCase(), it]))
  const unicos = Array.from(porSku.values())
  const duplicados = items.length - unicos.length
  const { error } = await supabase.from('products').upsert(unicos, { onConflict: 'sku' })
  if (error) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Error al importar: ' + error.message))
  }
  revalidatePath('/admin/catalogo')
  redirect(
    '/admin/catalogo?ok=' +
      encodeURIComponent(
        `Se importaron/actualizaron ${unicos.length} productos.` +
          (duplicados > 0 ? ` (${duplicados} fila(s) traían SKU repetido; se usó la última de cada una.)` : '')
      )
  )
}
// Publica o despublica varios productos a la vez en el portal del cliente.
export async function bulkPublicar(formData: FormData) {
  const supabase = createClient()
  const ids = formData.getAll('ids') as string[]
  const modo = String(formData.get('modo') || '')
  if (ids.length === 0) {
    redirect('/admin/catalogo?error=' + encodeURIComponent('Selecciona al menos un producto (con la casilla a la izquierda).'))
  }
  if (modo === 'publicar') {
    const { data: seleccionados } = await supabase.from('products').select('id, precio_kilo, precio_caja').in('id', ids)
    const publicables = (seleccionados || []).filter((p) => p.precio_kilo != null || p.precio_caja != null).map((p) => p.id)
    const omitidos = ids.length - publicables.length
    if (publicables.length > 0) {
      await supabase.from('products').update({ publicado: true }).in('id', publicables)
    }
    revalidatePath('/admin/catalogo')
    revalidatePath('/portal/catalogo')
    if (omitidos > 0) {
      redirect(
        '/admin/catalogo?error=' +
          encodeURIComponent(`Se publicaron ${publicables.length} producto(s). ${omitidos} no se publicaron por no tener ningún precio capturado.`)
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
