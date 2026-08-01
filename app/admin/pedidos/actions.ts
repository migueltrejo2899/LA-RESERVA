'use server'
import { createClient } from '@/lib/supabase/server'
import { parseFacturaXML } from '@/lib/cfdi'
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
    .insert({
      folio,
      client_id: clientId,
      total,
      status: 'Recibido',
      ...(fecha ? { created_at: fecha } : {}),
    })
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
// Crea un pedido completo (con sus artículos) leyendo directamente el XML
// de una factura ya timbrada: fecha, conceptos y total salen del XML.
export async function createOrderFromFactura(formData: FormData) {
  const supabase = createClient()
  const clientId = String(formData.get('clientId') || '')
  const xmlFile = formData.get('xml') as File | null
  const pdfFile = formData.get('pdf') as File | null
  if (!clientId) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Selecciona un cliente.'))
  }
  if (!xmlFile || xmlFile.size === 0) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Sube el archivo XML de la factura.'))
  }
  let factura
  try {
    const xmlText = await xmlFile!.text()
    factura = parseFacturaXML(xmlText)
  } catch (e: any) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('No se pudo leer el XML: ' + (e?.message || e)))
  }
  if (!factura || factura.conceptos.length === 0) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('La factura no tiene conceptos (artículos) que registrar.'))
  }
  const { data: existente } = await supabase
    .from('invoices')
    .select('id')
    .eq('folio_fiscal', factura!.uuid)
    .maybeSingle()
  if (existente) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Esta factura (mismo folio fiscal) ya estaba registrada.'))
  }
  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  const folio = 'PED-' + String((count || 0) + 1).padStart(4, '0')
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      folio,
      client_id: clientId,
      total: factura!.total,
      status: 'Recibido',
      created_at: factura!.fecha,
    })
    .select()
    .single()
  if (orderError || !order) {
    redirect('/admin/pedidos?error=' + encodeURIComponent(orderError?.message || 'No se pudo crear el pedido.'))
  }
  await supabase.from('order_items').insert(
    factura!.conceptos.map((c) => ({
      order_id: order!.id,
      producto: c.producto,
      cantidad: c.cantidad,
      precio: c.precio,
    }))
  )
  await supabase.from('order_status_history').insert({
    order_id: order!.id,
    status: 'Recibido',
    note: 'Pedido creado automáticamente desde el XML de la factura',
  })
  const xmlPath = `${clientId}/${Date.now()}-${xmlFile!.name}`
  await supabase.storage.from('facturas').upload(xmlPath, xmlFile!)
  let filePath = xmlPath
  let fileName = xmlFile!.name
  let xmlPathCol: string | null = null
  let xmlNameCol: string | null = null
  if (pdfFile && pdfFile.size > 0) {
    const pdfPath = `${clientId}/${Date.now()}-${pdfFile.name}`
    await supabase.storage.from('facturas').upload(pdfPath, pdfFile)
    filePath = pdfPath
    fileName = pdfFile.name
    xmlPathCol = xmlPath
    xmlNameCol = xmlFile!.name
  }
  await supabase.from('invoices').insert({
    client_id: clientId,
    order_id: order!.id,
    tipo: 'factura',
    fecha: factura!.fecha,
    monto: factura!.total,
    file_path: filePath,
    file_name: fileName,
    xml_path: xmlPathCol,
    xml_name: xmlNameCol,
    folio_fiscal: factura!.uuid,
  })
  revalidatePath('/admin/pedidos')
  redirect(`/admin/pedidos/${order!.id}`)
}
// Crea un pedido nuevo copiando los artículos y precios del pedido más
// reciente del cliente (con fecha de hoy). Útil para clientes que piden
// lo mismo cada semana: se repite con un clic y se ajusta en el detalle.
export async function duplicarUltimoPedido(formData: FormData) {
  const supabase = createClient()
  const clientId = String(formData.get('clientId') || '')
  if (!clientId) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Selecciona un cliente.'))
  }
  const { data: ultimo } = await supabase
    .from('orders')
    .select('id, folio, total')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ultimo) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('Este cliente aún no tiene pedidos para repetir.'))
  }
  const { data: items } = await supabase
    .from('order_items')
    .select('producto, cantidad, precio')
    .eq('order_id', ultimo!.id)
  if (!items || items.length === 0) {
    redirect('/admin/pedidos?error=' + encodeURIComponent('El último pedido de este cliente no tiene artículos.'))
  }
  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  const folio = 'PED-' + String((count || 0) + 1).padStart(4, '0')
  const { data: order, error } = await supabase
    .from('orders')
    .insert({ folio, client_id: clientId, total: ultimo!.total, status: 'Recibido' })
    .select()
    .single()
  if (error || !order) {
    redirect('/admin/pedidos?error=' + encodeURIComponent(error?.message || 'No se pudo crear el pedido.'))
  }
  await supabase.from('order_items').insert(items!.map((it) => ({ ...it, order_id: order!.id })))
  await supabase.from('order_status_history').insert({
    order_id: order!.id,
    status: 'Recibido',
    note: `Pedido creado repitiendo el ${ultimo!.folio}`,
  })
  revalidatePath('/admin/pedidos')
  redirect(`/admin/pedidos/${order!.id}`)
}
