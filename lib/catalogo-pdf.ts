import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { fmtDescuento } from './precios'

export type FilaCatalogo = {
  sku: string
  nombre: string
  unidad: string | null
  /** "kilo" | "litro" */
  unidadMenudeo: string
  kilo: number | null
  caja: number | null
  kiloLista: number | null
  cajaLista: number | null
  /** el precio viene de un precio especial acordado con el cliente */
  especialKilo?: boolean
  especialCaja?: boolean
}

export type GrupoCatalogo = {
  nombre: string
  items: FilaCatalogo[]
}

export type DatosCatalogo = {
  cliente: string | null
  descuento: number
  grupos: GrupoCatalogo[]
}

// ---------- helpers ----------

// Las fuentes estándar del PDF usan WinAnsi (Latin-1). Cambiamos los
// caracteres tipográficos por su equivalente simple y quitamos lo que
// no exista en esa codificación (emojis, etc.) para que nunca truene.
function limpiar(texto: string): string {
  return String(texto ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .split('')
    .filter((c) => c.charCodeAt(0) < 256)
    .join('')
}

function money(n: number | null): string {
  if (n == null) return '-'
  const fijo = Math.abs(n).toFixed(2)
  const [ent, dec] = fijo.split('.')
  const conComas = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + conComas + '.' + dec
}

function fechaLarga(d = new Date()): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

/** Recorta el texto para que quepa en `ancho` puntos, con "..." al final. */
function recortar(texto: string, font: PDFFont, size: number, ancho: number): string {
  let t = limpiar(texto)
  if (font.widthOfTextAtSize(t, size) <= ancho) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > ancho) {
    t = t.slice(0, -1)
  }
  return t + '...'
}

// ---------- colores de la marca ----------
const TINTA = rgb(0.173, 0.176, 0.192)   // #2C2D31
const SUAVE = rgb(0.44, 0.43, 0.40)
const OLIVA = rgb(0.404, 0.435, 0.212)   // #676F36
const LINEA = rgb(0.797, 0.749, 0.643)   // #CBBFA4
const BANDA = rgb(0.968, 0.949, 0.906)

const ANCHO = 612
const ALTO = 792
const MARGEN = 40

export async function generarCatalogoPDF(datos: DatosCatalogo): Promise<Uint8Array> {
  const { cliente, descuento, grupos } = datos
  const conDescuento = descuento > 0

  const hayEspeciales = grupos.some((g) => g.items.some((i) => i.especialKilo || i.especialCaja))

  const pdf = await PDFDocument.create()
  pdf.setTitle('Catálogo LA RESERVA')
  pdf.setCreator('Portal LA RESERVA')

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const normal = await pdf.embedFont(StandardFonts.Helvetica)

  // Columnas: [x, ancho, alineación]
  const cols = conDescuento
    ? {
        sku: { x: MARGEN, w: 62 },
        nombre: { x: MARGEN + 66, w: 208 },
        mndLista: { x: MARGEN + 278, w: 62 },
        mnd: { x: MARGEN + 344, w: 66 },
        cajaLista: { x: MARGEN + 414, w: 62 },
        caja: { x: MARGEN + 480, w: 66 },
      }
    : {
        sku: { x: MARGEN, w: 76 },
        nombre: { x: MARGEN + 80, w: 258 },
        mndLista: null as any,
        mnd: { x: MARGEN + 342, w: 90 },
        cajaLista: null as any,
        caja: { x: MARGEN + 440, w: 92 },
      }

  let page: PDFPage = pdf.addPage([ANCHO, ALTO])
  let y = 0
  let numPagina = 0

  const derecha = (p: PDFPage, texto: string, col: { x: number; w: number }, yy: number, font: PDFFont, size: number, color = TINTA) => {
    const t = limpiar(texto)
    const ancho = font.widthOfTextAtSize(t, size)
    p.drawText(t, { x: col.x + col.w - ancho, y: yy, size, font, color })
  }

  const encabezadoTabla = () => {
    const size = 7.5
    page.drawRectangle({ x: MARGEN - 4, y: y - 4, width: ANCHO - MARGEN * 2 + 8, height: 16, color: BANDA })
    page.drawText('SKU', { x: cols.sku.x, y, size, font: bold, color: SUAVE })
    page.drawText('PRODUCTO', { x: cols.nombre.x, y, size, font: bold, color: SUAVE })
    if (conDescuento) {
      derecha(page, 'LISTA MND.', cols.mndLista, y, bold, size, SUAVE)
      derecha(page, 'TU PRECIO', cols.mnd, y, bold, size, SUAVE)
      derecha(page, 'LISTA CAJA', cols.cajaLista, y, bold, size, SUAVE)
      derecha(page, 'TU PRECIO', cols.caja, y, bold, size, SUAVE)
    } else {
      derecha(page, 'MENUDEO', cols.mnd, y, bold, size, SUAVE)
      derecha(page, 'CAJA', cols.caja, y, bold, size, SUAVE)
    }
    y -= 16
  }

  const nuevaPagina = (primera = false) => {
    if (!primera) page = pdf.addPage([ANCHO, ALTO])
    numPagina++
    y = ALTO - MARGEN

    if (primera) {
      page.drawText('LA RESERVA', { x: MARGEN, y: y - 18, size: 22, font: bold, color: TINTA })
      page.drawText('Catálogo de productos', { x: MARGEN, y: y - 34, size: 11, font: normal, color: SUAVE })
      derecha(page, fechaLarga(), { x: ANCHO - MARGEN - 220, w: 220 }, y - 18, normal, 9, SUAVE)
      y -= 52

      if (cliente) {
        page.drawText(limpiar(`Cliente: ${cliente}`), { x: MARGEN, y, size: 10, font: bold, color: TINTA })
        y -= 14
      }
      if (conDescuento) {
        page.drawText(
          limpiar(`Precios con tu descuento del ${fmtDescuento(descuento)} ya aplicado.`),
          { x: MARGEN, y, size: 9.5, font: bold, color: OLIVA }
        )
        y -= 13
      }
      if (hayEspeciales) {
        page.drawText(
          limpiar('* Precio especial acordado contigo (no lleva descuento adicional).'),
          { x: MARGEN, y, size: 8.5, font: normal, color: OLIVA }
        )
        y -= 12
      }
      page.drawText(
        limpiar('Menudeo = precio por kilo o litro. Caja = precio de mayoreo. Precios en pesos, sin IVA salvo indicación.'),
        { x: MARGEN, y, size: 8, font: normal, color: SUAVE }
      )
      y -= 18
      page.drawLine({
        start: { x: MARGEN, y: y + 4 },
        end: { x: ANCHO - MARGEN, y: y + 4 },
        thickness: 1,
        color: TINTA,
      })
      y -= 10
    } else {
      page.drawText('LA RESERVA', { x: MARGEN, y: y - 10, size: 11, font: bold, color: TINTA })
      derecha(page, limpiar(cliente ? `Catálogo · ${cliente}` : 'Catálogo de productos'), { x: ANCHO - MARGEN - 300, w: 300 }, y - 10, normal, 8.5, SUAVE)
      y -= 26
    }

    encabezadoTabla()
  }

  const espacio = (necesario: number) => {
    if (y - necesario < MARGEN + 24) nuevaPagina()
  }

  nuevaPagina(true)

  if (grupos.length === 0) {
    page.drawText(limpiar('Todavía no hay productos publicados en el catálogo.'), {
      x: MARGEN, y: y - 10, size: 10, font: normal, color: SUAVE,
    })
  }

  for (const g of grupos) {
    espacio(34)
    y -= 6
    page.drawText(limpiar(g.nombre.toUpperCase()), { x: MARGEN, y, size: 9, font: bold, color: OLIVA })
    y -= 4
    page.drawLine({
      start: { x: MARGEN, y },
      end: { x: ANCHO - MARGEN, y },
      thickness: 0.7,
      color: LINEA,
    })
    y -= 12

    for (const it of g.items) {
      espacio(16)
      const size = 8.5
      page.drawText(recortar(it.sku, normal, 7.5, cols.sku.w), { x: cols.sku.x, y, size: 7.5, font: normal, color: SUAVE })

      const etiquetaUnidad = it.unidad ? ` (${it.unidad})` : ''
      page.drawText(recortar(it.nombre + etiquetaUnidad, normal, size, cols.nombre.w), {
        x: cols.nombre.x, y, size, font: normal, color: TINTA,
      })

      const mnd = it.unidadMenudeo === 'litro' ? '/L' : '/kg'

      if (conDescuento) {
        if (it.kiloLista != null) {
          const t = money(it.kiloLista)
          derecha(page, t, cols.mndLista, y, normal, 8, SUAVE)
          const ancho = normal.widthOfTextAtSize(limpiar(t), 8)
          page.drawLine({
            start: { x: cols.mndLista.x + cols.mndLista.w - ancho, y: y + 2.6 },
            end: { x: cols.mndLista.x + cols.mndLista.w, y: y + 2.6 },
            thickness: 0.6,
            color: SUAVE,
          })
        }
        if (it.cajaLista != null) {
          const t = money(it.cajaLista)
          derecha(page, t, cols.cajaLista, y, normal, 8, SUAVE)
          const ancho = normal.widthOfTextAtSize(limpiar(t), 8)
          page.drawLine({
            start: { x: cols.cajaLista.x + cols.cajaLista.w - ancho, y: y + 2.6 },
            end: { x: cols.cajaLista.x + cols.cajaLista.w, y: y + 2.6 },
            thickness: 0.6,
            color: SUAVE,
          })
        }
      }

      const marcaKilo = it.especialKilo ? ' *' : ''
      const marcaCaja = it.especialCaja ? ' *' : ''
      derecha(page, it.kilo != null ? `${money(it.kilo)} ${mnd}${marcaKilo}` : '-', cols.mnd, y, bold, size, it.kilo != null ? TINTA : SUAVE)
      derecha(page, it.caja != null ? money(it.caja) + marcaCaja : '-', cols.caja, y, bold, size, it.caja != null ? TINTA : SUAVE)

      y -= 14
    }
    y -= 4
  }

  // pie de página en todas las hojas
  const paginas = pdf.getPages()
  paginas.forEach((p, i) => {
    p.drawText(
      limpiar('Precios sujetos a cambio sin previo aviso. Documento informativo, no es una factura.'),
      { x: MARGEN, y: MARGEN - 12, size: 7, font: normal, color: SUAVE }
    )
    const t = `${i + 1} / ${paginas.length}`
    const ancho = normal.widthOfTextAtSize(t, 7)
    p.drawText(t, { x: ANCHO - MARGEN - ancho, y: MARGEN - 12, size: 7, font: normal, color: SUAVE })
  })

  return await pdf.save()
}

/** Nombre de archivo seguro: "catalogo-la-reserva-abarrotes-el-sol.pdf" */
export function nombreArchivoCatalogo(cliente: string | null): string {
  const base = 'catalogo-la-reserva' + (cliente ? '-' + cliente : '')
  const slug = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${slug || 'catalogo'}.pdf`
}
