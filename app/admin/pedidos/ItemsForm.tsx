'use client'

import { useState } from 'react'

type Item = { producto: string; cantidad: string; precio: string }

export default function ItemsForm() {
  const [items, setItems] = useState<Item[]>([{ producto: '', cantidad: '1', precio: '0' }])

  const total = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0)

  function update(idx: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }
  function addRow() {
    setItems((prev) => [...prev, { producto: '', cantidad: '1', precio: '0' }])
  }
  function removeRow(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  return (
    <div>
      <label>Artículos</label>
      <div className="space-y-2 mb-3">
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text" placeholder="Producto" name="producto"
              value={it.producto} onChange={(e) => update(idx, 'producto', e.target.value)}
              className="flex-[2]"
            />
            <input
              type="number" placeholder="Cant." name="cantidad" min={0} step="0.01"
              value={it.cantidad} onChange={(e) => update(idx, 'cantidad', e.target.value)}
              className="flex-1"
            />
            <input
              type="number" placeholder="Precio unit." name="precio" min={0} step="0.01"
              value={it.precio} onChange={(e) => update(idx, 'precio', e.target.value)}
              className="flex-1"
            />
            <span onClick={() => removeRow(idx)} className="text-stamp font-bold cursor-pointer px-2">✕</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="text-crate underline text-sm mb-4 font-mono">
        + agregar artículo
      </button>
      <div className="flex justify-between font-mono font-bold text-base border-t-2 border-ink pt-3 mb-4">
        <span>Total</span><span>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}
