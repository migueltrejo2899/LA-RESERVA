// Utilidades para leer los XML de CFDI (facturas y complementos de pago del SAT)
// usando fast-xml-parser. Soporta CFDI 3.3 y 4.0 (ignora el prefijo de namespace,
// ej. "cfdi:Comprobante" se lee simplemente como "Comprobante").

import { XMLParser } from 'fast-xml-parser'

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function toDateOnly(fechaIso: string | undefined): string {
  return (fechaIso || '').slice(0, 10)
}

export type ConceptoCFDI = {
  producto: string
  cantidad: number
  precio: number
  importe: number
}

export type FacturaCFDI = {
  uuid: string
  fecha: string
  total: number
  subtotal: number
  conceptos: ConceptoCFDI[]
}

export type PagoRelacionado = {
  idDocumentoRelacionado: string
  importePagado: number
}

export type ComplementoPagoCFDI = {
  uuid: string
  fecha: string
  montoTotal: number
  pagosRelacionados: PagoRelacionado[]
}

// Lee una factura (CFDI de ingreso) y devuelve fecha, total y conceptos
// listos para crear un pedido con sus artículos.
export function parseFacturaXML(xml: string): FacturaCFDI {
  const parser = new XMLParser(parserOptions)
  const data = parser.parse(xml)
  const comprobante = data.Comprobante

  if (!comprobante) {
    throw new Error('El XML no parece un CFDI válido (no se encontró el nodo Comprobante).')
  }

  const uuid = comprobante.Complemento?.TimbreFiscalDigital?.['@_UUID'] || ''
  if (!uuid) {
    throw new Error('No se encontró el UUID (folio fiscal) en el XML. ¿Es el XML timbrado?')
  }

  const conceptos = toArray(comprobante.Conceptos?.Concepto).map((c: any) => ({
    producto: c['@_Descripcion'] || 'Producto',
    cantidad: Number(c['@_Cantidad'] || 0),
    precio: Number(c['@_ValorUnitario'] || 0),
    importe: Number(c['@_Importe'] || 0),
  }))

  return {
    uuid,
    fecha: toDateOnly(comprobante['@_Fecha']),
    total: Number(comprobante['@_Total'] || 0),
    subtotal: Number(comprobante['@_SubTotal'] || 0),
    conceptos,
  }
}

// Lee un complemento de pago (CFDI tipo "P") y devuelve, para cada factura
// que paga, el UUID relacionado y el importe pagado.
export function parseComplementoPagoXML(xml: string): ComplementoPagoCFDI {
  const parser = new XMLParser(parserOptions)
  const data = parser.parse(xml)
  const comprobante = data.Comprobante

  if (!comprobante) {
    throw new Error('El XML no parece un CFDI válido (no se encontró el nodo Comprobante).')
  }

  const uuid = comprobante.Complemento?.TimbreFiscalDigital?.['@_UUID'] || ''
  const pagos = toArray(comprobante.Complemento?.Pagos?.Pago)

  const pagosRelacionados: PagoRelacionado[] = []
  let fecha = ''
  let montoTotal = 0

  for (const pago of pagos) {
    if (!fecha) fecha = toDateOnly(pago['@_FechaPago'])
    montoTotal += Number(pago['@_MontoTotalPagos'] || pago['@_Monto'] || 0)

    for (const docto of toArray(pago.DoctoRelacionado)) {
      pagosRelacionados.push({
        idDocumentoRelacionado: docto['@_IdDocumento'] || '',
        importePagado: Number(docto['@_ImpPagado'] || 0),
      })
    }
  }

  if (!fecha) fecha = toDateOnly(comprobante['@_Fecha'])
  if (!montoTotal) montoTotal = Number(comprobante['@_Total'] || 0)

  return { uuid, fecha, montoTotal, pagosRelacionados }
}
