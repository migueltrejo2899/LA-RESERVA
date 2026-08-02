'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFacturaXML, parseComplementoPagoXML, type ConceptoCFDI } from '@/lib/cfdi'
import { XMLParser } from 'fast-xml-parser'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type UploadResult = {
  fileName: string
  status: 'ok' | 'sin_rfc_coincidente' | 'error'
  message?: string
  clientName?: string
}

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
}

// Revisa el XML sin asumir su tipo: dice si es un complemento de pago
// (TipoDeComprobante "P") y de qué RFC es el receptor.
function inspeccionarXML(xmlText: string) {
  const parser = new XMLParser(parserOptions)
  const data = parser.parse(xmlText)
  const comprobante = data.Comprobante
  const tipoComprobante = comprobante?.['@_TipoDeComprobante'] || ''
  const rfcReceptor = String(comprobante?.Receptor?.['@_Rfc'] || '').toUpperCase()
  return { esComplemento: tipoComprobante === 'P', rfcReceptor }
}

// Clave de emparejado tolerante: sin extensión, sin "(1)", sin acentos,
// sin mayúsculas y sin símbolos.
function claveDe(nombre: string) {
  const dot = nombre.lastIndexOf('.')
  const base = dot > -1 ? nombre.slice(0, dot) : nombre
  return base
    .replace(/\s*\(\d+\)\s*$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

async function crearPedidoDesdeConceptos(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  fecha: string,
  total: number,
  conceptos: ConceptoCFDI[],
  nota: string
): Promise<string | null> {
  if (conceptos.length === 0) return null

  const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
  const folio = 'PED-' + String((count || 0) + 1).padStart(4, '0')

  const { data: order } = await supabase
    .from('orders')
    .insert({ folio, client_id: clientId, total, status: 'Recibido', created_at: fecha })
    .select()
    .single()

  if (!order) return null

  await supabase.from('order_items').insert(
    conceptos.map((c) => ({ order_id: order.id, producto: c.producto, cantidad: c.cantidad, precio: c.precio }))
  )
  await supabase.from('order_status_history').insert({ order_id: order.id, status: 'Recibido', note: nota })

  return order.id
}

// Registra el pago del complemento. Si ya existe un pago de este mismo
// complemento (mismo folio fiscal en la nota), NO lo duplica.
async function registrarPagoDeComplemento(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  monto: number,
  fecha: string,
  folioFiscal: string
) {
  if (!monto || monto <= 0) return

  if (folioFiscal) {
    const { data: pagoExistente } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', orderId)
      .ilike('nota', `%${folioFiscal}%`)
      .limit(1)
      .maybeSingle()
    if (pagoExistente) return
  }

  await supabase.from('payments').insert({
    order_id: orderId,
    monto,
    fecha,
    metodo: 'Complemento de pago',
    nota: `Pago registrado automáticamente por complemento de pago (folio fiscal ${folioFiscal})`,
  })
}

// Sube pares de XML + PDF. Cada factura se asigna por RFC, crea su pedido,
// y cada complemento se liga a su factura y registra su pago.
// Si el documento ya estaba registrado pero SIN su PDF, y ahora viene el
// PDF, se lo anexa al registro existente en vez de rechazarlo.
export async function bulkUploadInvoices(formData: FormData): Promise<UploadResult[]> {
  const supabase = createClient()
  const files = formData.getAll('files') as File[]
  const validos = files.filter((f) => f && f.size > 0)

  if (validos.length === 0) {
    return [{ fileName: '(sin archivos)', status: 'error', message: 'No se seleccionó ningún archivo.' }]
  }

  const grupos = new Map<string, { xml?: File; pdf?: File }>()
  for (const f of validos) {
    const ext = f.name.toLowerCase().split('.').pop() || ''
    const grupo = grupos.get(claveDe(f.name)) || {}
    if (ext === 'xml') grupo.xml = f
    else if (ext === 'pdf') grupo.pdf = f
    grupos.set(claveDe(f.name), grupo)
  }

  // red de seguridad: si viene exactamente UN xml y UN pdf, son pareja
  const xmls = validos.filter((f) => f.name.toLowerCase().endsWith('.xml'))
  const pdfs = validos.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
  if (xmls.length === 1 && pdfs.length === 1) {
    grupos.clear()
    grupos.set('par', { xml: xmls[0], pdf: pdfs[0] })
  }

  const { data: clients } = await supabase.from('profiles').select('id, name, rfc').eq('role', 'client')

  const results: UploadResult[] = []

  for (const [base, { xml, pdf }] of grupos) {
    if (!xml) {
      results.push({ fileName: pdf?.name || base, status: 'error', message: 'Falta el archivo XML de este par.' })
      continue
    }

    try {
      const xmlText = await xml.text()
      const { esComplemento, rfcReceptor } = inspeccionarXML(xmlText)

      const clienteMatch = clients?.find((c) => c.rfc && c.rfc.toUpperCase() === rfcReceptor)

      if (!clienteMatch) {
        results.push({
          fileName: xml.name,
          status: 'sin_rfc_coincidente',
          message: rfcReceptor
            ? `El RFC ${rfcReceptor} no coincide con ningún cliente registrado.`
            : 'No se encontró el RFC del receptor en el XML.',
        })
        continue
      }

      // ===== 1. Leer los datos del XML (sin tocar la base todavía) =====
      let tipo: 'factura' | 'complemento_pago' = 'factura'
      let fecha = ''
      let monto: number | null = null
      let folioFiscal = ''
      let facturaIdRelacionada: string | null = null
      let orderId: string | null = null
      let facturaParseada: ReturnType<typeof parseFacturaXML> | null = null

      if (esComplemento) {
        const comp = parseComplementoPagoXML(xmlText)
        tipo = 'complemento_pago'
        fecha = comp.fecha
        folioFiscal = comp.uuid
        const relacion = comp.pagosRelacionados[0]
        monto = relacion?.importePagado || comp.montoTotal || null

        if (relacion?.idDocumentoRelacionado) {
          const { data: facturaRelacionada } = await supabase
            .from('invoices')
            .select('id, order_id')
            .eq('tipo', 'factura')
            .eq('folio_fiscal', relacion.idDocumentoRelacionado)
            .maybeSingle()
          facturaIdRelacionada = facturaRelacionada?.id || null
          orderId = facturaRelacionada?.order_id || null
        }
      } else {
        facturaParseada = parseFacturaXML(xmlText)
        tipo = 'factura'
        fecha = facturaParseada.fecha
        monto = facturaParseada.total
        folioFiscal = facturaParseada.uuid
      }

      if (!folioFiscal) {
        results.push({ fileName: xml.name, status: 'error', message: 'No se encontró el folio fiscal (UUID) en el XML.' })
        continue
      }

      // ===== 2. Revisar duplicados ANTES de crear cualquier cosa =====
      const { data: yaExiste } = await supabase
        .from('invoices')
        .select('id, file_path, file_name, xml_path, client_id')
        .eq('folio_fiscal', folioFiscal)
        .limit(1)
        .maybeSingle()

      if (yaExiste) {
        // si el registro existente solo tiene XML y ahora traemos el PDF,
        // se lo anexamos en lugar de rechazarlo
        const soloXml = !yaExiste.xml_path && yaExiste.file_name?.toLowerCase().endsWith('.xml')
        if (soloXml && pdf) {
          const pdfPath = `${yaExiste.client_id}/${Date.now()}-${pdf.name}`
          await supabase.storage.from('facturas').upload(pdfPath, pdf)
          await supabase
            .from('invoices')
            .update({
              xml_path: yaExiste.file_path,
              xml_name: yaExiste.file_name,
              file_path: pdfPath,
              file_name: pdf.name,
            })
            .eq('id', yaExiste.id)
          results.push({ fileName: pdf.name, status: 'ok', clientName: clienteMatch.name, message: 'Se anexó el PDF al registro existente.' })
        } else {
          results.push({ fileName: xml.name, status: 'error', message: 'Ya estaba registrado (mismo folio fiscal). No se duplicó.' })
        }
        continue
      }

      // ===== 3. Ahora sí: crear pedido (facturas), subir archivos, registrar =====
      if (tipo === 'factura' && facturaParseada) {
        orderId = await crearPedidoDesdeConceptos(
          supabase,
          clienteMatch.id,
          facturaParseada.fecha,
          facturaParseada.total,
          facturaParseada.conceptos,
          'Pedido creado automáticamente al subir la factura'
        )
      }

      const xmlPath = `${clienteMatch.id}/${Date.now()}-${xml.name}`
      await supabase.storage.from('facturas').upload(xmlPath, xml)

      let filePath = xmlPath
      let fileName = xml.name
      let xmlPathCol: string | null = null
      let xmlNameCol: string | null = null

      if (pdf) {
        const pdfPath = `${clienteMatch.id}/${Date.now()}-${pdf.name}`
        await supabase.storage.from('facturas').upload(pdfPath, pdf)
        filePath = pdfPath
        fileName = pdf.name
        xmlPathCol = xmlPath
        xmlNameCol = xml.name
      }

      const { error: insertError } = await supabase.from('invoices').insert({
        client_id: clienteMatch.id,
        order_id: orderId,
        tipo,
        fecha,
        monto,
        file_path: filePath,
        file_name: fileName,
        xml_path: xmlPathCol,
        xml_name: xmlNameCol,
        folio_fiscal: folioFiscal,
        factura_id: facturaIdRelacionada,
      })

      if (insertError) {
        await supabase.storage.from('facturas').remove([xmlPath, ...(xmlPathCol ? [filePath] : [])])
        results.push({ fileName: xml.name, status: 'error', message: 'Ya estaba registrado (mismo folio fiscal). No se duplicó.' })
        continue
      }

      if (tipo === 'complemento_pago' && orderId && monto) {
        await registrarPagoDeComplemento(supabase, orderId, monto, fecha, folioFiscal)
      }

      results.push({ fileName: xml.name, status: 'ok', clientName: clienteMatch.name })
    } catch (e: any) {
      results.push({ fileName: xml.name, status: 'error', message: e?.message || 'Error al leer el XML.' })
    }
  }

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  return results
}

export async function deleteInvoice(formData: FormData) {
  const supabase = createClient()
  const invoiceId = String(formData.get('invoiceId') || '')
  const filePath = String(formData.get('filePath') || '')
  const xmlPath = String(formData.get('xmlPath') || '')

  const pathsToRemove = [filePath, xmlPath].filter(Boolean)
  if (pathsToRemove.length > 0) {
    await supabase.storage.from('facturas').remove(pathsToRemove)
  }

  await supabase.from('invoices').delete().eq('id', invoiceId)

  revalidatePath('/admin/facturas')
}

// Liga TODO lo pendiente de un jalón:
// - facturas registradas sin pedido → les crea su pedido desde el XML guardado
// - complementos sin pedido → los liga a su factura/pedido y registra su pago
export async function reconciliarPendientes() {
  const supabase = createClient()
  let pedidosCreados = 0
  let complementosLigados = 0
  let sinResolver = 0

  // 1) facturas sin pedido
  const { data: facturasSinPedido } = await supabase
    .from('invoices')
    .select('*')
    .eq('tipo', 'factura')
    .is('order_id', null)

  for (const inv of facturasSinPedido || []) {
    const xmlPathToUse = inv.xml_path || (inv.file_name?.toLowerCase().endsWith('.xml') ? inv.file_path : null)
    if (!xmlPathToUse) { sinResolver++; continue }
    const { data: blob } = await supabase.storage.from('facturas').download(xmlPathToUse)
    if (!blob) { sinResolver++; continue }
    try {
      const factura = parseFacturaXML(await blob.text())
      if (!factura || factura.conceptos.length === 0) { sinResolver++; continue }
      const orderId = await crearPedidoDesdeConceptos(
        supabase,
        inv.client_id,
        factura.fecha,
        factura.total || inv.monto || 0,
        factura.conceptos,
        'Pedido generado automáticamente desde una factura ya registrada'
      )
      if (orderId) {
        await supabase.from('invoices').update({ order_id: orderId }).eq('id', inv.id)
        pedidosCreados++
      } else {
        sinResolver++
      }
    } catch {
      sinResolver++
    }
  }

  // 2) complementos sin pedido
  const { data: compsSinPedido } = await supabase
    .from('invoices')
    .select('*')
    .eq('tipo', 'complemento_pago')
    .is('order_id', null)

  for (const inv of compsSinPedido || []) {
    let facturaMatch: { id: string; order_id: string | null } | null = null

    if (inv.factura_id) {
      const { data } = await supabase.from('invoices').select('id, order_id').eq('id', inv.factura_id).maybeSingle()
      facturaMatch = data
    }

    if (!facturaMatch || !facturaMatch.order_id) {
      const xmlPathToUse = inv.xml_path || (inv.file_name?.toLowerCase().endsWith('.xml') ? inv.file_path : null)
      if (xmlPathToUse) {
        const { data: blob } = await supabase.storage.from('facturas').download(xmlPathToUse)
        if (blob) {
          try {
            const comp = parseComplementoPagoXML(await blob.text())
            const relacion = comp.pagosRelacionados[0]
            if (relacion?.idDocumentoRelacionado) {
              const { data } = await supabase
                .from('invoices')
                .select('id, order_id')
                .eq('tipo', 'factura')
                .eq('folio_fiscal', relacion.idDocumentoRelacionado)
                .maybeSingle()
              if (data) facturaMatch = data
            }
          } catch {
            // sin XML legible no hay forma de ligarlo automáticamente
          }
        }
      }
    }

    if (facturaMatch) {
      await supabase
        .from('invoices')
        .update({ factura_id: facturaMatch.id, order_id: facturaMatch.order_id })
        .eq('id', inv.id)
      if (facturaMatch.order_id && inv.monto) {
        await registrarPagoDeComplemento(supabase, facturaMatch.order_id, Number(inv.monto), inv.fecha, inv.folio_fiscal || '')
      }
      complementosLigados++
    } else {
      sinResolver++
    }
  }

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  redirect(
    '/admin/facturas?ok=' +
      encodeURIComponent(
        `Reconciliación: ${pedidosCreados} pedido(s) creados, ${complementosLigados} complemento(s) ligados` +
          (sinResolver > 0 ? `, ${sinResolver} sin resolver (revísalos manualmente).` : '.')
      )
  )
}

// Para una factura individual: crea su pedido desde el XML guardado.
export async function generarPedidoDesdeFactura(formData: FormData) {
  const supabase = createClient()
  const invoiceId = String(formData.get('invoiceId') || '')

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()

  if (!inv) {
    redirect('/admin/facturas?error=' + encodeURIComponent('Factura no encontrada.'))
  }
  if (inv!.order_id) {
    redirect('/admin/facturas?error=' + encodeURIComponent('Esta factura ya tiene un pedido asignado.'))
  }

  const xmlPathToUse = inv!.xml_path || (inv!.file_name?.toLowerCase().endsWith('.xml') ? inv!.file_path : null)
  if (!xmlPathToUse) {
    redirect('/admin/facturas?error=' + encodeURIComponent('Esta factura no tiene un XML guardado, no se puede generar el pedido.'))
  }

  const { data: xmlBlob, error: downloadError } = await supabase.storage.from('facturas').download(xmlPathToUse!)
  if (downloadError || !xmlBlob) {
    redirect('/admin/facturas?error=' + encodeURIComponent('No se pudo leer el XML guardado.'))
  }

  const xmlText = await xmlBlob!.text()

  let factura
  try {
    factura = parseFacturaXML(xmlText)
  } catch (e: any) {
    redirect('/admin/facturas?error=' + encodeURIComponent('No se pudo interpretar el XML: ' + (e?.message || e)))
  }

  if (!factura || factura.conceptos.length === 0) {
    redirect('/admin/facturas?error=' + encodeURIComponent('El XML no tiene conceptos (artículos) para crear el pedido.'))
  }

  const orderId = await crearPedidoDesdeConceptos(
    supabase,
    inv!.client_id,
    factura!.fecha,
    factura!.total || inv!.monto || 0,
    factura!.conceptos,
    'Pedido generado automáticamente desde una factura ya registrada'
  )

  if (!orderId) {
    redirect('/admin/facturas?error=' + encodeURIComponent('No se pudo crear el pedido.'))
  }

  await supabase.from('invoices').update({ order_id: orderId }).eq('id', invoiceId)

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  redirect(`/admin/pedidos/${orderId}`)
}

// Para un complemento individual: lo liga a su factura/pedido.
export async function reLigarComplemento(formData: FormData) {
  const supabase = createClient()
  const invoiceId = String(formData.get('invoiceId') || '')

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()

  if (!inv || inv.tipo !== 'complemento_pago') {
    redirect('/admin/facturas?error=' + encodeURIComponent('Registro no válido.'))
  }

  let facturaMatch: { id: string; order_id: string | null } | null = null

  if (inv!.factura_id) {
    const { data } = await supabase.from('invoices').select('id, order_id').eq('id', inv!.factura_id).maybeSingle()
    facturaMatch = data
  }

  if (!facturaMatch) {
    const xmlPathToUse = inv!.xml_path || (inv!.file_name?.toLowerCase().endsWith('.xml') ? inv!.file_path : null)
    if (xmlPathToUse) {
      const { data: xmlBlob } = await supabase.storage.from('facturas').download(xmlPathToUse)
      if (xmlBlob) {
        try {
          const xmlText = await xmlBlob.text()
          const comp = parseComplementoPagoXML(xmlText)
          const relacion = comp.pagosRelacionados[0]
          if (relacion?.idDocumentoRelacionado) {
            const { data } = await supabase
              .from('invoices')
              .select('id, order_id')
              .eq('tipo', 'factura')
              .eq('folio_fiscal', relacion.idDocumentoRelacionado)
              .maybeSingle()
            facturaMatch = data
          }
        } catch {
          // si el XML no se puede leer, seguimos y reportamos abajo
        }
      }
    }
  }

  if (!facturaMatch) {
    redirect('/admin/facturas?error=' + encodeURIComponent('No se encontró la factura relacionada con este complemento.'))
  }

  await supabase
    .from('invoices')
    .update({ factura_id: facturaMatch!.id, order_id: facturaMatch!.order_id })
    .eq('id', invoiceId)

  if (facturaMatch!.order_id && inv!.monto) {
    await registrarPagoDeComplemento(supabase, facturaMatch!.order_id, Number(inv!.monto), inv!.fecha, inv!.folio_fiscal || '')
  }

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  redirect(facturaMatch!.order_id ? `/admin/pedidos/${facturaMatch!.order_id}` : '/admin/facturas')
}

// Corrige en bloque la fecha de los pedidos para que coincida con la
// fecha de su factura.
export async function corregirFechasPedidos() {
  const supabase = createClient()

  const { data: facturas } = await supabase
    .from('invoices')
    .select('order_id, fecha')
    .eq('tipo', 'factura')
    .not('order_id', 'is', null)

  let corregidos = 0

  for (const f of facturas || []) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, created_at')
      .eq('id', f.order_id as string)
      .single()

    if (!order) continue

    const fechaActual = new Date(order.created_at).toISOString().slice(0, 10)
    if (fechaActual !== f.fecha) {
      await supabase.from('orders').update({ created_at: f.fecha }).eq('id', order.id)
      corregidos++
    }
  }

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  redirect('/admin/facturas?ok=' + encodeURIComponent(`Se corrigieron ${corregidos} pedido(s) con la fecha de su factura.`))
}
