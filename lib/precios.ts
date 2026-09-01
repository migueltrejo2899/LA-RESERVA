// ============================================================
// Precios por cliente
//
// Reglas del negocio (un solo lugar para no repetirlas):
//  1. Si el producto tiene PRECIO ESPECIAL para ese cliente, manda el
//     precio especial tal cual (ya es un precio negociado; no se le
//     vuelve a aplicar el descuento).
//  2. Si no tiene precio especial, se toma el precio general del
//     catálogo y se le aplica el DESCUENTO del cliente.
//  3. El descuento se guarda en profiles.descuento (0 a 100).
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
 * Resuelve los precios que le tocan a un cliente para un producto.
 * `producto` trae los precios generales, `especial` el registro de
 * client_prices (si existe) y `descuento` el porcentaje del cliente.
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
  }
}

/** "15%" / "12.5%" sin decimales inútiles. */
export function fmtDescuento(descuento: number): string {
  const d = normalizarDescuento(descuento)
  return (Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0$/, '')) + '%'
}
