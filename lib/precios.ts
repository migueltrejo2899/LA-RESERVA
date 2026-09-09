// ============================================================
// Precios por cliente
//
// Reglas del negocio (un solo lugar para no repetirlas):
//  1. Si el producto tiene PRECIO ESPECIAL para ese cliente, manda el
//     precio especial tal cual (ya es un precio negociado; no se le
//     vuelve a aplicar ningún descuento).
//  2. Si no tiene precio especial, se toma el precio general del
//     catálogo y se le aplica el DESCUENTO que le toque:
//       · el de la CATEGORÍA del producto, si el cliente tiene uno
//         (tabla client_category_discounts), o
//       · si no, el descuento GENERAL del cliente (profiles.descuento).
//     El descuento de categoría REEMPLAZA al general, no se suman.
//  3. Los productos sin categoría usan el descuento general.
// ============================================================

export type PrecioEspecial = {
  precio_kilo?: number | null
  precio_caja?: number | null
} | null | undefined

export type PrecioResuelto = {
  /** precio final de menudeo (kilo o litro), ya con descuento */
  kilo: number | null
  /** precio final de mayoreo (caja), ya con descuento */
  caja: number | null
  /** precio de lista (sin descuento) — solo si hubo descuento */
  kiloLista: number | null
  cajaLista: number | null
  /** el cliente tiene precio especial en alguna presentación */
  tieneEspecial: boolean
  /** el precio de menudeo / de caja viene de un precio especial */
  especialKilo: boolean
  especialCaja: boolean
  /** se aplicó el descuento en alguna presentación */
  tieneDescuento: boolean
  /** porcentaje de descuento que se usó en este producto (0 si ninguno) */
  descuentoAplicado: number
}

/** Deja el descuento siempre dentro de 0-100. */
export function normalizarDescuento(descuento: unknown): number {
  const n = Number(descuento)
  if (!isFinite(n) || n <= 0) return 0
  return Math.min(100, Math.round(n * 100) / 100)
}

/** Aplica el descuento a un precio y redondea a centavos. */
export function aplicarDescuento(precio: number | null | undefined, descuento: number): number | null {
  if (precio == null || precio === ('' as any)) return null
  const base = Number(precio)
  if (!isFinite(base)) return null
  const d = normalizarDescuento(descuento)
  if (d === 0) return base
  return Math.round(base * (1 - d / 100) * 100) / 100
}

/**
 * Convierte los renglones de client_category_discounts en un mapa
 * categoría -> porcentaje, listo para usarse en las páginas.
 */
export function mapaDescuentosPorCategoria(
  filas: { categoria: string; descuento: number | string }[] | null | undefined
): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const f of filas || []) {
    if (!f?.categoria) continue
    const d = normalizarDescuento(f.descuento)
    if (d > 0) mapa.set(f.categoria, d)
  }
  return mapa
}

/**
 * Descuento que le toca a un producto: el de su categoría si existe,
 * si no el general del cliente.
 */
export function descuentoAplicable(
  categoria: string | null | undefined,
  descuentoGeneral: unknown,
  porCategoria?: Map<string, number> | null
): number {
  if (categoria && porCategoria) {
    const d = porCategoria.get(categoria)
    if (d != null) return normalizarDescuento(d)
  }
  return normalizarDescuento(descuentoGeneral)
}

/**
 * Resuelve los precios que le tocan a un cliente para un producto.
 * `descuento` ya debe venir resuelto (usa descuentoAplicable) o, más
 * cómodo, usa preciosDeClienteConCategorias.
 */
export function preciosDeCliente(
  producto: { precio_kilo?: number | null; precio_caja?: number | null },
  especial: PrecioEspecial,
  descuento: number
): PrecioResuelto {
  const d = normalizarDescuento(descuento)

  const espKilo = especial?.precio_kilo ?? null
  const espCaja = especial?.precio_caja ?? null

  const genKilo = producto.precio_kilo ?? null
  const genCaja = producto.precio_caja ?? null

  const kilo = espKilo != null ? Number(espKilo) : aplicarDescuento(genKilo, d)
  const caja = espCaja != null ? Number(espCaja) : aplicarDescuento(genCaja, d)

  const descuentoEnKilo = espKilo == null && genKilo != null && d > 0
  const descuentoEnCaja = espCaja == null && genCaja != null && d > 0

  return {
    kilo,
    caja,
    kiloLista: descuentoEnKilo ? Number(genKilo) : null,
    cajaLista: descuentoEnCaja ? Number(genCaja) : null,
    tieneEspecial: espKilo != null || espCaja != null,
    especialKilo: espKilo != null,
    especialCaja: espCaja != null,
    tieneDescuento: descuentoEnKilo || descuentoEnCaja,
    descuentoAplicado: descuentoEnKilo || descuentoEnCaja ? d : 0,
  }
}

/**
 * Igual que preciosDeCliente, pero resolviendo solo el descuento que
 * le toca al producto según su categoría. Es la que usan las páginas.
 */
export function preciosDeClienteConCategorias(
  producto: { precio_kilo?: number | null; precio_caja?: number | null; categoria?: string | null },
  especial: PrecioEspecial,
  descuentoGeneral: unknown,
  porCategoria?: Map<string, number> | null
): PrecioResuelto {
  return preciosDeCliente(
    producto,
    especial,
    descuentoAplicable(producto.categoria, descuentoGeneral, porCategoria)
  )
}

/** "15%" / "12.5%" sin decimales inútiles. */
export function fmtDescuento(descuento: number): string {
  const d = normalizarDescuento(descuento)
  return (Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0$/, '')) + '%'
}
