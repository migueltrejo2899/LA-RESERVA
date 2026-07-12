'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFacturaXML, parseComplementoPagoXML } from '@/lib/cfdi'
import { XMLParser } from 'fast-xml-parser'
import { revalidatePath } from 'next/cache'

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

// Sube uno o varios pares de archivos (XML + PDF con el mismo nombre base).
// Cada factura se asigna al cliente cuyo RFC coincida con el receptor del XML.
// Cada complemento de pago, además, se liga automáticamente a la factura que
// paga (buscando el folio fiscal relacionado dentro del propio XML).
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
            .select('id')
            .eq('tipo', 'factura')
            .eq('folio_fiscal', relacion.idDocumentoRelacionado)
            .maybeSingle()
          facturaIdRelacionada = facturaRelacionada?.id || null
        }
      } else {
        const factura = parseFacturaXML(xmlText)
        tipo = 'factura'
        fecha = factura.fecha
        monto = factura.total
        folioFiscal = factura.uuid
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
