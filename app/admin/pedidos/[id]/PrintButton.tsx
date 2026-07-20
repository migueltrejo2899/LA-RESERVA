'use client'

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn small">
      Imprimir
    </button>
  )
}
