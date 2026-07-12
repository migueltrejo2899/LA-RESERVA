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
// (TipoDeComprobante "P") y de qué RFC es el receptor, para poder
// decidir cómo procesarlo y a qué cliente asignarlo.
function inspeccionarXML(xmlText: string) {
  const parser = new XMLParser(parserOptions)
  const data = parser.parse(xmlText)
  const comprobante = data.Comprobante
  const tipoComprobante = comprobante?.['@_TipoDeComprobante'] || ''
  const rfcReceptor = String(comprobante?.Receptor?.['@_Rfc'] || '').toUpperCase()
  return { esComplemento: tipoComprobante === 'P', rfcReceptor }
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

// Sube uno o varios pares de archivos (XML + PDF con el mismo nombre base).
// Cada factura se asigna al cliente cuyo RFC coincida con el receptor del XML,
// y además se crea automáticamente su pedido con los artículos leídos del XML.
// Cada complemento de pago se liga automáticamente a la factura que paga.
export async function bulkUploadInvoices(formData: FormData): Promise<UploadResult[]> {
  const supabase = createClient()
  const files = formData.getAll('files') as File[]
  const validos = files.filter((f) => f && f.size > 0)

  if (validos.length === 0) {
    return [{ fileName: '(sin archivos)', status: 'error', message: 'No se seleccionó ningún archivo.' }]
  }

  // agrupar por nombre base (sin extensión) para emparejar XML con su PDF
  const grupos = new Map<string, { xml?: File; pdf?: File }>()
  for (const f of validos) {
    const dot = f.name.lastIndexOf('.')
    const base = dot > -1 ? f.name.slice(0, dot) : f.name
    const ext = dot > -1 ? f.name.slice(dot + 1).toLowerCase() : ''
    const grupo = grupos.get(base) || {}
    if (ext === 'xml') grupo.xml = f
    else if (ext === 'pdf') grupo.pdf = f
    grupos.set(base, grupo)
  }

  const { data: clients } = await supabase.from('profiles').select('id, name, rfc').eq('role', 'client')

  const results: UploadResult[] = []

  for (const [base, { xml, pdf }] of grupos) {
    if (!xml) {
      results.push({ fileName: base, status: 'error', message: 'Falta el archivo XML de este par.' })
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

      let tipo: 'factura' | 'complemento_pago' = 'factura'
      let fecha = ''
      let monto: number | null = null
      let folioFiscal = ''
      let facturaIdRelacionada: string | null = null
      let orderId: string | null = null

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
          // el complemento hereda el pedido de la factura que paga
          orderId = facturaRelacionada?.order_id || null
        }
      } else {
        const factura = parseFacturaXML(xmlText)
        tipo = 'factura'
        fecha = factura.fecha
        monto = factura.total
        folioFiscal = factura.uuid

        // crea automáticamente el pedido de esta factura, con sus artículos
        orderId = await crearPedidoDesdeConceptos(
          supabase,
          clienteMatch.id,
          factura.fecha,
          factura.total,
          factura.conceptos,
          'Pedido creado automáticamente al subir la factura'
        )
      }

      if (!folioFiscal) {
        results.push({ fileName: xml.name, status: 'error', message: 'No se encontró el folio fiscal (UUID) en el XML.' })
        continue
      }

      const { data: yaExiste } = await supabase
        .from('invoices')
        .select('id')
        .eq('folio_fiscal', folioFiscal)
        .maybeSingle()

      if (yaExiste) {
        results.push({ fileName: xml.name, status: 'error', message: 'Ya estaba registrado (mismo folio fiscal).' })
        continue
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

      await supabase.from('invoices').insert({
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

// Para facturas que ya estaban registradas ANTES de que existiera esta
// función (subidas sin generar su pedido): lee su XML ya guardado en el
// storage y crea el pedido retroactivamente.
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

// Para complementos de pago ya registrados que se quedaron sin pedido
// (por ejemplo, subidos antes de esta corrección): busca su factura
// relacionada (por factura_id, o re-leyendo el XML guardado si hace falta)
// y copia el pedido de esa factura al complemento.
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
          // si el XML no se puede leer, seguimos y reportamos abajo que no se encontró
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

  revalidatePath('/admin/facturas')
  revalidatePath('/admin/pedidos')
  redirect(facturaMatch!.order_id ? `/admin/pedidos/${facturaMatch!.order_id}` : '/admin/facturas')
}
