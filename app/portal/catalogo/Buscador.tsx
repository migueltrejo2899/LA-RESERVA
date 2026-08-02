'use client'

// Barra de búsqueda del catálogo: filtra los productos en vivo (sin
// recargar la página, así no se pierden las cantidades capturadas) y se
// queda fija arriba al deslizar.
export default function Buscador() {
  function filtrar(q: string) {
    const term = q
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    document.querySelectorAll<HTMLElement>('[data-buscar]').forEach((el) => {
      const texto = el.getAttribute('data-buscar') || ''
      el.style.display = !term || texto.includes(term) ? '' : 'none'
    })

    // esconder los encabezados de categoría que se quedaron sin productos visibles
    document.querySelectorAll<HTMLElement>('[data-grupo]').forEach((g) => {
      const hayVisible = Array.from(g.querySelectorAll<HTMLElement>('[data-buscar]')).some(
        (el) => el.style.display !== 'none'
      )
      g.style.display = hayVisible ? '' : 'none'
    })
  }

  return (
    <div className="no-print" style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: 16 }}>
      <input
        type="search"
        placeholder="Buscar producto por nombre, SKU o categoría…"
        onChange={(e) => filtrar(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 18px',
          borderRadius: 999,
          border: '1.5px solid #676F36',
          background: '#FFFFFF',
          fontSize: 15,
          color: '#2C2D31',
          boxShadow: '0 4px 16px rgba(44, 45, 49, 0.14)',
          outline: 'none',
        }}
      />
    </div>
  )
}
