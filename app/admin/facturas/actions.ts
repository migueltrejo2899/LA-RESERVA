'use server'

import { createClient } from '@/lib/supabase/server'
import { parseComplementoPagoXML } from '@/lib/cfdi'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Sube uno o varios complementos de pago (XML, y su PDF si lo subes junto con
// el mismo nombre de archivo) y los liga automáticamente a la factura que
// pagan, buscando el folio fiscal (UUID) que trae cada XML.
export async function uploadComplementosMasivo(formData: FormData) {
  const supabase = createClient()
  const files = formData.getAll('archivos') as File[]

  const validos = files.filter((f) => f && f.size > 0)

  if (validos.length === 0) {
    redirect('/admin/facturas?error=' + encodeURIComponent('Selecciona al menos un archivo XML.'))
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

  const ligados: string[] = []
  const noLigados: string[] = []
  const errores: string[] = []

  for (const [base, { xml, pdf }] of grupos) {
    if (!xml) {
      errores.push(`${base} (falta el XML)`)
      continue
    }

    try {
      const xmlText = await xml.text()
      const comp = parseComplementoPagoXML(xmlText)

      if (!comp.uuid) {
        errores.push(`${base} (sin UUID en el XML)`)
        continue
      }

      const { data: yaExiste } = await supabase
        .from('invoices')
        .select('id')
        .eq('uuid_cfdi', comp.uuid)
        .maybeSingle()

      if (yaExiste) {
        errores.push(`${base} (ya estaba registrado)`)
        continue
      }

      const relacion = comp.pagosRelacionados[0]
      if (!relacion?.idDocumentoRelacionado) {
        noLigados.push(base)
        continue
      }

      const { data: facturaMatch } = await supabase
        .from('invoices')
        .select('id, client_id, order_id')
        .eq('tipo', 'factura')
        .eq('uuid_cfdi', relacion.idDocumentoRelacionado)
        .maybeSingle()

      if (!facturaMatch) {
        noLigados.push(base)
        continue
      }

      const xmlPath = `${facturaMatch.client_id}/${Date.now()}-${xml.name}`
      await supabase.storage.from('facturas').upload(xmlPath, xml)

      let filePath = xmlPath
      let fileName = xml.name
      let xmlPathCol: string | null = null
      let xmlNameCol: string | null = null

      if (pdf) {
        const pdfPath = `${facturaMatch.client_id}/${Date.now()}-${pdf.name}`
        await supabase.storage.from('facturas').upload(pdfPath, pdf)
        filePath = pdfPath
        fileName = pdf.name
        xmlPathCol = xmlPath
        xmlNameCol = xml.name
      }

      await supabase.from('invoices').insert({
        client_id: facturaMatch.client_id,
        order_id: facturaMatch.order_id,
        tipo: 'complemento_pago',
        fecha: comp.fecha,
        monto: relacion.importePagado || comp.montoTotal,
        file_path: filePath,
        file_name: fileName,
        xml_path: xmlPathCol,
        xml_name: xmlNameCol,
        factura_id: facturaMatch.id,
        uuid_cfdi: comp.uuid,
      })

      ligados.push(base)
    } catch (e: any) {
      errores.push(`${base} (${e?.message || 'error al leer el XML'})`)
    }
  }

  const params = new URLSearchParams()
  if (ligados.length) params.set('ligados', String(ligados.length))
  if (noLigados.length) params.set('noligados', noLigados.join(', '))
  if (errores.length) params.set('errores', errores.join(' | '))

  revalidatePath('/admin/facturas')
  redirect(`/admin/facturas?${params.toString()}`)
}
