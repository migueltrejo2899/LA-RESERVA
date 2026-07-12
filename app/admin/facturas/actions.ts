'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { XMLParser } from 'fast-xml-parser'

type ParsedCfdi = {
  rfc: string
  nombre: string
  fecha: string
  monto: number | null
  tipo: 'factura' | 'complemento_pago'
  folioFiscal: string | null
}

function parseCfdiXml(xmlText: string): ParsedCfdi | null {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
    const doc = parser.parse(xmlText)

    const comprobante = doc['cfdi:Comprobante'] || doc['Comprobante']
    if (!comprobante) return null

    const receptor = comprobante['cfdi:Receptor'] || comprobante['Receptor']
    const rfc = String(receptor?.Rfc || '').trim().toUpperCase()
    const nombre = String(receptor?.Nombre || '').trim()

    const fechaRaw = String(comprobante.Fecha || '')
    const fecha = fechaRaw.slice(0, 10) || new Date().toISOString().slice(0, 10)

    const tipoDeComprobante = String(comprobante.TipoDeComprobante || 'I')
    const tipo: 'factura' | 'complemento_pago' = tipoDeComprobante === 'P' ? 'complemento_pago' : 'factura'

    let monto: number | null = comprobante.Total ? Number(comprobante.Total) : null

    // Para complementos de pago, el monto real está dentro de pago20:Pagos
    if (tipo === 'complemento_pago') {
      const complemento = comprobante['cfdi:Complemento'] || comprobante['Complemento']
      const pagosNode = complemento?.['pago20:Pagos'] || complemento?.['Pagos']
      let pagoList = pagosNode?.['pago20:Pago'] || pagosNode?.['Pago']
      if (pagoList) {
        if (!Array.isArray(pagoList)) pagoList = [pagoList]
        const sum = pagoList.reduce((s: number, p: any) => s + Number(p?.Monto || 0), 0)
        if (sum > 0) monto = sum
      }
    }

    // UUID / folio fiscal, si ya viene timbrado
    const complemento = comprobante['cfdi:Complemento'] || comprobante['Complemento']
    const timbre = complemento?.['tfd:TimbreFiscalDigital'] || complemento?.['TimbreFiscalDigital']
    const folioFiscal = timbre?.UUID ? String(timbre.UUID) : null

    if (!rfc) return null

    return { rfc, nombre, fecha, monto, tipo, folioFiscal }
  } catch {
    return null
  }
}

export type UploadResult = {
  fileName: string
  status: 'ok' | 'sin_rfc_coincidente' | 'error'
  clientName?: string
  rfc?: string
  message?: string
}

export async function bulkUploadInvoices(formData: FormData): Promise<UploadResult[]> {
  const supabase = createClient()
  const files = formData.getAll('files') as File[]
  const results: UploadResult[] = []

  const { data: clients } = await supabase.from('profiles').select('id, name, rfc').eq('role', 'client')
  const clientsByRfc = new Map((clients || []).filter((c) => c.rfc).map((c) => [c.rfc!.toUpperCase(), c]))

  // Agrupar archivos por nombre base (sin extensión) para emparejar XML+PDF del mismo comprobante
  const groups = new Map<string, { xml?: File; pdf?: File }>()
  for (const file of files) {
    const dot = file.name.lastIndexOf('.')
    const base = dot > -1 ? file.name.slice(0, dot) : file.name
    const ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : ''
    const group = groups.get(base) || {}
    if (ext === 'xml') group.xml = file
    else if (ext === 'pdf') group.pdf = file
    groups.set(base, group)
  }

  for (const [base, group] of groups) {
    if (!group.xml) {
      results.push({ fileName: group.pdf?.name || base, status: 'error', message: 'No se encontró el XML correspondiente a este PDF.' })
      continue
    }

    const xmlText = await group.xml.text()
    const parsed = parseCfdiXml(xmlText)

    if (!parsed) {
      results.push({ fileName: group.xml.name, status: 'error', message: 'No se pudo leer este XML (¿es un CFDI válido?).' })
      continue
    }

    const client = clientsByRfc.get(parsed.rfc)
    if (!client) {
      results.push({ fileName: group.xml.name, status: 'sin_rfc_coincidente', rfc: parsed.rfc, message: `RFC ${parsed.rfc} (${parsed.nombre}) no coincide con ningún cliente registrado.` })
      continue
    }

    // Subir XML
    const xmlPath = `${client.id}/${Date.now()}-${group.xml.name}`
    await supabase.storage.from('facturas').upload(xmlPath, group.xml)

    // Subir PDF si viene
    let pdfPath: string | null = null
    let pdfName: string | null = null
    if (group.pdf) {
      pdfPath = `${client.id}/${Date.now()}-${group.pdf.name}`
      await supabase.storage.from('facturas').upload(pdfPath, group.pdf)
      pdfName = group.pdf.name
    }

    await supabase.from('invoices').insert({
      client_id: client.id,
      order_id: null,
      tipo: parsed.tipo,
      fecha: parsed.fecha,
      monto: parsed.monto,
      file_path: pdfPath || xmlPath,
      file_name: pdfName || group.xml.name,
      xml_path: xmlPath,
      xml_name: group.xml.name,
      folio_fiscal: parsed.folioFiscal,
    })

    results.push({ fileName: group.xml.name, status: 'ok', clientName: client.name, rfc: parsed.rfc })
  }

  revalidatePath('/admin/facturas')
  return results
}

export async function deleteInvoice(formData: FormData) {
  const supabase = createClient()
  const invoiceId = String(formData.get('invoiceId'))
  const filePath = String(formData.get('filePath'))
  const xmlPath = formData.get('xmlPath') ? String(formData.get('xmlPath')) : null

  // Borrar archivos del storage
  const pathsToDelete = [filePath]
  if (xmlPath && xmlPath !== filePath) pathsToDelete.push(xmlPath)
  await supabase.storage.from('facturas').remove(pathsToDelete)

  // Borrar registro de la base de datos
  await supabase.from('invoices').delete().eq('id', invoiceId)

  revalidatePath('/admin/facturas')
}
