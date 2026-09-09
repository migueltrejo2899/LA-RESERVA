import { fmtDescuento } from '@/lib/precios'
import { setDescuentosCategoria } from './actions'

// Formulario de descuentos por categoría de un cliente.
// Se usa igual en Clientes y en Catálogo → Precios por cliente.
export default function FormDescuentos({
  clientId,
  categorias,
  actuales,
  descuentoGeneral,
  volverA,
}: {
  clientId: string
  categorias: string[]
  /** categoría -> porcentaje ya guardado */
  actuales: Map<string, number>
  descuentoGeneral: number
  /** a dónde regresar después de guardar */
  volverA: string
}) {
  if (categorias.length === 0) {
    return (
      <p className="text-sm text-inksoft">
        Todavía no hay categorías en el catálogo. Créalas en Catálogo y aquí podrás
        ponerle un descuento distinto a cada una.
      </p>
    )
  }

  const conDescuento = categorias.filter((c) => (actuales.get(c) ?? 0) > 0)

  return (
    <form action={setDescuentosCategoria} className="field">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="volverA" value={volverA} />

      <p className="text-sm text-inksoft mb-3">
        El descuento de una categoría <strong>reemplaza</strong> al general en los productos de
        esa categoría (no se suman). Deja una categoría en 0 o vacía para que use el
        general{descuentoGeneral > 0 ? ` (${fmtDescuento(descuentoGeneral)})` : ' (hoy sin descuento)'}.
        Los productos con precio especial no llevan descuento.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        {categorias.map((cat) => {
          const actual = actuales.get(cat) ?? 0
          return (
            <div key={cat}>
              <label>{cat}</label>
              <input type="hidden" name="categoria" value={cat} />
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                name="descuento"
                defaultValue={actual > 0 ? actual : ''}
                placeholder="0"
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-4">
        <button className="btn small">Guardar descuentos por categoría</button>
        <span className="text-xs text-inksoft">
          {conDescuento.length === 0
            ? 'Ahora mismo todas las categorías usan el descuento general.'
            : `Con descuento propio: ${conDescuento
                .map((c) => `${c} ${fmtDescuento(actuales.get(c) || 0)}`)
                .join(' · ')}`}
        </span>
      </div>
    </form>
  )
}
